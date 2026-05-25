import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('browser app is API-only product UI, not static/demo module scaffolding', () => {
  assert.doesNotMatch(appSource, /from '\.\.\/src\//, 'browser module must not import server/source modules that are not served to the browser');
  assert.doesNotMatch(appSource, /sampleRows|fakeFiles|createStaticMatterSource|fallback/i, 'UI must not silently fall back to static demo data');
  assert.match(appSource, /throw new Error\(`LexyOS API failed:/, 'API failures must surface instead of fake-success rendering');
});

test('browser app wires every required product workflow to live API endpoints', () => {
  for (const endpoint of [
    '/api/matters',
    '/files',
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

test('filing and service packet retries use fresh packet ids instead of overwriting rejected gates', () => {
  assert.doesNotMatch(appSource, /id:\s*`filing_\$\{state\.selectedMatter\.id\}`/, 'filing retry must not reuse the same packet/gate id after a rejection');
  assert.doesNotMatch(appSource, /id:\s*`service_\$\{state\.selectedMatter\.id\}`/, 'service retry must not reuse the same packet/gate id after a rejection');
  assert.match(appSource, /const filingPacketId = `filing_\$\{state\.selectedMatter\.id\}_\$\{Date\.now\(\)\}`/, 'filing retry should create a fresh packet id');
  assert.match(appSource, /const servicePacketId = `service_\$\{state\.selectedMatter\.id\}_\$\{Date\.now\(\)\}`/, 'service retry should create a fresh packet id');
});

test('cockpit exposes controls and panels for document gates, filing, service, corpus, errors, and audit trail', () => {
  for (const id of [
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
