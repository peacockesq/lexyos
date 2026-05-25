import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canAccessMatter, createSession, createTenant, createUser, configureSsoProvider } from '../src/auth.mjs';
import { validateOidcClaims } from '../src/oidc.mjs';
import { approveGate, createHumanGate } from '../src/gates.mjs';
import { applyAdeuTrackedChange } from '../src/documents.mjs';
import { markServiceSent } from '../src/service.mjs';
import { createLexyProductServer } from '../src/server.mjs';

function sessionFor(tenantId, roles = ['attorney'], extra = {}) {
  const user = createUser({ id: `${tenantId}-${roles.join('-')}`, email: `u@${tenantId}.test`, memberships: [{ tenantId, roles, ...extra }] });
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

test('owner/admin role remains tenant-bound unless explicit global access is granted', () => {
  const owner = sessionFor('firm-a', ['owner']);
  assert.equal(canAccessMatter(owner, { id: 'B1', tenantId: 'firm-b' }), false);
  const globalOwner = sessionFor('firm-a', ['owner'], { globalMatterAccess: true });
  assert.equal(canAccessMatter(globalOwner, { id: 'B1', tenantId: 'firm-b' }), true);
});

test('approval gate decisions require same-tenant matter access', () => {
  const gate = createHumanGate({ id: 'g1', matterId: 'A1', type: 'attorney_document_review', action: 'approve_document:req1', requestedBy: 'agent', requiredRole: 'attorney' });
  assert.throws(() => approveGate(gate, { session: sessionFor('firm-b') }), /gate matter context required/);
  assert.throws(() => approveGate(gate, { session: sessionFor('firm-b'), matter: { id: 'A1', tenantId: 'firm-a' } }), /cannot access gate matter/);
  assert.equal(approveGate(gate, { session: sessionFor('firm-a'), matter: { id: 'A1', tenantId: 'firm-a' } }).status, 'approved');
});

test('service and document downstream actions recheck session matter access', () => {
  const firmA = sessionFor('firm-a', ['attorney']);
  const firmBPara = sessionFor('firm-b', ['paralegal']);
  const serviceGate = { id: 'sg', matterId: 'A1', type: 'service_approval', action: 'send_service:svc1', status: 'approved', decision: { tenantId: 'firm-a' } };
  const packet = { id: 'svc1', matterId: 'A1', recipient: 'Plan Admin', status: 'ready', history: [] };
  assert.throws(() => markServiceSent(packet, { gate: serviceGate, session: firmBPara }), /service matter context required/);
  assert.throws(() => markServiceSent(packet, { gate: serviceGate, session: firmBPara, matter: { id: 'A1', tenantId: 'firm-a' } }), /cannot access service matter/);

  const artifact = { id: 'artifact_req1', matterId: 'A1', content: 'Client A' };
  const docGate = { id: 'dg', matterId: 'A1', type: 'attorney_document_review', action: 'approve_document:req1', status: 'approved', decision: { tenantId: 'firm-a' } };
  assert.throws(() => applyAdeuTrackedChange({ artifact, gate: docGate, session: sessionFor('firm-b'), change: { targetText: 'A', newText: 'B' } }), /document matter context required/);
  assert.throws(() => applyAdeuTrackedChange({ artifact, gate: docGate, session: sessionFor('firm-b'), matter: { id: 'A1', tenantId: 'firm-a' }, change: { targetText: 'A', newText: 'B' } }), /cannot access document matter/);
  assert.equal(applyAdeuTrackedChange({ artifact, gate: docGate, session: firmA, matter: { id: 'A1', tenantId: 'firm-a' }, change: { targetText: 'A', newText: 'Alpha' } }).status, 'tracked_change_applied');
});

test('OIDC provider tenant id must match tenant being authenticated', () => {
  const tenant = createTenant({ id: 'firm-a', allowedDomains: ['firm-a.test'] });
  const provider = configureSsoProvider({ tenantId: 'firm-b', provider: 'google', issuer: 'issuer', clientId: 'client', domains: ['firm-a.test'] });
  const claims = { iss: 'issuer', aud: 'client', sub: 's1', email: 'user@firm-a.test', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  assert.match(validateOidcClaims({ claims, provider, tenant }).errors.join(';'), /tenant mismatch/);
});

test('HTTP endpoints require a resolved session before protected actions', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-http-auth-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const api = await startProductHttp(t, {
    dataPath: join(dir, 'lexyos.json'),
    seed: { matters: [{ id: 'A1', tenantId: 'firm-a', client_display_name: 'A Client' }] },
  });

  assert.deepEqual(await api('/api/matters'), { status: 401, body: { error: 'unauthorized' } });
  assert.deepEqual(await api('/api/matters', { headers: { authorization: 'Bearer bad-token' } }), { status: 401, body: { error: 'unauthorized' } });
});

test('HTTP gate decisions enforce the resolved session role', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-http-authz-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const api = await startProductHttp(t, {
    dataPath: join(dir, 'lexyos.json'),
    seed: {
      users: [
        { id: 'agent-a', email: 'agent@firm-a.test', memberships: [{ tenantId: 'firm-a', roles: ['agent'] }] },
        { id: 'attorney-a', email: 'attorney@firm-a.test', memberships: [{ tenantId: 'firm-a', roles: ['attorney'] }] },
      ],
      sessions: [
        { id: 'agent-token', userId: 'agent-a', tenantId: 'firm-a', provider: 'test' },
        { id: 'attorney-token', userId: 'attorney-a', tenantId: 'firm-a', provider: 'test' },
      ],
      matters: [{ id: 'A1', tenantId: 'firm-a', client_display_name: 'A Client' }],
      gates: [createHumanGate({ id: 'gate-a1', matterId: 'A1', type: 'attorney_document_review', action: 'approve_document:req1', requestedBy: 'agent', requiredRole: 'attorney' })],
    },
  });

  const denied = await api('/api/gates/gate-a1/approve', { method: 'POST', headers: { authorization: 'Bearer agent-token' }, body: {} });
  assert.equal(denied.status, 403);
  const approved = await api('/api/gates/gate-a1/approve', { method: 'POST', headers: { 'x-lexyos-session-id': 'attorney-token' }, body: {} });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.decision.decidedBy, 'attorney-a');
});
