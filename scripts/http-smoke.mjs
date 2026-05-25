import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 5211);
const host = process.env.HOST ?? '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const tmp = await mkdtemp(join(tmpdir(), 'lexyos-smoke-'));
const dataPath = join(tmp, 'lexyos.json');
const server = spawn(process.execPath, ['src/server.mjs'], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: host,
    LEXYOS_DATA_PATH: dataPath,
    LEXYOS_STORAGE_PROVIDER: process.env.LEXYOS_STORAGE_PROVIDER ?? 'local',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
server.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForHealth(baseUrl);
  const health = await getJson(`${baseUrl}/api/health`);
  const unauthenticated = await fetch(`${baseUrl}/api/matters`);
  if (unauthenticated.status !== 401) {
    throw new Error(`expected unauthenticated /api/matters to return 401, got ${unauthenticated.status}`);
  }
  const matters = await getJson(`${baseUrl}/api/matters`, { 'x-lexyos-session-id': 'local-dev-owner' });
  if (!Array.isArray(matters) || matters.length < 2) {
    throw new Error(`expected seeded matters, got ${JSON.stringify(matters)}`);
  }
  const files = await getJson(`${baseUrl}/api/matters/${encodeURIComponent(matters[0].id)}/files`, { 'x-lexyos-session-id': 'local-dev-owner' });
  if (!Array.isArray(files)) {
    throw new Error(`expected file list array, got ${JSON.stringify(files)}`);
  }
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    dataPath,
    health: health.status,
    matterCount: matters.length,
    firstMatter: matters[0].id,
    firstMatterFileCount: files.length,
    storageProvider: process.env.LEXYOS_STORAGE_PROVIDER ?? 'local',
  }, null, 2));
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  await rm(tmp, { recursive: true, force: true });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${url}/api/health`);
      if (health.ok) return;
      lastError = new Error(`health returned ${health.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become healthy. stdout=${stdout} stderr=${stderr} last=${lastError?.message}`);
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
