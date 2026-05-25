import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCockpitViewModel } from '../src/cockpit.mjs';

test('cockpit view model exposes operational cards and matter drilldown sections', () => {
  const view = buildCockpitViewModel({
    matters: [{ id: 'M1', stage: 'drafting' }],
    tasks: [{ id: 't1', matterId: 'M1', status: 'ready' }, { id: 't2', matterId: 'M1', status: 'blocked' }],
    gates: [{ id: 'g1', matterId: 'M1', status: 'pending' }],
    filings: [{ id: 'f1', matterId: 'M1', status: 'submitted' }],
    servicePackets: [{ id: 's1', matterId: 'M1', status: 'sent' }],
    auditEvents: [{ id: 'a1', matterId: 'M1', action: 'task.created' }],
    deadlines: [{ id: 'd1', matterId: 'M1', dueAt: '2020-01-01' }],
  });
  assert.equal(view.cards.readyTasks, 1);
  assert.equal(view.cards.blockedTasks, 1);
  assert.equal(view.cards.pendingGates, 1);
  assert.equal(view.cards.overdueDeadlines, 1);
  assert.equal(view.matters[0].filings.length, 1);
  assert.equal(view.matters[0].auditTimeline.length, 1);
});
