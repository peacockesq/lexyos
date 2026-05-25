import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createLexyProductServer } from '../src/server.mjs';

async function withServer(t) {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-product-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const dataPath = join(dir, 'lexyos.json');
  const seed = {
    users: [{ id: 'local-owner', email: 'local-owner@lexyos.test', memberships: [{ tenantId: 'peacock', roles: ['owner'], globalMatterAccess: true }] }],
    sessions: [{ id: 'local-dev-owner', userId: 'local-owner', tenantId: 'peacock', provider: 'test' }],
    matters: [{ id: 'Q-1', matter_id: 'Q-1', tenantId: 'peacock', client_display_name: 'Jane Doe', matter_type: 'QDRO', stage: 'drafting', drive_folder_id: 'drive-q1', baseline_data: { plan_name: 'Fidelity 401(k)', case_number: 'FA-2026-1', jurisdiction: 'CT' } }],
    documents: [{ id: 'file-1', matterId: 'Q-1', name: 'Judgment.pdf', type: 'judgment', mimeType: 'application/pdf' }],
    corpusSources: [{ id: 'corp-1', title: 'QDRO Memo', jurisdiction: 'CT', practiceArea: 'family_qdro', sourceType: 'firm_memo', text: 'QDRO drafts require plan identity and judgment review before filing.' }],
  };
  const { server } = createLexyProductServer({ dataPath, seed });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-lexyos-session-id': 'local-dev-owner', ...(options.headers ?? {}) },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    const body = await response.json();
    return { status: response.status, body };
  }
  return { api, dataPath };
}

test('HTTP product backend persists matter, file, task, gate, audit, and generated artifact workflows', async (t) => {
  const { api, dataPath } = await withServer(t);

  const createdMatter = await api('/api/matters', { method: 'POST', body: { id: 'Q-2', matter_id: 'Q-2', tenantId: 'peacock', client_display_name: 'Persistent Client', matter_type: 'QDRO', stage: 'intake', baseline_data: { plan_name: 'Vanguard', case_number: 'FA-2', jurisdiction: 'CT' } } });
  assert.equal(createdMatter.status, 201);

  const createdFile = await api('/api/matters/Q-2/files', { method: 'POST', body: { id: 'file-q2', name: 'Plan Document.pdf', type: 'plan_document', mimeType: 'application/pdf' } });
  assert.equal(createdFile.status, 201);

  const docRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-2', template: { id: 'qdro-draft', name: 'QDRO Draft', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  assert.equal(docRequest.status, 201);
  assert.equal(docRequest.body.request.status, 'ready_for_generation');
  assert.equal(docRequest.body.gate.status, 'pending');

  const gateDecision = await api(`/api/gates/${docRequest.body.gate.id}/approve`, { method: 'POST', body: { reason: 'attorney approved draft generation' } });
  assert.equal(gateDecision.status, 200);
  assert.equal(gateDecision.body.status, 'approved');

  const artifact = await api(`/api/document-requests/${docRequest.body.request.id}/artifacts`, { method: 'POST' });
  assert.equal(artifact.status, 201);
  assert.match(artifact.body.content, /Vanguard/);

  const task = await api('/api/tasks', { method: 'POST', body: { id: 'task-q2-review', matterId: 'Q-2', title: 'Review generated QDRO', requiresGate: docRequest.body.gate.action } });
  assert.equal(task.status, 201);

  const rejectedRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-2', template: { id: 'qdro-reject-check', name: 'QDRO Reject Check', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  await api('/api/tasks', { method: 'POST', body: { id: 'task-q2-rejected-review', matterId: 'Q-2', title: 'Rejected draft review', requiresGate: rejectedRequest.body.gate.action } });
  const rejectedGate = await api(`/api/gates/${rejectedRequest.body.gate.id}/reject`, { method: 'POST', body: { reason: 'needs edits' } });
  assert.equal(rejectedGate.body.status, 'rejected');

  const tasksAfterGateDecisions = await api('/api/tasks');
  assert.equal(tasksAfterGateDecisions.body.find((item) => item.id === 'task-q2-review').status, 'approved');
  assert.equal(tasksAfterGateDecisions.body.find((item) => item.id === 'task-q2-rejected-review').status, 'blocked');

  const audit = await api('/api/audit-events');
  assert.equal(audit.status, 200);
  assert.ok(audit.body.some((event) => event.action === 'document.artifact.rendered'));

  const raw = JSON.parse(await readFile(dataPath, 'utf8'));
  assert.equal(raw.matters.some((matter) => matter.id === 'Q-2'), true);
  assert.equal(raw.documents.some((document) => document.id === artifact.body.id), true);
  assert.equal(raw.tasks.some((item) => item.id === 'task-q2-review'), true);
  assert.ok(raw.auditEvents.length >= 5);
});

