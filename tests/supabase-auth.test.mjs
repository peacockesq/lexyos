import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSupabaseAuthConfig, createSupabaseSessionResolver, getB2bProducts } from '../src/supabaseAuth.mjs';
import { createLexyProductApp } from '../src/server.mjs';

test('Supabase auth config builds real OAuth authorize URLs and shared B2B product links', () => {
  const config = createSupabaseAuthConfig({
    mode: 'supabase',
    supabaseUrl: 'https://auth.lexyalgo.test',
    anonKey: 'anon-public-key',
    siteUrl: 'https://os.lexyalgo.com',
    callbackPath: '/auth/callback',
    providers: ['google', 'azure'],
    products: [{ id: 'lexyfile', name: 'LexyFile', url: 'https://file.lexyalgo.com' }],
  });

  assert.equal(config.mode, 'supabase');
  assert.equal(config.supabaseUrl, 'https://auth.lexyalgo.test');
  assert.equal(config.anonKey, 'anon-public-key');
  assert.equal(config.redirectTo, 'https://os.lexyalgo.com/auth/callback');
  assert.match(config.providers.google.authorizeUrl, /^https:\/\/auth\.lexyalgo\.test\/auth\/v1\/authorize\?provider=google&/);
  assert.match(config.providers.google.authorizeUrl, /redirect_to=https%3A%2F%2Fos\.lexyalgo\.com%2Fauth%2Fcallback/);
  assert.match(config.providers.azure.authorizeUrl, /provider=azure/);
  assert.deepEqual(config.products.map((product) => product.id), ['lexyos', 'lexyfile']);
});

test('Supabase resolver validates Bearer token against Supabase user endpoint and maps approved tenant domain', async () => {
  const calls = [];
  const resolver = createSupabaseSessionResolver({
    supabaseUrl: 'https://auth.lexyalgo.test',
    anonKey: 'anon-public-key',
    tenants: [{ id: 'peacock', name: 'Peacock Law Firm', allowedDomains: ['peacock.test'] }],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'user-123',
            email: 'willie@peacock.test',
            user_metadata: { full_name: 'Willie Peacock', lexy_roles: ['owner'] },
            app_metadata: { provider: 'google', lexy_tenant_id: 'peacock' },
          };
        },
      };
    },
  });

  const session = await resolver({ headers: { authorization: 'Bearer real-access-token' } });

  assert.equal(calls[0].url, 'https://auth.lexyalgo.test/auth/v1/user');
  assert.equal(calls[0].options.headers.authorization, 'Bearer real-access-token');
  assert.equal(calls[0].options.headers.apikey, 'anon-public-key');
  assert.equal(session.userId, 'user-123');
  assert.equal(session.email, 'willie@peacock.test');
  assert.equal(session.tenantId, 'peacock');
  assert.equal(session.provider, 'supabase:google');
  assert.deepEqual(session.roles, ['owner']);
  assert.equal(session.globalMatterAccess, true);
});

test('Supabase resolver rejects unapproved domains and missing bearer tokens', async () => {
  const resolver = createSupabaseSessionResolver({
    supabaseUrl: 'https://auth.lexyalgo.test',
    anonKey: 'anon-public-key',
    tenants: [{ id: 'peacock', allowedDomains: ['peacock.test'] }],
    fetchImpl: async () => ({
      ok: true,
      async json() { return { id: 'user-123', email: 'intruder@example.com', app_metadata: {}, user_metadata: {} }; },
    }),
  });

  assert.equal(await resolver({ headers: {} }), null);
  assert.equal(await resolver({ headers: { authorization: 'Bearer bad-domain' } }), null);
});

test('LexyOS API exposes auth config and requires Supabase bearer when Supabase auth mode is enabled', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-supabase-auth-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const app = createLexyProductApp({
    dataPath: join(dir, 'lexyos.json'),
    seed: {
      tenants: [{ id: 'peacock', name: 'Peacock Law Firm', allowedDomains: ['peacock.test'] }],
      matters: [{ id: 'Q-1', tenantId: 'peacock', client_display_name: 'Jane Doe', stage: 'drafting' }],
    },
    auth: {
      mode: 'supabase',
      supabaseUrl: 'https://auth.lexyalgo.test',
      anonKey: 'anon-public-key',
      siteUrl: 'https://os.lexyalgo.com',
      fetchImpl: async () => ({
        ok: true,
        async json() { return { id: 'user-123', email: 'willie@peacock.test', app_metadata: { provider: 'google', lexy_tenant_id: 'peacock' }, user_metadata: { lexy_roles: ['owner'] } }; },
      }),
    },
  });

  const config = await app.handleApi('GET', '/api/auth/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.mode, 'supabase');
  assert.equal(config.body.anonKey, 'anon-public-key');
  assert.ok(config.body.providers.google.authorizeUrl.includes('/auth/v1/authorize'));

  const rejected = await app.handleApi('GET', '/api/matters', {}, { headers: { 'x-lexyos-session-id': 'local-dev-owner' } });
  assert.equal(rejected.status, 401);

  const accepted = await app.handleApi('GET', '/api/matters', {}, { headers: { authorization: 'Bearer real-access-token' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body[0].id, 'Q-1');
});
