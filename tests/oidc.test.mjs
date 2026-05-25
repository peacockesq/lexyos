import test from 'node:test';
import assert from 'node:assert/strict';
import { configureSsoProvider, createTenant } from '../src/auth.mjs';
import { createSessionFromOidc, validateOidcClaims } from '../src/oidc.mjs';

test('OIDC validation enforces issuer, audience, verified email, and tenant domain', () => {
  const tenant = createTenant({ id: 'firm-a', allowedDomains: ['firm-a.test'] });
  const provider = configureSsoProvider({ tenantId: 'firm-a', provider: 'google-workspace', issuer: 'https://accounts.google.com', clientId: 'client-1', domains: ['firm-a.test'] });
  const claims = { iss: provider.issuer, aud: provider.clientId, sub: 'user-1', email: 'lawyer@firm-a.test', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  assert.equal(validateOidcClaims({ claims, provider, tenant }).ok, true);
  assert.match(validateOidcClaims({ claims: { ...claims, aud: 'wrong' }, provider, tenant }).errors.join(';'), /audience mismatch/);
  assert.match(validateOidcClaims({ claims: { ...claims, email: 'lawyer@other.test' }, provider, tenant }).errors.join(';'), /domain/);
});

test('OIDC session creation requires a mapped tenant membership', () => {
  const tenant = createTenant({ id: 'firm-a', allowedDomains: ['firm-a.test'] });
  const provider = configureSsoProvider({ tenantId: 'firm-a', provider: 'google-workspace', issuer: 'issuer', clientId: 'client-1', domains: ['firm-a.test'] });
  const claims = { iss: 'issuer', aud: 'client-1', sub: 'sub-1', email: 'attorney@firm-a.test', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  assert.throws(() => createSessionFromOidc({ claims, provider, tenant }), /no tenant membership/);
  const session = createSessionFromOidc({ claims, provider, tenant, membershipLookup: () => ({ userId: 'u1', roles: ['attorney'] }) });
  assert.equal(session.tenantId, 'firm-a');
  assert.deepEqual(session.roles, ['attorney']);
});
