import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMatterStage, BANKRUPTCY_PACK, DUI_PACK, ESTATE_PLANNING_PACK, PRACTICE_PACKS, PROBATE_PACK, validatePracticePack } from '../src/practicePacks.mjs';

test('practice pack registry includes required non-QDRO expansion packs', () => {
  const ids = PRACTICE_PACKS.map((pack) => pack.id);
  assert.deepEqual(ids.sort(), ['bankruptcy', 'dui', 'estate-planning', 'probate', 'qdro-family'].sort());
  for (const pack of [ESTATE_PLANNING_PACK, PROBATE_PACK, BANKRUPTCY_PACK, DUI_PACK]) {
    assert.equal(validatePracticePack(pack), true);
    assert.ok(pack.factSchema);
    assert.ok(pack.templates.length);
    assert.ok(pack.corpusScopes.length);
  }
});

test('stage advancement enforces entry criteria and approval gates', () => {
  const matter = { id: 'M1', baseline: { client_display_name: 'Client' }, documents: [] };
  assert.throws(() => advanceMatterStage(PROBATE_PACK, matter, 'filed'), /stage criteria unmet/);
  const withPetition = { ...matter, documents: [{ id: 'p', name: 'Petition.pdf', type: 'petition' }, { id: 'd', name: 'Death Certificate.pdf', type: 'death_certificate' }] };
  assert.throws(() => advanceMatterStage(PROBATE_PACK, withPetition, 'filed'), /approved gate/);
  const advanced = advanceMatterStage(PROBATE_PACK, withPetition, 'filed', { approvedGate: { status: 'approved' } });
  assert.equal(advanced.stage, 'filed');
});
