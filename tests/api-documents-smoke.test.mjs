import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../src/audit.mjs';
import { createSession, createUser } from '../src/auth.mjs';
import { createLexyService } from '../src/api.mjs';
import { createDocumentGenerationRequest, createDocumentTemplate, requestDocumentApproval } from '../src/documents.mjs';
import { createMatterRepository, createStaticMatterSource } from '../src/repository.mjs';
import { answerWithCitations, createCorpusSource } from '../src/corpus.mjs';
import { createFilingPacket, requestFilingApproval, validateFilingPacket } from '../src/filing.mjs';
import { createMissingRequirementTasks, QDRO_FAMILY_PACK } from '../src/practicePacks.mjs';
import { defineServiceRequirement, ingestProofOfService, prepareServicePacket } from '../src/service.mjs';

test('end-to-end LexyOS contract smoke covers login, matter, pack, document, filing, corpus, service, audit', async () => {
  const user = createUser({ id: 'willie', email: 'willie@peacock.test', memberships: [{ tenantId: 'peacock', roles: ['attorney'] }] });
  const session = createSession({ user, tenantId: 'peacock', provider: 'google-workspace' });
  const matterRow = { matter_id: 'Q1', tenantId: 'peacock', client_display_name: 'Jane Doe', matter_type: 'QDRO', stage: 'drafting', baseline_data: { client_display_name: 'Jane Doe', plan_name: 'Fidelity', case_number: 'FA-1', court_name: 'Superior Court', date_of_judgment: '2025-01-01' } };
  const repo = createMatterRepository({ sources: [createStaticMatterSource('test', [matterRow])] });
  const auditLog = createAuditLog();
  const service = createLexyService({ matterRepository: repo, auditLog });

  const mattersResponse = await service.handle({ path: '/matters', session });
  assert.equal(mattersResponse.status, 200);
  const matter = mattersResponse.body[0];

  const missingTasks = createMissingRequirementTasks(QDRO_FAMILY_PACK, { ...matter, documents: [{ name: 'Judgment.pdf', type: 'judgment' }] });
  assert.ok(missingTasks.some((task) => task.title.includes('plan_document')));

  const template = createDocumentTemplate({ id: 'qdro-template', name: 'QDRO Draft', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] });
  const docRequest = createDocumentGenerationRequest({ template, matter });
  assert.equal(docRequest.status, 'ready_for_generation');
  assert.equal(requestDocumentApproval(docRequest).type, 'attorney_document_review');

  const packet = createFilingPacket({ id: 'filing1', matterId: matter.id, filingType: 'QDRO filing', documents: [{ id: 'q', name: 'QDRO.pdf', type: 'qdro' }, { id: 'j', name: 'Judgment.pdf', type: 'judgment' }] });
  assert.equal(validateFilingPacket(packet, QDRO_FAMILY_PACK.filingRequirements).ok, true);
  assert.equal(requestFilingApproval(packet).type, 'filing_approval');

  const source = createCorpusSource({ id: 'memo1', title: 'Firm QDRO Memo', jurisdiction: 'CT', practiceArea: 'family_qdro', sourceType: 'firm_memo', text: 'QDRO drafts require plan name and judgment review before filing.' });
  assert.equal(answerWithCitations({ question: 'What does a QDRO draft require?', sources: [source], scope: { practiceArea: 'family_qdro', jurisdiction: 'CT' } }).supported, true);

  const req = defineServiceRequirement({ id: 'mail-service', method: 'mail', requiredDocuments: ['notice'] });
  const svcPacket = prepareServicePacket({ id: 'svc1', matter, requirement: req, documents: [{ id: 'n', name: 'Notice.pdf', type: 'notice' }], recipient: 'Plan Administrator' });
  assert.equal(ingestProofOfService({ packet: svcPacket, proofDocument: { id: 'proof', name: 'Proof.pdf' } }).gate.type, 'proof_of_service_review');

  auditLog.append({ actor: session.userId, actorType: 'human', source: 'api', action: 'smoke.completed', matterId: matter.id });
  const auditResponse = await service.handle({ path: '/audit-events', session });
  assert.equal(auditResponse.body.length, 1);
});
