import http from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canAccessMatter, createSession, requirePermission, LEXY_PERMISSIONS } from './auth.mjs';
import { createSupabaseAuthConfig, createSupabaseSessionResolver, shouldUseSupabaseAuth } from './supabaseAuth.mjs';
import { createMatterRepository } from './repository.mjs';
import { createJsonFileStore, appendAuditEvent } from './persistence.mjs';
import { createDocumentGenerationRequest, createDocumentTemplate, renderDocumentArtifact, requestDocumentApproval } from './documents.mjs';
import { approveGate, rejectGate } from './gates.mjs';
import { createTask } from './tasks.mjs';
import { createFilingPacket, getFilingStatus, ingestFilingReceipt, requestFilingApproval, submitApprovedFiling, validateFilingPacket } from './filing.mjs';
import { answerWithCitations, createCorpusSearchBridge } from './corpus.mjs';
import { defineServiceRequirement, ingestProofOfService, markServiceSent, prepareServicePacket, requestServiceApproval } from './service.mjs';
import { createLocalMatterStorage } from './storage.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');
const defaultDataPath = resolve(projectRoot, 'data', 'lexyos.json');
const defaultSeedPath = resolve(projectRoot, 'data', 'seed.json');

export async function loadDefaultSeed(seedPath = defaultSeedPath) {
  try {
    return JSON.parse(await readFile(seedPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export function createLexyProductServer({ dataPath = process.env.LEXYOS_DATA_PATH ?? defaultDataPath, seed = {}, publicDir = resolve(projectRoot, 'public'), sessionResolver = null, storageAdapter = null, auth = null } = {}) {
  const app = createLexyProductApp({ dataPath, seed, publicDir, sessionResolver, storageAdapter, auth });
  const server = http.createServer((request, response) => app.handleHttp(request, response));
  return { server, app };
}

export function createLexyProductApp({ dataPath = defaultDataPath, seed = {}, publicDir = resolve(projectRoot, 'public'), sessionResolver = null, storageAdapter = null, auth = null } = {}) {
  const store = createJsonFileStore({ path: dataPath, seed });
  const repository = createMatterRepository({ store });
  const storage = storageAdapter ?? createLocalMatterStorage({ store });
  const authConfig = createSupabaseAuthConfig({ ...(auth ?? {}), tenants: seed.tenants ?? [] });
  const resolveSession = sessionResolver ?? (shouldUseSupabaseAuth(authConfig)
    ? createSupabaseSessionResolver({ ...authConfig, tenants: seed.tenants ?? [], fetchImpl: auth?.fetchImpl ?? globalThis.fetch })
    : createStoreBackedSessionResolver(store));

  async function handleApi(method, pathname, body = {}, context = {}) {
    try {
      return await handleApiInner(method, pathname, body, context);
    } catch (error) {
      return errorResult(error);
    }
  }

  async function handleApiInner(method, pathname, body = {}, context = {}) {
    const segments = pathname.split('/').filter(Boolean).slice(1); // drop api

    if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
      return ok({ status: 'ok', dataPath, product: 'LexyOS local backend' });
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'auth' && segments[1] === 'config') {
      return ok(publicAuthConfig(authConfig));
    }

    const session = context.session ?? await resolveSession({ ...context, store });
    if (!session) throw httpError(401, 'unauthorized');

    if (method === 'GET' && segments.length === 1 && segments[0] === 'matters') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      return ok((await repository.listMatters()).filter((matter) => canAccessMatter(session, matter)));
    }
    if (method === 'POST' && segments.length === 1 && segments[0] === 'matters') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_WRITE);
      const input = { ...body, id: body.id ?? body.matter_id ?? `matter_${randomUUID()}` };
      if (!canAccessMatter(session, input)) throw httpError(403, 'matter_forbidden');
      const matter = await repository.saveMatter(input);
      await audit('matter.upserted', matter.id, { source: 'api' });
      return created(matter);
    }
    if (method === 'GET' && segments.length === 3 && segments[0] === 'matters' && segments[2] === 'files') {
      const matterId = decodeURIComponent(segments[1]);
      const matter = await requireMatter(matterId, session);
      return ok(await storage.listMatterFiles(matter));
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'matters' && segments[2] === 'files') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_WRITE);
      const matterId = decodeURIComponent(segments[1]);
      const matter = await requireMatter(matterId, session);
      const result = await storage.requestUpload({ matter, file: { id: body.id ?? `file_${randomUUID()}`, ...body } });
      if (!result.ok) return { status: 503, body: { error: result.reason ?? 'storage_upload_failed', provider: storage.provider ?? 'unknown' } };
      await audit('file.upserted', matterId, { fileId: result.file?.id ?? body.id, provider: storage.provider ?? result.provider ?? 'unknown' });
      return created(result.file ?? result);
    }
    if (method === 'GET' && segments.length === 4 && segments[0] === 'matters' && segments[2] === 'files' && segments[3] === 'download') {
      const matterId = decodeURIComponent(segments[1]);
      const matter = await requireMatter(matterId, session);
      const fileId = body.fileId ?? context.query?.get?.('fileId') ?? context.query?.fileId;
      const result = await storage.requestDownload({ matter, fileId });
      if (!result.ok) return { status: 404, body: { error: result.reason ?? 'file_download_failed', provider: storage.provider ?? 'unknown' } };
      await audit('file.downloaded', matterId, { fileId, provider: storage.provider ?? result.provider ?? 'unknown' });
      return ok(result);
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'document-requests') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      const ids = await accessibleMatterIds(session);
      return ok((await store.all('documents')).filter((document) => document.kind === 'document_request' && ids.has(document.matterId)));
    }
    if (method === 'POST' && segments.length === 1 && segments[0] === 'document-requests') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_WRITE);
      const matter = await requireMatter(body.matterId, session);
      const template = createDocumentTemplate(body.template ?? defaultDocumentTemplate());
      const request = { ...createDocumentGenerationRequest({ template, matter, requestedBy: body.requestedBy ?? 'local-agent' }), kind: 'document_request', template };
      await store.upsert('documents', request);
      const gate = requestDocumentApproval(request);
      await store.upsert('gates', gate);
      await audit('document.requested', matter.id, { requestId: request.id, gateId: gate.id });
      return created({ request, gate });
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'document-requests' && segments[2] === 'artifacts') {
      const requestId = decodeURIComponent(segments[1]);
      const request = await requireRow('documents', requestId, 'document_request_not_found');
      const matter = await requireMatter(request.matterId, session);
      const artifact = { ...renderDocumentArtifact({ request, template: request.template, matter }), kind: 'artifact', sourceRequestId: request.id };
      await store.upsert('documents', artifact);
      await audit('document.artifact.rendered', matter.id, { requestId, artifactId: artifact.id });
      return created(artifact);
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'gates') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      const ids = await accessibleMatterIds(session);
      return ok((await store.all('gates')).filter((gate) => !gate.matterId || ids.has(gate.matterId)));
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'gates' && ['approve', 'reject'].includes(segments[2])) {
      requirePermission(session, LEXY_PERMISSIONS.GATE_DECIDE);
      const gateId = decodeURIComponent(segments[1]);
      const gate = await requireRow('gates', gateId, 'gate_not_found');
      const matter = gate.matterId ? await requireMatter(gate.matterId, session) : null;
      const decided = segments[2] === 'approve'
        ? approveGate(gate, { session, matter, reason: body.reason ?? '' })
        : rejectGate(gate, { session, matter, reason: body.reason ?? 'rejected' });
      await store.upsert('gates', decided);
      const affectedTasks = await applyGateDecisionToTasks(decided, body.reason ?? '');
      await audit(`gate.${decided.status}`, gate.matterId, { gateId, reason: body.reason ?? '', affectedTaskIds: affectedTasks.map((task) => task.id) });
      return ok(decided);
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'tasks') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      const ids = await accessibleMatterIds(session);
      return ok((await store.all('tasks')).filter((task) => !task.matterId || ids.has(task.matterId)));
    }
    if (method === 'POST' && segments.length === 1 && segments[0] === 'tasks') {
      requirePermission(session, LEXY_PERMISSIONS.TASK_RUN);
      if (body.matterId) await requireMatter(body.matterId, session);
      const task = createTask({ id: body.id ?? `task_${randomUUID()}`, matterId: body.matterId, title: body.title, kind: body.kind, assignedTo: body.assignedTo, requiresGate: body.requiresGate, gateId: body.gateId ?? null, prerequisites: body.prerequisites ?? [], payload: body.payload ?? {} });
      const gateDecision = body.requiresGate ? await findExistingGateDecision({ matterId: body.matterId, requiresGate: body.requiresGate, gateId: body.gateId ?? null }) : null;
      const persistedTask = {
        ...task,
        ...body,
        id: task.id,
        ...(gateDecision ? {
          status: gateDecision.status === 'approved' ? 'approved' : 'blocked',
          gateDecision: {
            gateId: gateDecision.id,
            gateStatus: gateDecision.status,
            decidedAt: gateDecision.decidedAt,
            reason: gateDecision.reason ?? '',
          },
        } : {}),
      };
      await store.upsert('tasks', persistedTask);
      await audit('task.created', body.matterId ?? null, { taskId: task.id, requiresGate: body.requiresGate ?? null, gateDecisionApplied: Boolean(gateDecision) });
      return created(persistedTask);
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'audit-events') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      const ids = await accessibleMatterIds(session);
      return ok((await store.all('auditEvents')).filter((event) => !event.matterId || ids.has(event.matterId)));
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'filing-packets') {
      requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
      const ids = await accessibleMatterIds(session);
      return ok((await store.all('filingPackets')).filter((packet) => ids.has(packet.matterId)));
    }
    if (method === 'POST' && segments.length === 1 && segments[0] === 'filing-packets') {
      requirePermission(session, LEXY_PERMISSIONS.FILING_PREPARE);
      await requireMatter(body.matterId, session);
      const packet = createFilingPacket({ id: body.id ?? `filing_${randomUUID()}`, matterId: body.matterId, jurisdiction: body.jurisdiction, filingType: body.filingType, documents: body.documents ?? [], filingFee: body.filingFee, serviceRequirements: body.serviceRequirements ?? [], createdBy: body.createdBy ?? 'local-agent' });
      const validation = validateFilingPacket(packet, body.requirements ?? {});
      const gate = requestFilingApproval(packet);
      await store.upsert('filingPackets', packet);
      await store.upsert('gates', gate);
      await audit('filing.packet.prepared', packet.matterId, { packetId: packet.id, gateId: gate.id, valid: validation.ok });
      return created({ packet, validation, gate, status: getFilingStatus(packet) });
    }
    if (method === 'GET' && segments.length === 3 && segments[0] === 'filing-packets' && segments[2] === 'status') {
      const packet = await requireRow('filingPackets', decodeURIComponent(segments[1]), 'filing_packet_not_found');
      await requireMatter(packet.matterId, session);
      return ok(getFilingStatus(packet));
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'filing-packets' && segments[2] === 'submit') {
      requirePermission(session, LEXY_PERMISSIONS.FILING_SUBMIT);
      const packet = await requireRow('filingPackets', decodeURIComponent(segments[1]), 'filing_packet_not_found');
      const matter = await requireMatter(packet.matterId, session);
      const gate = (await store.all('gates')).find((item) => item.action === `submit_filing:${packet.id}` && item.status === 'approved');
      const submitted = submitApprovedFiling(packet, { gate, session, matter, validation: validateFilingPacket(packet, body.requirements ?? {}) });
      const receipted = ingestFilingReceipt(submitted, submitted.submitted);
      await store.upsert('filingPackets', receipted);
      await audit('filing.packet.submitted', packet.matterId, { packetId: packet.id, receiptId: submitted.submitted.receiptId });
      return ok({ packet: receipted, status: getFilingStatus(receipted) });
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'corpus' && segments[1] === 'search') {
      requirePermission(session, LEXY_PERMISSIONS.CORPUS_QUERY);
      const sources = await store.all('corpusSources');
      const bridge = createCorpusSearchBridge({ sources });
      const result = bridge.search({ query: body.query, scope: body.scope ?? {}, limit: body.limit ?? 10 });
      const answer = answerWithCitations({ question: body.query, sources, scope: body.scope ?? {} });
      await audit(answer.supported ? 'corpus.search.supported' : 'corpus.search.refused', body.scope?.matterId ?? null, { query: body.query, citations: result.citations.length });
      return ok({ ...result, supported: answer.supported, answer: answer.answer });
    }

    if (method === 'POST' && segments.length === 1 && segments[0] === 'service-packets') {
      requirePermission(session, LEXY_PERMISSIONS.SERVICE_MANAGE);
      const matter = await requireMatter(body.matterId, session);
      const requirement = defineServiceRequirement(body.requirement ?? {});
      const packet = prepareServicePacket({ id: body.id ?? `service_${randomUUID()}`, matter, requirement, documents: body.documents ?? [], recipient: body.recipient, vendor: body.vendor ?? null });
      const gate = requestServiceApproval(packet);
      await store.upsert('servicePackets', packet);
      await store.upsert('gates', gate);
      await audit('service.packet.prepared', matter.id, { packetId: packet.id, gateId: gate.id });
      return created({ packet, gate });
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'service-packets' && segments[2] === 'send') {
      requirePermission(session, LEXY_PERMISSIONS.SERVICE_MANAGE);
      const packet = await requireRow('servicePackets', decodeURIComponent(segments[1]), 'service_packet_not_found');
      const matter = await requireMatter(packet.matterId, session);
      const gate = (await store.all('gates')).find((item) => item.action === `send_service:${packet.id}` && item.status === 'approved');
      const sent = markServiceSent(packet, { gate, session, matter, vendor: body.vendor, trackingId: body.trackingId });
      await store.upsert('servicePackets', sent);
      await store.append('serviceEvents', { matterId: packet.matterId, packetId: packet.id, action: 'sent', trackingId: body.trackingId });
      await audit('service.packet.sent', packet.matterId, { packetId: packet.id, trackingId: body.trackingId });
      return ok(sent);
    }
    if (method === 'POST' && segments.length === 3 && segments[0] === 'service-packets' && segments[2] === 'proof') {
      requirePermission(session, LEXY_PERMISSIONS.SERVICE_MANAGE);
      const packet = await requireRow('servicePackets', decodeURIComponent(segments[1]), 'service_packet_not_found');
      await requireMatter(packet.matterId, session);
      const result = ingestProofOfService({ packet, proofDocument: body.proofDocument, extracted: body.extracted ?? {} });
      await store.upsert('servicePackets', result.packet);
      await store.upsert('gates', result.gate);
      await store.append('serviceEvents', { matterId: packet.matterId, packetId: packet.id, action: 'proof_received', proofDocument: body.proofDocument });
      await audit('service.proof.received', packet.matterId, { packetId: packet.id, gateId: result.gate.id });
      return created(result);
    }

    return notFound();
  }

  async function accessibleMatterIds(session) {
    return new Set((await repository.listMatters()).filter((matter) => canAccessMatter(session, matter)).map((matter) => matter.id));
  }

  async function requireMatter(matterId, session) {
    const matter = (await repository.listMatters()).find((item) => item.id === matterId);
    if (!matter) throw httpError(404, 'matter_not_found');
    if (!canAccessMatter(session, matter)) throw httpError(403, 'matter_forbidden');
    return matter;
  }

  async function requireRow(collection, id, code) {
    const row = await store.get(collection, id);
    if (!row) throw httpError(404, code);
    return row;
  }

  async function findExistingGateDecision({ matterId, requiresGate, gateId = null }) {
    return (await store.all('gates')).find((gate) => gate.matterId === matterId && gateMatchesTaskGate(gate, { requiresGate, gateId }) && ['approved', 'rejected'].includes(gate.status)) ?? null;
  }

  function gateMatchesTaskGate(gate, task) {
    if (task.gateId) return gate.id === task.gateId;
    return [gate.type, gate.action].includes(task.requiresGate);
  }

  async function applyGateDecisionToTasks(gate, reason = '') {
    const tasks = await store.all('tasks');
    const nextStatus = gate.status === 'approved' ? 'approved' : gate.status === 'rejected' ? 'blocked' : null;
    if (!nextStatus) return [];
    const affected = tasks.filter((task) => task.matterId === gate.matterId && gateMatchesTaskGate(gate, task));
    for (const task of affected) {
      await store.upsert('tasks', {
        ...task,
        status: nextStatus,
        gateDecision: {
          gateId: gate.id,
          gateStatus: gate.status,
          decidedAt: gate.decidedAt,
          reason,
        },
      });
    }
    return affected;
  }

  async function audit(action, matterId = null, metadata = {}) {
    return appendAuditEvent(store, { actor: 'local-backend', actorType: 'system', source: 'api', action, matterId, metadata });
  }

  async function handleHttp(request, response) {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const body = await parseJsonBody(request);
        return sendJson(response, await handleApi(request.method, url.pathname, body, { request, headers: request.headers, query: url.searchParams }));
      }
      return serveStatic(publicDir, url.pathname, response);
    } catch (error) {
      return sendJson(response, { status: error.status ?? 500, body: { error: error.code ?? 'internal_error', message: error.message } });
    }
  }

  return { handleApi, handleHttp, store, repository };
}

