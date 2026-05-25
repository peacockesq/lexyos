export const LEXY_PERMISSIONS = Object.freeze({
  MATTER_READ: 'matter:read',
  MATTER_WRITE: 'matter:write',
  TASK_RUN: 'task:run',
  GATE_DECIDE: 'gate:decide',
  FILING_PREPARE: 'filing:prepare',
  FILING_SUBMIT: 'filing:submit',
  CORPUS_QUERY: 'corpus:query',
  SERVICE_MANAGE: 'service:manage',
  ADMIN: 'admin:*',
});

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.values(LEXY_PERMISSIONS),
  attorney: [LEXY_PERMISSIONS.MATTER_READ, LEXY_PERMISSIONS.MATTER_WRITE, LEXY_PERMISSIONS.GATE_DECIDE, LEXY_PERMISSIONS.FILING_PREPARE, LEXY_PERMISSIONS.FILING_SUBMIT, LEXY_PERMISSIONS.CORPUS_QUERY, LEXY_PERMISSIONS.SERVICE_MANAGE],
  paralegal: [LEXY_PERMISSIONS.MATTER_READ, LEXY_PERMISSIONS.MATTER_WRITE, LEXY_PERMISSIONS.GATE_DECIDE, LEXY_PERMISSIONS.FILING_PREPARE, LEXY_PERMISSIONS.CORPUS_QUERY, LEXY_PERMISSIONS.SERVICE_MANAGE],
  agent: [LEXY_PERMISSIONS.MATTER_READ, LEXY_PERMISSIONS.TASK_RUN, LEXY_PERMISSIONS.FILING_PREPARE, LEXY_PERMISSIONS.CORPUS_QUERY],
  client: [LEXY_PERMISSIONS.MATTER_READ],
});

export function createTenant({ id, name, ssoProviders = [], allowedDomains = [] }) {
  if (!id) throw new Error('tenant id is required');
  return { id, name: name ?? id, ssoProviders, allowedDomains };
}

export function createUser({ id, email, displayName, memberships = [] }) {
  if (!id || !email) throw new Error('user id and email are required');
  return { id, email: email.toLowerCase(), displayName: displayName ?? email, memberships };
}

export function createSession({ user, tenantId, provider = 'password', issuedAt = new Date().toISOString() }) {
  const membership = user.memberships.find((item) => item.tenantId === tenantId);
  if (!membership) throw new Error('user is not a member of tenant');
  return { userId: user.id, email: user.email, tenantId, provider, roles: membership.roles ?? [], matterScope: membership.matterScope ?? 'tenant', globalMatterAccess: Boolean(membership.globalMatterAccess), issuedAt };
}

export function configureSsoProvider({ tenantId, provider, issuer, clientId, domains = [] }) {
  if (!tenantId || !provider || !issuer || !clientId) throw new Error('tenantId, provider, issuer, and clientId are required');
  return { tenantId, provider, issuer, clientId, domains };
}

export function permissionsForRoles(roles = []) {
  const values = new Set();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) values.add(permission);
  return values;
}

export function can(session, permission) {
  const permissions = permissionsForRoles(session?.roles ?? []);
  return permissions.has(LEXY_PERMISSIONS.ADMIN) || permissions.has(permission);
}

export function requirePermission(session, permission) {
  if (!can(session, permission)) throw new Error(`permission denied: ${permission}`);
  return true;
}

export function canAccessMatter(session, matter) {
  if (!session || !matter) return false;
  if (can(session, LEXY_PERMISSIONS.ADMIN) && session.globalMatterAccess === true) return true;
  const matterTenantId = matter.tenantId ?? matter.tenant_id ?? matter.baseline?.tenantId ?? matter.baseline?.tenant_id ?? null;
  if (session.matterScope === 'tenant') return Boolean(matterTenantId) && matterTenantId === session.tenantId;
  if (Array.isArray(session.matterScope)) return session.matterScope.includes(matter.id) && Boolean(matterTenantId) && matterTenantId === session.tenantId;
  return false;
}
