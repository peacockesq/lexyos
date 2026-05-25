import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatter, searchMatters, matterFolderPath } from '../src/matters.mjs';

test('normalizeMatter preserves baseline data and drive folder identity', () => {
  const matter = normalizeMatter({
    matter_id: 'Q-2026-001',
    client_name: 'Jane Doe',
    matter_type: 'QDRO',
    stage: 'drafting',
    drive_folder_id: 'folder123',
    baseline_data: { plan_name: 'Fidelity 401(k)', valuation_date: '2024-01-01' },
  });

  assert.equal(matter.id, 'Q-2026-001');
  assert.equal(matter.displayName, 'Jane Doe — QDRO');
  assert.equal(matter.driveFolderId, 'folder123');
  assert.equal(matter.baseline.plan_name, 'Fidelity 401(k)');
});

test('normalizeMatter reads Lexy canonical no-code DB keys without Peacock mapping glue', () => {
  const matter = normalizeMatter({
    matter_id: 'LM-123',
    client_display_name: 'Canonical Client',
    matter_type: 'QDRO',
    stage: 'Pending Attorney Review',
    drive_folder_id: 'drive-folder-1',
    plan_name: 'Acme Pension Plan',
  });

  assert.equal(matter.clientName, 'Canonical Client');
  assert.equal(matter.stage, 'Pending Attorney Review');
  assert.equal(matter.baseline.plan_name, 'Acme Pension Plan');
});

test('searchMatters matches client, matter id, type, stage, and baseline fields', () => {
  const matters = [
    normalizeMatter({ matter_id: 'A1', client_name: 'Jane Doe', matter_type: 'QDRO', stage: 'drafting', baseline_data: { plan_name: 'Empower' } }),
    normalizeMatter({ matter_id: 'B2', client_name: 'John Smith', matter_type: 'Divorce', stage: 'intake', baseline_data: { county: 'Fairfield' } }),
  ];

  assert.deepEqual(searchMatters(matters, 'empower').map(m => m.id), ['A1']);
  assert.deepEqual(searchMatters(matters, 'fairfield').map(m => m.id), ['B2']);
  assert.deepEqual(searchMatters(matters, 'drafting').map(m => m.id), ['A1']);
});

test('matterFolderPath creates a predictable folder-per-matter display path', () => {
  const matter = normalizeMatter({ matter_id: 'Q-2026-001', client_name: 'Jane Doe', matter_type: 'QDRO' });
  assert.equal(matterFolderPath('2026 Permanent Matter Files/Clients', matter), '2026 Permanent Matter Files/Clients/Jane Doe — QDRO — Q-2026-001');
});