test('task gateId disambiguates same-type gates on one matter', async (t) => {
  const { api } = await withServer(t);

  const firstRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-1', template: { id: 'first-review', name: 'First Review', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  const secondRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-1', template: { id: 'second-review', name: 'Second Review', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  assert.equal(firstRequest.status, 201);
  assert.equal(secondRequest.status, 201);
  assert.equal(firstRequest.body.gate.type, secondRequest.body.gate.type);
  assert.notEqual(firstRequest.body.gate.id, secondRequest.body.gate.id);

  await api(`/api/gates/${firstRequest.body.gate.id}/reject`, { method: 'POST', body: { reason: 'wrong draft' } });
  await api(`/api/gates/${secondRequest.body.gate.id}/approve`, { method: 'POST', body: { reason: 'right draft' } });

  const task = await api('/api/tasks', { method: 'POST', body: { id: 'task-second-review', matterId: 'Q-1', title: 'Review the second generated draft', requiresGate: secondRequest.body.gate.type, gateId: secondRequest.body.gate.id } });
  assert.equal(task.status, 201);
  assert.equal(task.body.status, 'approved');
  assert.equal(task.body.gateDecision.gateId, secondRequest.body.gate.id);

  const pendingRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-1', template: { id: 'pending-review', name: 'Pending Review', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  const targetRequest = await api('/api/document-requests', { method: 'POST', body: { matterId: 'Q-1', template: { id: 'target-review', name: 'Target Review', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] } } });
  assert.equal(pendingRequest.body.gate.type, targetRequest.body.gate.type);

  await api('/api/tasks', { method: 'POST', body: { id: 'task-pending-review', matterId: 'Q-1', title: 'Review pending draft', requiresGate: pendingRequest.body.gate.type, gateId: pendingRequest.body.gate.id } });
  await api('/api/tasks', { method: 'POST', body: { id: 'task-target-review', matterId: 'Q-1', title: 'Review target draft', requiresGate: targetRequest.body.gate.type, gateId: targetRequest.body.gate.id } });

  await api(`/api/gates/${targetRequest.body.gate.id}/approve`, { method: 'POST', body: { reason: 'target approved' } });
  const tasks = await api('/api/tasks');
  assert.equal(tasks.body.find((item) => item.id === 'task-pending-review').status, 'ready');
  assert.equal(tasks.body.find((item) => item.id === 'task-target-review').status, 'approved');
  assert.equal(tasks.body.find((item) => item.id === 'task-target-review').gateDecision.gateId, targetRequest.body.gate.id);
});

test('HTTP file endpoints use selected-matter storage adapter scope and fallback upload results', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-product-storage-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const storageAdapter = {
    provider: 'google_drive',
    listMatterFiles: async (matter) => {
      calls.push(['list', matter.id, matter.driveFolderId]);
      return [{ id: 'drive-q1-doc', name: 'Drive Q1.pdf', source: 'google_drive', folderId: matter.driveFolderId }];
    },
    requestUpload: async ({ matter, file }) => {
      calls.push(['upload', matter.id, matter.driveFolderId, file.name]);
      return { ok: false, reason: 'upload_adapter_not_configured' };
    },
    requestDownload: async ({ matter, fileId }) => {
      calls.push(['download', matter.id, matter.driveFolderId, fileId]);
      return { ok: true, fileId, content: 'drive-bytes', file: { id: fileId, name: 'Drive Q1.pdf' } };
    },
  };
  const seed = {
    users: [{ id: 'local-owner', email: 'local-owner@lexyos.test', memberships: [{ tenantId: 'peacock', roles: ['owner'], globalMatterAccess: true }] }],
    sessions: [{ id: 'local-dev-owner', userId: 'local-owner', tenantId: 'peacock', provider: 'test' }],
    matters: [{ id: 'Q-1', tenantId: 'peacock', client_display_name: 'Jane Doe', drive_folder_id: 'folder-q1' }],
  };
  const { server } = createLexyProductServer({ dataPath: join(dir, 'lexyos.json'), seed, storageAdapter });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-lexyos-session-id': 'local-dev-owner', ...(options.headers ?? {}) },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    return { status: response.status, body: await response.json() };
  };

  const list = await request('/api/matters/Q-1/files');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((file) => file.id), ['drive-q1-doc']);

  const upload = await request('/api/matters/Q-1/files', { method: 'POST', body: { name: 'New.pdf' } });
  assert.equal(upload.status, 503);
  assert.equal(upload.body.error, 'upload_adapter_not_configured');

  const download = await request('/api/matters/Q-1/files/download?fileId=drive-q1-doc');
  assert.equal(download.status, 200);
  assert.equal(download.body.content, 'drive-bytes');
  assert.deepEqual(calls, [['list', 'Q-1', 'folder-q1'], ['upload', 'Q-1', 'folder-q1', 'New.pdf'], ['download', 'Q-1', 'folder-q1', 'drive-q1-doc']]);
});

