import { createSession, createUser } from './auth.mjs';

export function validateOidcClaims({ claims, provider, tenant }) {
  if (!claims || !provider || !tenant) throw new Error('claims, provider, and tenant are required');
  const errors = [];
  if (provider.tenantId !== tenant.id) errors.push('tenant mismatch');
  if (claims.iss !== provider.issuer) errors.push('issuer mismatch');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(provider.clientId)) errors.push('audience mismatch');
  if (!claims.sub) errors.push('missing subject');
  if (!claims.email) errors.push('missing email');
  if (claims.email_verified === false) errors.push('email not verified');
  const email = String(claims.email ?? '').toLowerCase();
  const domain = email.split('@').at(-1);
  const allowed = new Set([...(tenant.allowedDomains ?? []), ...(provider.domains ?? [])].map((item) => item.toLowerCase()));
  if (allowed.size && !allowed.has(domain)) errors.push('email domain not allowed');
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && Number(claims.exp) <= now) errors.push('token expired');
  if (claims.nbf && Number(claims.nbf) > now) errors.push('token not yet valid');
  return { ok: errors.length === 0, errors, subject: claims.sub, email, domain };
}

export function createSessionFromOidc({ claims, provider, tenant, membershipLookup }) {
  const validation = validateOidcClaims({ claims, provider, tenant });
  if (!validation.ok) throw new Error(`invalid OIDC claims: ${validation.errors.join('; ')}`);
  const membership = membershipLookup?.({ tenantId: tenant.id, email: validation.email, subject: validation.subject, claims }) ?? null;
  if (!membership) throw new Error('no tenant membership for OIDC subject');
  const user = createUser({
    id: membership.userId ?? validation.subject,
    email: validation.email,
    displayName: claims.name ?? validation.email,
    memberships: [{ tenantId: tenant.id, roles: membership.roles ?? [], matterScope: membership.matterScope ?? 'tenant' }],
  });
  return createSession({ user, tenantId: tenant.id, provider: provider.provider, issuedAt: new Date((claims.iat ?? Math.floor(Date.now() / 1000)) * 1000).toISOString() });
}
