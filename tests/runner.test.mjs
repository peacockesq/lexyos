import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRun, recordToolCall, enforceToolAllowlist, executeTaskWithAgent } from '../src/runner.mjs';

test('agent runner records lifecycle and allowed tool calls durably', async () => {
  const run = createAgentRun({ id: 'run1', taskId: 'task1', matterId: 'M1', agent: 'rog', allowedTools: ['corpus.search'] });
  assert.equal(run.status, 'queued');
  const call = recordToolCall(run, { tool: 'corpus.search', args: { q: 'QDRO' }, result: { ok: true } });
  assert.equal(call.runId, 'run1');
  assert.equal(enforceToolAllowlist(run, 'corpus.search'), true);
  assert.throws(() => enforceToolAllowlist(run, 'filing.submit'), /not allowed/);
});

test('executeTaskWithAgent captures success and failure without losing audit trail', async () => {
  const success = await executeTaskWithAgent({ task: { id: 't1', matterId: 'M1' }, agent: 'rog', allowedTools: [] }, async () => ({ value: 42 }));
  assert.equal(success.status, 'succeeded');
  assert.equal(success.result.value, 42);
  const failure = await executeTaskWithAgent({ task: { id: 't2', matterId: 'M1' }, agent: 'rog', allowedTools: [] }, async () => { throw new Error('boom'); });
  assert.equal(failure.status, 'failed');
  assert.match(failure.error, /boom/);
});
