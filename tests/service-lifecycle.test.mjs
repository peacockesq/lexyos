import test from 'node:test';
import assert from 'node:assert/strict';
import { approveGate } from '../src/gates.mjs';
import { createSession, createUser } from '../src/auth.mjs';
import { createServiceLifecycle, defineServiceRequirement, prepareServicePacket, requestServiceApproval, markServiceSent, ingestProofOfService, createProofFilingHandoff } from '../src/service.mjs';

function paralegal() {
  const user = createUser({ id: 'p1', email: 'p@firm.test', memberships: [{ tenantId: 'firm', roles: ['paralegal'] }] });
  return createSession({ user, tenantId: 'firm' });
}

test('service lifecycle requires approval, tracks status, reviews proof, and creates filing handoff', () => {
  const matter = { id: 'M1', tenantId: 'firm' };
  const requirement = defineServiceRequirement({ id: 'mail-notice', method: 'mail', requiredDocuments: ['notice'] });
  const packet = prepareServicePacket({ id: 'svc1', matter, requirement, recipient: 'Plan Admin', documents: [{ id: 'n1', name: 'Notice.pdf', type: 'notice' }] });
  const gate = approveGate(requestServiceApproval(packet), { session: paralegal(), matter });
  const sent = markServiceSent(packet, { gate, session: paralegal(), matter, vendor: { id: 'v1', name: 'Mail Vendor' }, trackingId: 'trk1' });
  const lifecycle = createServiceLifecycle(sent);
  assert.equal(lifecycle.currentStatus, 'sent');
  const proof = ingestProofOfService({ packet: sent, proofDocument: { id: 'proof1', name: 'Proof.pdf' }, extracted: { servedAt: '2026-05-24' } });
  const handoff = createProofFilingHandoff(proof.packet);
  assert.equal(handoff.kind, 'filing_proof_of_service');
});
