import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatterRepository } from '../src/repository.mjs';

const nocodbRows = [
  {
    matter_id: 'N-1',
    client_name: 'Nora Client',
    matter_type: 'QDRO',
    stage: 'missing_info',
    drive_folder_id: 'drive-nora',
    plan_name: 'TIAA',
    court: 'Stamford Superior Court',
  },
];

const intakeRows = [
  {
    id: 'I-1',
    name: 'Ian Intake',
    type: 'QDRO',
    status: 'intake',
    folderId: 'drive-ian',
    data: { plan_name: 'Vanguard', spouse: 'Alex Intake' },
  },
];

test('repository can load compatible matters from no-code DB and intake adapters', async () => {
  const repo = createMatterRepository({
    sources: [
      { name: 'nocodb', listMatters: async () => nocodbRows },
      { name: 'intake', listMatters: async () => intakeRows },
    ],
  });

  const matters = await repo.listMatters();

  assert.equal(matters.length, 2);
  assert.equal(matters[0].source, 'nocodb');
  assert.equal(matters[0].baseline.plan_name, 'TIAA');
  assert.equal(matters[1].source, 'intake');
  assert.equal(matters[1].baseline.spouse, 'Alex Intake');
});

test('repository deduplicates matters by stable matter id and prefers later sources', async () => {
  const repo = createMatterRepository({
    sources: [
      { name: 'nocodb', listMatters: async () => [{ matter_id: 'DUP', client_name: 'Old Name', matter_type: 'QDRO' }] },
      { name: 'intake', listMatters: async () => [{ matter_id: 'DUP', client_name: 'New Name', matter_type: 'QDRO', baseline_data: { paid: true } }] },
    ],
  });

  const matters = await repo.listMatters();

  assert.equal(matters.length, 1);
  assert.equal(matters[0].clientName, 'New Name');
  assert.equal(matters[0].baseline.paid, true);
});
