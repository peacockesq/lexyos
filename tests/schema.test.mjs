import test from 'node:test';
import assert from 'node:assert/strict';
import { LEXY_MATTER_FIELDS, classifyFieldForLexy, buildNocoDbSchemaPlan } from '../src/schema.mjs';

test('Lexy canonical schema includes reusable core legal fields and QDRO pack fields', () => {
  const names = LEXY_MATTER_FIELDS.map((field) => field.name);
  assert.ok(names.includes('matter_id'));
  assert.ok(names.includes('client_display_name'));
  assert.ok(names.includes('drive_folder_id'));
  assert.ok(names.includes('plan_name'));
  assert.ok(names.includes('plan_admin_tpa'));
  assert.ok(names.includes('qdro_count'));
});

test('classifyFieldForLexy separates product-core, qdro-pack, and Peacock-only operational fields', () => {
  assert.equal(classifyFieldForLexy('matter_id'), 'lexy_core');
  assert.equal(classifyFieldForLexy('plan_name'), 'qdro_pack');
  assert.equal(classifyFieldForLexy('last_intake_token_id'), 'peacock_ops');
});

test('buildNocoDbSchemaPlan adds missing canonical fields without dropping legacy fields', () => {
  const existing = [
    { column_name: 'Matter_ID', title: 'Matter ID', uidt: 'SingleLineText' },
    { column_name: 'Title', title: 'Title', uidt: 'SingleLineText' },
    { column_name: 'Current_Status', title: 'Current Status', uidt: 'SingleSelect' },
  ];
  const plan = buildNocoDbSchemaPlan(existing);

  assert.ok(plan.add.some((field) => field.name === 'matter_id'));
  assert.ok(plan.add.some((field) => field.name === 'drive_folder_id'));
  assert.deepEqual(plan.drop, []);
  assert.ok(plan.legacy.some((field) => field.column_name === 'Current_Status'));
});
