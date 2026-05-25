import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createUser } from '../src/auth.mjs';
import { createFilingToolRegistry, createFilingPacket, requestFilingApproval } from '../src/filing.mjs';
import { approveGate } from '../src/gates.mjs';

function attorneySession() {
  const user = createUser({ id: 'u1', email: 'a@firm.test', memberships: [{ tenantId: 'firm', roles: ['attorney'] }] });
  return createSession({ user, tenantId: 'firm' });
}

test('filing tool registry exposes prepare, validate, approve-request, submit, status, and receipt actions', () => {
  const session = attorneySession();
  const matter = { id: 'M1', tenantId: 'firm' };
  const tools = createFilingToolRegistry({ session, matter });
  const packet = tools.prepare({ id: 'p1', matterId: 'M1', filingType: 'QDRO', documents: [{ id: 'd1', name: 'QDRO.pdf', type: 'qdro' }] });
  assert.deepEqual(tools.validate(packet, { requiredDocumentTypes: ['qdro'] }), { ok: true, errors: [] });
  const gate = approveGate(requestFilingApproval(packet), { session, matter });
  const submitted = tools.submit(packet, { gate, validation: { ok: true, errors: [] } });
  assert.equal(tools.status(submitted).status, 'submitted');
  assert.equal(tools.receipt(submitted, { status: 'accepted' }).status, 'accepted');
});
