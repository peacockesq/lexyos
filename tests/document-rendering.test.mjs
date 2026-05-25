import test from 'node:test';
import assert from 'node:assert/strict';
import { approveGate } from '../src/gates.mjs';
import { createSession, createUser } from '../src/auth.mjs';
import { applyAdeuTrackedChange, createDocumentGenerationRequest, createDocumentTemplate, renderDocumentArtifact, requestDocumentApproval } from '../src/documents.mjs';

function attorney() {
  const user = createUser({ id: 'a1', email: 'a@firm.test', memberships: [{ tenantId: 'firm', roles: ['attorney'] }] });
  return createSession({ user, tenantId: 'firm' });
}

test('document rendering creates artifact lifecycle and requires attorney gate before Adeu application', () => {
  const template = createDocumentTemplate({ id: 'qdro', name: 'QDRO', requiredFacts: ['client_display_name'], body: 'Client: {{client_display_name}} / Case: {{case_number}}' });
  const matter = { id: 'M1', clientName: 'Client A', baseline: { client_display_name: 'Client A', case_number: 'FA-1' } };
  const request = createDocumentGenerationRequest({ template, matter });
  const artifact = renderDocumentArtifact({ request, template, matter });
  assert.equal(artifact.status, 'rendered');
  assert.match(artifact.content, /Client A/);
  const gate = approveGate(requestDocumentApproval(request), { session: attorney(), matter: { id: 'M1', tenantId: 'firm' } });
  const applied = applyAdeuTrackedChange({ artifact, gate, session: attorney(), matter: { id: 'M1', tenantId: 'firm' }, change: { targetText: 'Client A', newText: 'Client Alpha' } });
  assert.equal(applied.status, 'tracked_change_applied');
  assert.match(applied.content, /Client Alpha/);
});