test('backend exposes filing, corpus refusal, and service/proof lifecycles over API', async (t) => {
  const { api } = await withServer(t);

  const filing = await api('/api/filing-packets', { method: 'POST', body: { id: 'filing-q1', matterId: 'Q-1', jurisdiction: 'CT', filingType: 'QDRO filing', documents: [{ id: 'qdro', name: 'QDRO.pdf', type: 'qdro' }, { id: 'judgment', name: 'Judgment.pdf', type: 'judgment' }] } });
  assert.equal(filing.status, 201);
  assert.equal(filing.body.status.status, 'draft');

  const filingGate = await api(`/api/gates/${filing.body.gate.id}/approve`, { method: 'POST', body: { reason: 'ready to file' } });
  assert.equal(filingGate.body.status, 'approved');

  const submitted = await api(`/api/filing-packets/${filing.body.packet.id}/submit`, { method: 'POST' });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.status.status, 'submitted');

  const supported = await api('/api/corpus/search', { method: 'POST', body: { query: 'What do QDRO drafts require?', scope: { practiceArea: 'family_qdro', jurisdiction: 'CT' } } });
  assert.equal(supported.status, 200);
  assert.equal(supported.body.supported, true);

  const refused = await api('/api/corpus/search', { method: 'POST', body: { query: 'What is the secret unsupported tax rule?', scope: { practiceArea: 'tax', jurisdiction: 'NY' } } });
  assert.equal(refused.status, 200);
  assert.equal(refused.body.supported, false);
  assert.match(refused.body.answer, /Unsupported/);

  const service = await api('/api/service-packets', { method: 'POST', body: { id: 'svc-q1', matterId: 'Q-1', recipient: 'Plan Administrator', requirement: { id: 'mail-service', method: 'mail', requiredDocuments: ['notice'] }, documents: [{ id: 'notice', name: 'Notice.pdf', type: 'notice' }] } });
  assert.equal(service.status, 201);
  assert.equal(service.body.packet.status, 'ready');

  await api(`/api/gates/${service.body.gate.id}/approve`, { method: 'POST', body: { reason: 'send service packet' } });
  const sent = await api(`/api/service-packets/${service.body.packet.id}/send`, { method: 'POST', body: { vendor: 'manual', trackingId: 'TRACK-1' } });
  assert.equal(sent.body.status, 'sent');

  const proof = await api(`/api/service-packets/${service.body.packet.id}/proof`, { method: 'POST', body: { proofDocument: { id: 'proof-1', name: 'Proof of Service.pdf' } } });
  assert.equal(proof.status, 201);
  assert.equal(proof.body.packet.status, 'proof_received');
  assert.equal(proof.body.gate.type, 'proof_of_service_review');
});