function defaultDocumentTemplate() {
  return { id: 'qdro-draft', name: 'QDRO Draft', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] };
}

export function createStoreBackedSessionResolver(store) {
  return async function resolveStoreBackedSession({ headers = {}, request = null } = {}) {
    const token = bearerToken(headers, request) ?? headerValue(headers, 'x-lexyos-session-id', request);
    if (!token) return null;
    const row = await store.get('sessions', token);
    if (!row || row.revokedAt) return null;
    if (row.session) return row.session;
    const user = await store.get('users', row.userId);
    if (!user) return null;
    return createSession({ user, tenantId: row.tenantId, provider: row.provider ?? 'session', issuedAt: row.issuedAt ?? new Date().toISOString() });
  };
}

function bearerToken(headers, request = null) {
  const authorization = headerValue(headers, 'authorization', request);
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function headerValue(headers, name, request = null) {
  if (headers?.get) return headers.get(name);
  if (request?.headers?.[name]) return request.headers[name];
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = found?.[1];
  return Array.isArray(value) ? value[0] : value ?? null;
}

async function parseJsonBody(request) {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return {};
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function serveStatic(publicDir, pathname, response) {
  const withoutLegacyPrefix = pathname.startsWith('/public/') ? pathname.slice('/public'.length) : pathname;
  const requested = withoutLegacyPrefix === '/' ? '/index.html' : withoutLegacyPrefix;
  const fullPath = normalize(resolve(publicDir, `.${requested}`));
  if (!fullPath.startsWith(resolve(publicDir))) return sendText(response, 403, 'forbidden');
  try {
    const data = await readFile(fullPath);
    response.writeHead(200, { 'content-type': mimeType(fullPath) });
    response.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') return sendText(response, 404, 'not found');
    throw error;
  }
}

function mimeType(pathname) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }[extname(pathname)] ?? 'application/octet-stream';
}

