import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createUser } from '../src/auth.mjs';
import { approveGate } from '../src/gates.mjs';
import { createFilingPacket, requestFilingApproval, submitApprovedFiling } from '../src/filing.mjs';

function sessionFor(tenantId) {
  const user = createUser({ id: `${tenantId}-attorney`, email: `attorney@${tenantId}.test`, memberships: [{ tenantId, roles: ['attorney'] }] });
  return createSession({ user, tenantId });
}

test('filing submission requires session access to the packet matter', () => {
  const packet = createFilingPacket({ id: 'p-cross', matterId: 'A1', filingType: 'QDRO filing', documents: [{ id: 'q', name: 'QDRO.pdf', type: 'qdro' }] });
  const firmBSession = sessionFor('firm-b');
  assert.throws(
    () => approveGate(requestFilingApproval(packet), { session: firmBSession, matter: { id: 'A1', tenantId: 'firm-a' } }),
    /cannot access gate matter/,
  );
  const gate = { ...requestFilingApproval(packet), status: 'approved', decision: { decidedBy: 'forged', tenantId: 'firm-b' } };

  assert.throws(
    () => submitApprovedFiling(packet, { gate, session: firmBSession, matter: { id: 'A1', tenantId: 'firm-a' } }),
    /cannot access packet matter/,
  );
});
