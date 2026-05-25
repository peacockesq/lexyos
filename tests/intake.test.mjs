import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntakeEvent, createIntakeMatterDraft, createIntakeWorkflow } from '../src/intake.mjs';

test('intake classifies web/email/fax/call/text events into practice and urgency', () => {
  assert.equal(classifyIntakeEvent({ channel: 'email', text: 'Need a QDRO for pension division' }).practiceArea, 'family_qdro');
  assert.equal(classifyIntakeEvent({ channel: 'fax', text: 'Probate petition death certificate' }).practiceArea, 'probate');
  assert.equal(classifyIntakeEvent({ channel: 'sms', text: 'DUI arrest tomorrow hearing' }).urgency, 'high');
});

test('intake workflow creates matter draft, representation gates, and missing-info tasks', () => {
  const event = { id: 'evt1', tenantId: 'firm-a', channel: 'web', text: 'Need QDRO, have judgment but missing plan docs', contact: { name: 'Client A', email: 'a@example.test' } };
  const workflow = createIntakeWorkflow(event);
  assert.equal(workflow.matterDraft.tenantId, 'firm-a');
  assert.equal(workflow.matterDraft.matter_type, 'family_qdro');
  assert.ok(workflow.gates.some((gate) => gate.type === 'conflict_check'));
  assert.ok(workflow.gates.some((gate) => gate.type === 'representation_acceptance'));
  assert.ok(workflow.tasks.some((task) => task.kind === 'missing_info'));
});
