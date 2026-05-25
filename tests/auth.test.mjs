import test from 'node:test';
import assert from 'node:assert/strict';
import { LEXY_PERMISSIONS, can, canAccessMatter, configureSsoProvider, createSession, createTenant, createUser, requirePermission } from '../src/auth.mjs';

test('unified B2B login creates tenant-scoped sessions from SSO membership', () => {
  const tenant = createTenant({ id: 'firm-a', name: 'Firm A', allowedDomains: ['firma.test'] });
  const provider = configureSsoProvider({ tenantId: tenant.id, provider: 'google-workspace', issuer: 'https://accounts.google.com', clientId: 'client-1', domains: ['firma.test'] });
  const user = createUser({ id: 'u1', email: 'Attorney@FirmA.test', memberships: [{ tenantId: tenant.id, roles: ['attorney'] }] });

  const session = createSession({ user, tenantId: tenant.id, provider: provider.provider });

  assert.equal(session.email, 'attorney@firma.test');
  assert.equal(can(session, LEXY_PERMISSIONS.FILING_SUBMIT), true);
  assert.equal(can(session, LEXY_PERMISSIONS.TASK_RUN), false);
  assert.equal(canAccessMatter(session, { id: 'm1', tenantId: 'firm-a' }), true);
  assert.equal(canAccessMatter(session, { id: 'm2', tenantId: 'firm-b' }), false);
});

test('permission guard blocks cross-role autonomous filing submission', () => {
  const user = createUser({ id: 'agent1', email: 'agent@lexy.test', memberships: [{ tenantId: 'firm-a', roles: ['agent'] }] });
  const session = createSession({ user, tenantId: 'firm-a' });
  assert.throws(() => requirePermission(session, LEXY_PERMISSIONS.FILING_SUBMIT), /permission denied/);
});
