import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('browser app is API-only product UI, not static/demo module scaffolding', () => {
  assert.doesNotMatch(appSource, /from '\.\.\/src\//, 'browser module must not import server/source modules that are not served to the browser');
  assert.doesNotMatch(appSource, /sampleRows|fakeFiles|createStaticMatterSource|fallback/i, 'UI must not silently fall back to static demo data');
  assert.match(appSource, /throw new Error\(`LexyOS API failed:/, 'API failures must surface instead of fake-success rendering');
});

test('browser app wires every required product workflow to live API endpoints', () => {
  for (const endpoint of [
    '/api/matters',
    '/files',
    '/download',
    '/api/document-requests',
    '/artifacts',
    '/api/gates',
    '/approve',
    '/reject',
    '/api/tasks',
    '/api/audit-events',
    '/api/filing-packets',
    '/submit',
    '/api/corpus/search',
    '/api/service-packets',
    '/send',
    '/proof',
  ]) {
    assert.match(appSource, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing API workflow endpoint ${endpoint}`);
  }
});

test('workflow actions promote their newly created approval gate to the selected gate', () => {
  for (const pattern of [
    /state\.selectedGate\s*=\s*requestResult\.gate/,
    /state\.selectedGate\s*=\s*result\.gate/g,
  ]) {
    const matches = appSource.match(pattern) ?? [];
    assert.ok(matches.length >= (pattern.global ? 2 : 1), `missing selected-gate promotion for ${pattern}`);
  }
});

test('cockpit exposes controls and panels for matter create/edit, file upload/download, document gates, filing, service, corpus, errors, and audit trail', () => {
  for (const id of [
    'create-matter',
    'save-baseline',
    'upload-file',
    'download-file',
    'generate-doc',
    'gate-list',
    'approve-gate',
    'reject-gate',
    'create-filing',
    'submit-filing',
    'search-corpus',
    'prepare-service',
    'send-service',
    'upload-proof',
    'audit-trail',
    'error-panel',
  ]) {
    assert.match(htmlSource, new RegExp(`id=["']${id}["']`), `missing UI control/panel #${id}`);
  }
});

test('Seven shell exposes Mike-style cockpit regions with Lexy semantics', () => {
  for (const token of [
    'seven-shell',
    'lexy-nav',
    'matter-baseline',
    'files-panel',
    'document-workspace',
    'agent-rail',
    'cockpit-controls',
  ]) {
    assert.match(htmlSource, new RegExp(token), `missing Seven shell region ${token}`);
  }
});

test('Seven design language includes Skittles color system and glass cockpit surfaces', () => {
  for (const token of [
    '--skittle-red',
    '--skittle-yellow',
    '--skittle-green',
    '--skittle-blue',
    '--skittle-purple',
    '--seven-glow',
    'linear-gradient(135deg',
    'backdrop-filter',
  ]) {
    assert.match(cssSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing design token ${token}`);
  }
});

test('browser app renders matter metrics and API receipts in the shell', () => {
  for (const token of [
    'createMatterFromUi',
    'saveBaselineFromUi',
    'uploadMatterFileFromUi',
    'downloadSelectedFile',
    'renderMatterMetrics',
    'api-receipt-list',
    'matter-health-score',
    'active-endpoints',
    'API_ENDPOINT_RECEIPTS',
  ]) {
    assert.match(appSource, new RegExp(token), `missing shell runtime token ${token}`);
  }
});
