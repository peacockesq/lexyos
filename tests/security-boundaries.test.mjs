import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../src/audit.mjs';
import { createSession, createUser } from '../src/auth.mjs';
import { createLexyService } from '../src/api.mjs';
import { createCorpusSource, queryCorpus } from '../src/corpus.mjs';
import { approveGate, createHumanGate } from '../src/gates.mjs';
import { createMatterRepository, createStaticMatterSource } from '../src/repository.mjs';
import { completeTask, createTask } from '../src/tasks.mjs';
import { createLexyProductServer } from '../src/server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function sessionFor(tenantId, roles = ['attorney'], matterScope = 'tenant') {
  const user = createUser({ id: `${tenantId}-${roles[0]}`, email: `${roles[0]}@${tenantId}.test`, memberships: [{ tenantId, roles, matterScope }] });
  return createSession({ user, tenantId });
}

async function startProductHttp(t, options) {
  const { server } = createLexyProductServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return async function api(path, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

test('API filters matters, tasks, gates, and audit events by tenant/matter access', async () => {
  const repo = createMatterRepository({ sources: [createStaticMatterSource('test', [
    { matter_id: 'A1', tenantId: 'firm-a', client_display_name: 'A Client' },
    { matter_id: 'B1', tenantId: 'firm-b', client_display_name: 'B Client' },
  ])] });
  const auditLog = createAuditLog();
  auditLog.append({ actor: 'system', source: 'test', action: 'matter.updated', matterId: 'A1' });
  auditLog.append({ actor: 'system', source: 'test', action: 'matter.updated', matterId: 'B1' });
  const service = createLexyService({
    matterRepository: repo,
    tasks: [createTask({ id: 'ta', matterId: 'A1', title: 'A task' }), createTask({ id: 'tb', matterId: 'B1', title: 'B task' })],
    gates: [createHumanGate({ id: 'ga', matterId: 'A1', type: 'filing_approval', action: 'submit_filing:p1', requestedBy: 'agent' }), createHumanGate({ id: 'gb', matterId: 'B1', type: 'filing_approval', action: 'submit_filing:p2', requestedBy: 'agent' })],
    auditLog,
  });
  const session = sessionFor('firm-a');

  assert.deepEqual((await service.handle({ path: '/matters', session })).body.map((m) => m.id), ['A1']);
  assert.deepEqual((await service.handle({ path: '/tasks', session })).body.map((t) => t.id), ['ta']);
  assert.deepEqual((await service.handle({ path: '/gates', session })).body.map((g) => g.id), ['ga']);
  assert.deepEqual((await service.handle({ path: '/audit-events', session })).body.map((e) => e.matterId), ['A1']);
});

test('task creation denies cross-tenant matter writes', async () => {
  const repo = createMatterRepository({ sources: [createStaticMatterSource('test', [{ matter_id: 'A1', tenantId: 'firm-a', client_display_name: 'A Client' }])] });
  const service = createLexyService({ matterRepository: repo, tasks: [], auditLog: createAuditLog() });
  const agentSession = sessionFor('firm-b', ['agent']);
  const response = await service.handle({ method: 'POST', path: '/tasks', session: agentSession, body: createTask({ id: 'bad', matterId: 'A1', title: 'Bad cross tenant write' }) });
  assert.equal(response.status, 403);
});

test('gate and task completion require authorized same-matter approval', () => {
  const attorneySession = sessionFor('firm-a', ['attorney']);
  const agentSession = sessionFor('firm-a', ['agent']);
  const gate = createHumanGate({ id: 'g1', matterId: 'M1', type: 'external_communication', action: 'external_communication', requestedBy: 'agent' });
  assert.throws(() => approveGate(gate, { session: agentSession }), /authorized session/);
  const approved = approveGate(gate, { session: attorneySession, matter: { id: 'M1', tenantId: 'firm-a' } });
  const task = createTask({ id: 't1', matterId: 'M1', title: 'Send approved message', requiresGate: 'external_communication' });
  assert.equal(completeTask(task, { actor: 'agent', approvedGate: approved }).status, 'done');
  const otherMatterTask = createTask({ id: 't2', matterId: 'M2', title: 'Bad reuse', requiresGate: 'external_communication' });
  assert.throws(() => completeTask(otherMatterTask, { actor: 'agent', approvedGate: approved }), /matter mismatch/);
});

test('private corpus sources require an explicit matching matter scope', () => {
  const unscopedPrivate = createCorpusSource({ id: 'private-null', text: 'Secret internal text', visibility: 'private' });
  const scopedPrivate = createCorpusSource({ id: 'private-m1', text: 'Secret plan detail', visibility: 'private', matterId: 'M1' });
  assert.equal(queryCorpus({ sources: [unscopedPrivate], query: 'secret', allowPrivate: true }).length, 0);
  assert.equal(queryCorpus({ sources: [scopedPrivate], query: 'secret', allowPrivate: true, matterId: 'M2' }).length, 0);
  assert.equal(queryCorpus({ sources: [scopedPrivate], query: 'secret', allowPrivate: true, matterId: 'M1' }).length, 1);
});

test('HTTP endpoints filter tenant data and reject cross-tenant writes by resolved session', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-http-boundary-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const api = await startProductHttp(t, {
    dataPath: join(dir, 'lexyos.json'),
    seed: {
      users: [
        { id: 'attorney-a', email: 'attorney@firm-a.test', memberships: [{ tenantId: 'firm-a', roles: ['attorney'] }] },
        { id: 'attorney-b', email: 'attorney@firm-b.test', memberships: [{ tenantId: 'firm-b', roles: ['attorney'] }] },
      ],
      sessions: [
        { id: 'token-a', userId: 'attorney-a', tenantId: 'firm-a', provider: 'test' },
        { id: 'token-b', userId: 'attorney-b', tenantId: 'firm-b', provider: 'test' },
      ],
      matters: [
        { id: 'A1', tenantId: 'firm-a', client_display_name: 'A Client' },
        { id: 'B1', tenantId: 'firm-b', client_display_name: 'B Client' },
      ],
      tasks: [createTask({ id: 'task-a', matterId: 'A1', title: 'A task' }), createTask({ id: 'task-b', matterId: 'B1', title: 'B task' })],
      gates: [createHumanGate({ id: 'gate-a', matterId: 'A1', type: 'filing_approval', action: 'submit_filing:p1', requestedBy: 'agent' }), createHumanGate({ id: 'gate-b', matterId: 'B1', type: 'filing_approval', action: 'submit_filing:p2', requestedBy: 'agent' })],
    },
  });

  const firmAMatters = await api('/api/matters', { headers: { authorization: 'Bearer token-a' } });
  assert.deepEqual(firmAMatters.body.map((matter) => matter.id), ['A1']);
  const firmATasks = await api('/api/tasks', { headers: { authorization: 'Bearer token-a' } });
  assert.deepEqual(firmATasks.body.map((task) => task.id), ['task-a']);
  const firmAGates = await api('/api/gates', { headers: { authorization: 'Bearer token-a' } });
  assert.deepEqual(firmAGates.body.map((gate) => gate.id), ['gate-a']);

  const crossTenantWrite = await api('/api/matters/B1/files', { method: 'POST', headers: { authorization: 'Bearer token-a' }, body: { id: 'bad-file', name: 'Do not write.pdf' } });
  assert.equal(crossTenantWrite.status, 403);
});
