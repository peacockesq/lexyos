import { createSession, createTenant, createUser } from './auth.mjs';

const DEFAULT_PRODUCTS = Object.freeze([
  { id: 'lexyos', name: 'LexyOS', url: 'https://os.lexyalgo.com', role: 'matter command center' },
]);
const DEFAULT_PROVIDERS = Object.freeze(['google', 'azure']);

export function getB2bProducts(products = []) {
  const byId = new Map();
  for (const product of [...DEFAULT_PRODUCTS, ...products]) {
    if (!product?.id || !product?.url) continue;
    byId.set(product.id, {
      id: product.id,
      name: product.name ?? product.id,
      url: product.url,
      role: product.role ?? 'LexyAlgo B2B product',
    });
  }
  return [...byId.values()];
}

export function createSupabaseAuthConfig(input = {}) {
  const mode = input.mode ?? process.env.LEXYOS_AUTH_MODE ?? 'local';
  const supabaseUrl = stripTrailingSlash(input.supabaseUrl ?? process.env.LEXYOS_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '');
  const anonKey = input.anonKey ?? process.env.LEXYOS_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const siteUrl = stripTrailingSlash(input.siteUrl ?? process.env.LEXYOS_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? 'http://127.0.0.1:5174');
  const callbackPath = input.callbackPath ?? process.env.LEXYOS_AUTH_CALLBACK_PATH ?? '/auth/callback';
  const redirectTo = new URL(callbackPath, `${siteUrl}/`).toString();
  const providers = {};
  for (const provider of input.providers ?? DEFAULT_PROVIDERS) {
    providers[provider] = {
      provider,
      authorizeUrl: buildAuthorizeUrl({ supabaseUrl, provider, redirectTo }),
    };
  }
  return {
    mode,
    supabaseUrl,
    anonKey,
    siteUrl,
    callbackPath,
    redirectTo,
    providers,
    products: getB2bProducts(input.products ?? parseProductsEnv(process.env.LEXYOS_B2B_PRODUCTS_JSON)),
  };
}

export function createSupabaseSessionResolver({ supabaseUrl, anonKey, tenants = [], fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = stripTrailingSlash(supabaseUrl ?? process.env.LEXYOS_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '');
  const publicKey = anonKey ?? process.env.LEXYOS_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const tenantRows = tenants.map((tenant) => createTenant({
    ...tenant,
    allowedDomains: tenant.allowedDomains ?? tenant.approvedDomains ?? [],
  }));
  return async function resolveSupabaseSession({ headers = {}, request = null } = {}) {
    const token = bearerToken(headers, request);
    if (!token || !baseUrl || !publicKey) return null;
    const response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: publicKey },
    });
    if (!response.ok) return null;
    const supabaseUser = await response.json();
    const email = String(supabaseUser.email ?? '').toLowerCase();
    if (!email) return null;
    const tenant = resolveTenant({ supabaseUser, email, tenants: tenantRows });
    if (!tenant) return null;
    const roles = normalizeRoles(supabaseUser.user_metadata?.lexy_roles ?? supabaseUser.app_metadata?.lexy_roles ?? ['attorney']);
    const user = createUser({
      id: supabaseUser.id,
      email,
      displayName: supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name ?? email,
      memberships: [{ tenantId: tenant.id, roles, globalMatterAccess: roles.includes('owner') }],
    });
    return createSession({
      user,
      tenantId: tenant.id,
      provider: `supabase:${supabaseUser.app_metadata?.provider ?? supabaseUser.identities?.[0]?.provider ?? 'sso'}`,
      issuedAt: new Date().toISOString(),
    });
  };
}

export function shouldUseSupabaseAuth(auth = {}) {
  return (auth.mode ?? process.env.LEXYOS_AUTH_MODE) === 'supabase';
}

function buildAuthorizeUrl({ supabaseUrl, provider, redirectTo }) {
  if (!supabaseUrl) return '';
  const url = new URL('/auth/v1/authorize', `${supabaseUrl}/`);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', redirectTo);
  return url.toString();
}

function resolveTenant({ supabaseUser, email, tenants }) {
  const requestedTenantId = supabaseUser.app_metadata?.lexy_tenant_id ?? supabaseUser.user_metadata?.lexy_tenant_id;
  if (requestedTenantId) {
    const tenant = tenants.find((item) => item.id === requestedTenantId);
    if (tenant && domainAllowed(email, tenant.allowedDomains)) return tenant;
    return null;
  }
  return tenants.find((tenant) => domainAllowed(email, tenant.allowedDomains)) ?? null;
}

function domainAllowed(email, allowedDomains = []) {
  if (!allowedDomains.length) return false;
  const domain = email.split('@').at(-1);
  return allowedDomains.map((item) => String(item).toLowerCase()).includes(domain);
}

function normalizeRoles(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  const cleaned = list.map((role) => String(role).trim()).filter(Boolean);
  return cleaned.length ? cleaned : ['attorney'];
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

function stripTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function parseProductsEnv(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
