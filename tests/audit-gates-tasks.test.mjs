import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../src/audit.mjs';
import { createSession, createUser } from '../src/auth.mjs';
import { approveGate, createHumanGate, requireApprovedGate } from '../src/gates.mjs';
import { claimTask, completeTask, createIntakeTasksFromEvent, summarizeCockpit } from '../src/tasks.mjs';

test('audit events are append-only immutable records scoped to matter', () => {
  const log = createAuditLog({ clock: () => new Date('2026-01-01T00:00:00Z') });
  const event = log.append({ actor: 'eva', actorType: 'agent', source: 'mcp', action: 'agent.tool_call', matterId: 'Q1', metadata: { tool: 'corpus.query' } });
  assert.equal(event.occurredAt, '2026-01-01T00:00:00.000Z');
  assert.throws(() => { event.action = 'mutated'; }, /read only|Cannot assign/);
  assert.equal(log.forMatter('Q1').length, 1);
});

test('human gates enforce attorney approval before gated action', () => {
  const user = createUser({ id: 'willie', email: 'willie@example.test', memberships: [{ tenantId: 'firm', roles: ['attorney'] }] });
  const session = createSession({ user, tenantId: 'firm' });
  const gate = createHumanGate({ id: 'g1', matterId: 'Q1', type: 'filing_approval', requestedBy: 'agent', action: 'submit_filing:p1' });
  assert.throws(() => requireApprovedGate(gate, 'submit_filing:p1'), /approved human gate required/);
  const approved = approveGate(gate, { session, matter: { id: 'Q1', tenantId: 'firm' } });
  assert.equal(requireApprovedGate(approved, 'submit_filing:p1'), true);
});

test('intake tasks and cockpit summary expose agent admin OS primitives', () => {
  const tasks = createIntakeTasksFromEvent({ id: 'lead1', matterId: 'M1', email: 'client@example.com' });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].requiresGate, 'external_communication');
  const running = claimTask(tasks[0], { actor: 'agent' });
  const done = completeTask(running, { actor: 'agent', result: { practiceArea: 'QDRO' } });
  assert.equal(done.status, 'done');
  const metrics = summarizeCockpit({ tasks, gates: [{ status: 'pending' }], auditEvents: [{ action: 'agent.run' }], matters: [{}] });
  assert.deepEqual(metrics, { matters: 1, readyTasks: 2, blockedTasks: 0, humanGatesPending: 1, agentRuns: 1 });
});
