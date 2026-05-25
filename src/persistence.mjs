import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const LEXY_COLLECTIONS = Object.freeze([
  'tenants',
  'users',
  'sessions',
  'matters',
  'parties',
  'facts',
  'documents',
  'tasks',
  'gates',
  'filingPackets',
  'filingEvents',
  'servicePackets',
  'serviceEvents',
  'corpusSources',
  'corpusChunks',
  'corpusCitations',
  'communications',
  'deadlines',
  'agentRuns',
  'agentToolCalls',
  'auditEvents',
]);

export function createInMemoryStore(seed = {}) {
  const state = normalizeState(seed);
  return createStoreFacade({
    async load() { return structuredClone(state); },
    async save(next) {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, normalizeState(next));
      return structuredClone(state);
    },
  });
}

export function createJsonFileStore({ path, seed = {} }) {
  if (!path) throw new Error('json store path is required');
  return createStoreFacade({
    async load() {
      try {
        return normalizeState(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error.code === 'ENOENT') return normalizeState(seed);
        throw error;
      }
    },
    async save(next) {
      const normalized = normalizeState(next);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`);
      await rename(tmp, path);
      return normalized;
    },
  });
}

function createStoreFacade(adapter) {
  return {
    async all(collection) {
      ensureCollection(collection);
      return (await adapter.load())[collection];
    },
    async get(collection, id) {
      ensureCollection(collection);
      return (await adapter.load())[collection].find((row) => row.id === id) ?? null;
    },
    async upsert(collection, row) {
      ensureCollection(collection);
      if (!row?.id) throw new Error('row id is required');
      const state = await adapter.load();
      const index = state[collection].findIndex((item) => item.id === row.id);
      const stamped = { ...row, updatedAt: new Date().toISOString() };
      if (index === -1) state[collection].push({ ...stamped, createdAt: stamped.createdAt ?? stamped.updatedAt });
      else state[collection][index] = { ...state[collection][index], ...stamped };
      await adapter.save(state);
      return stamped;
    },
    async append(collection, row) {
      ensureCollection(collection);
      const state = await adapter.load();
      const stamped = { id: row.id ?? randomUUID(), ...row, createdAt: row.createdAt ?? new Date().toISOString() };
      state[collection].push(stamped);
      await adapter.save(state);
      return stamped;
    },
    async snapshot() {
      return adapter.load();
    },
  };
}

export async function appendAuditEvent(store, event) {
  const prior = (await store.all('auditEvents')).at(-1) ?? null;
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const body = {
    id: event.id ?? randomUUID(),
    occurredAt,
    actor: event.actor ?? 'system',
    actorType: event.actorType ?? 'system',
    source: event.source ?? 'lexyos',
    action: event.action,
    matterId: event.matterId ?? null,
    metadata: event.metadata ?? {},
    previousHash: prior?.hash ?? null,
  };
  body.hash = hashAuditEvent(body);
  return store.append('auditEvents', body);
}

export function verifyAuditChain(events = []) {
  let previousHash = null;
  for (const event of events) {
    if (event.previousHash !== previousHash) return { ok: false, failedEventId: event.id, reason: 'previous_hash_mismatch' };
    if (event.hash !== hashAuditEvent({ ...event, hash: undefined, createdAt: undefined, updatedAt: undefined })) return { ok: false, failedEventId: event.id, reason: 'hash_mismatch' };
    previousHash = event.hash;
  }
  return { ok: true, count: events.length };
}

function normalizeState(seed = {}) {
  const state = {};
  for (const collection of LEXY_COLLECTIONS) state[collection] = Array.isArray(seed[collection]) ? [...seed[collection]] : [];
  return state;
}

function ensureCollection(collection) {
  if (!LEXY_COLLECTIONS.includes(collection)) throw new Error(`unknown Lexy collection: ${collection}`);
}

function hashAuditEvent(event) {
  const canonical = JSON.stringify({
    id: event.id,
    occurredAt: event.occurredAt,
    actor: event.actor,
    actorType: event.actorType,
    source: event.source,
    action: event.action,
    matterId: event.matterId ?? null,
    metadata: event.metadata ?? {},
    previousHash: event.previousHash ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
