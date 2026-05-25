import test from 'node:test';
import assert from 'node:assert/strict';
import { QDRO_FAMILY_PACK, advanceMatterStage, createMissingRequirementTasks, findMissingPackRequirements, loadPracticePack } from '../src/practicePacks.mjs';
import { createFailedServiceEscalation, createVendorAssignmentTask, defineServiceRequirement, ingestProofOfService, prepareServicePacket } from '../src/service.mjs';

test('practice pack loads QDRO rules and creates missing fact/document tasks', () => {
  const pack = loadPracticePack(QDRO_FAMILY_PACK);
  const matter = { id: 'Q1', baseline: { client_display_name: 'Jane Doe', case_number: 'FA-1' }, documents: [{ name: 'Judgment.pdf', type: 'judgment' }] };
  const missing = findMissingPackRequirements(pack, matter);
  assert.ok(missing.facts.includes('plan_name'));
  assert.ok(missing.documents.includes('plan_document'));
  const tasks = createMissingRequirementTasks(pack, matter);
  assert.ok(tasks.some((task) => task.kind === 'missing_fact'));
  assert.equal(advanceMatterStage(pack, { ...matter, stage: 'intake' }, 'drafting').stage, 'drafting');
});

test('service automation prepares packets, proof review gates, and failed-service escalation tasks', () => {
  const requirement = defineServiceRequirement({ id: 'serve-spouse', jurisdiction: 'CT', method: 'mail', requiredDocuments: ['summons'] });
  const packet = prepareServicePacket({ id: 'svc1', matter: { id: 'M1' }, requirement, documents: [{ id: 'd1', name: 'Summons.pdf', type: 'summons' }], recipient: 'Other Party' });
  assert.equal(packet.status, 'ready');
  assert.equal(createVendorAssignmentTask(packet).kind, 'service_vendor');
  const proof = ingestProofOfService({ packet, proofDocument: { id: 'proof1', name: 'Proof.pdf' }, extracted: { date: '2026-01-02' } });
  assert.equal(proof.gate.type, 'proof_of_service_review');
  assert.equal(createFailedServiceEscalation(packet, 'no response').requiresGate, 'attorney_strategy_review');
});
