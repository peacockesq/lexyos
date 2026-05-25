export function createTask({ id, matterId, title, kind = 'admin', assignedTo = 'agent', requiresGate = null, gateId = null, prerequisites = [], payload = {} }) {
  if (!id || !title) throw new Error('task id and title are required');
  return { id, matterId, title, kind, assignedTo, requiresGate, gateId, prerequisites, payload, status: prerequisites.length ? 'todo' : 'ready', auditEvents: [] };
}

export function promoteReady(tasks, completedIds = new Set()) {
  return tasks.map((task) => task.status === 'todo' && task.prerequisites.every((id) => completedIds.has(id)) ? { ...task, status: 'ready' } : task);
}

export function claimTask(task, { actor }) {
  if (task.status !== 'ready') throw new Error('only ready tasks can be claimed');
  return { ...task, status: 'running', claimedBy: actor, claimedAt: new Date().toISOString() };
}

export function completeTask(task, { actor, result = {}, approvedGate = null } = {}) {
  if (task.requiresGate) {
    if (approvedGate?.status !== 'approved') throw new Error(`task requires approved gate: ${task.requiresGate}`);
    if (approvedGate.matterId !== task.matterId) throw new Error('task approved gate matter mismatch');
    if (task.gateId && approvedGate.id !== task.gateId) throw new Error('task approved gate id mismatch');
    if (!task.gateId && approvedGate.type !== task.requiresGate && approvedGate.action !== task.requiresGate) throw new Error('task approved gate type/action mismatch');
  }
  return { ...task, status: 'done', completedBy: actor, completedAt: new Date().toISOString(), result };
}

export function createIntakeTasksFromEvent(event) {
  const baseId = event.id ?? `intake_${Date.now()}`;
  return [
    createTask({ id: `${baseId}:classify`, matterId: event.matterId, title: 'Classify intake practice area', kind: 'intake', payload: event }),
    createTask({ id: `${baseId}:missing-info`, matterId: event.matterId, title: 'Request missing documents/facts with approved template', kind: 'follow_up', requiresGate: 'external_communication', payload: event }),
  ];
}

export function summarizeCockpit({ tasks = [], gates = [], auditEvents = [], matters = [] }) {
  return {
    matters: matters.length,
    readyTasks: tasks.filter((task) => task.status === 'ready').length,
    blockedTasks: tasks.filter((task) => task.status === 'blocked').length,
    humanGatesPending: gates.filter((gate) => gate.status === 'pending').length,
    agentRuns: auditEvents.filter((event) => event.action?.startsWith('agent.')).length,
  };
}