function sendJson(response, result) {
  response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(result.body, null, 2)}\n`);
}

function sendText(response, status, body) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function ok(body) { return { status: 200, body }; }
function publicAuthConfig(authConfig) {
  return {
    mode: authConfig.mode,
    supabaseUrl: authConfig.supabaseUrl,
    anonKey: authConfig.anonKey,
    redirectTo: authConfig.redirectTo,
    providers: authConfig.providers,
    products: authConfig.products,
  };
}
function created(body) { return { status: 201, body }; }
function notFound() { return { status: 404, body: { error: 'not_found' } }; }
function errorResult(error) {
  if (error.status === 401) return { status: 401, body: { error: error.code ?? 'unauthorized' } };
  if (error.status) return { status: error.status, body: { error: error.code ?? 'error', message: error.message } };
  if (/permission denied|requires authorized session|cannot access|requires .*role|matter_forbidden|gate requires|approved human gate required|matter mismatch/i.test(error.message)) {
    return { status: 403, body: { error: 'forbidden', message: error.message } };
  }
  return { status: 500, body: { error: 'internal_error', message: error.message } };
}
function httpError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = await loadDefaultSeed();
  const port = Number(process.env.PORT ?? 5174);
  const host = process.env.HOST ?? '127.0.0.1';
  const { server } = createLexyProductServer({ seed });
  server.listen(port, host, () => {
    console.log(`LexyOS local backend listening at http://${host}:${port}`);
    console.log(`Data file: ${process.env.LEXYOS_DATA_PATH ?? defaultDataPath}`);
  });
}
