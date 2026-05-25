import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaPromptContext, createEditProposal } from '../src/eva.mjs';

test('buildEvaPromptContext includes matter baseline, selected document, and selected text', () => {
  const context = buildEvaPromptContext({
    matter: { id: 'Q1', displayName: 'Jane Doe — QDRO', baseline: { plan_name: 'Fidelity', jurisdiction: 'CT' } },
    document: { id: 'doc1', name: 'Draft QDRO.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    selectedText: 'The Alternate Payee shall receive fifty percent.',
  });

  assert.match(context, /Jane Doe — QDRO/);
  assert.match(context, /Fidelity/);
  assert.match(context, /Draft QDRO\.docx/);
  assert.match(context, /Alternate Payee/);
});

test('createEditProposal defaults to tracked-change proposal not silent mutation', () => {
  const proposal = createEditProposal({
    instruction: 'Add survivor benefit language',
    selectedText: 'Benefits are divided equally.',
  });

  assert.equal(proposal.mode, 'tracked_change');
  assert.equal(proposal.requiresApproval, true);
  assert.match(proposal.auditLabel, /Eva proposed edit/);
});
