import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createUser } from '../src/auth.mjs';
import { approveGate } from '../src/gates.mjs';
import { attachDocumentToPacket, createFilingPacket, getFilingStatus, ingestFilingReceipt, requestFilingApproval, submitApprovedFiling, validateFilingPacket } from '../src/filing.mjs';

test('LexyFiling validates packets and blocks autonomous submission without approved gate', () => {
  const user = createUser({ id: 'willie', email: 'willie@example.test', memberships: [{ tenantId: 'firm', roles: ['attorney'] }] });
  const session = createSession({ user, tenantId: 'firm' });
  let packet = createFilingPacket({ id: 'p1', matterId: 'Q1', jurisdiction: 'CT', filingType: 'QDRO filing', documents: [{ id: 'd1', name: 'Signed QDRO.pdf', type: 'qdro' }] });
  packet = attachDocumentToPacket(packet, { id: 'd2', name: 'Judgment.pdf', type: 'judgment' });
  assert.deepEqual(validateFilingPacket(packet, { requiredDocumentTypes: ['qdro', 'judgment'] }), { ok: true, errors: [] });

  const matter = { id: 'Q1', tenantId: 'firm' };
  const gate = requestFilingApproval(packet);
  assert.throws(() => submitApprovedFiling(packet, { gate, session, matter }), /approved human gate required/);
  const approved = approveGate(gate, { session, matter });
  const submitted = submitApprovedFiling(packet, { gate: approved, session, matter });
  assert.equal(submitted.status, 'submitted');
  const receipted = ingestFilingReceipt(submitted, { status: 'accepted', docketNo: '123' });
  assert.equal(getFilingStatus(receipted).status, 'accepted');
});

test('LexyFiling reports missing document and payment prerequisites', () => {
  const packet = createFilingPacket({ id: 'p2', matterId: 'Q2', filingType: 'petition', documents: [] });
  const result = validateFilingPacket(packet, { requiredDocumentTypes: ['petition'], requiresFee: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing required document: petition/);
  assert.match(result.errors.join('\n'), /filing fee/);
});
