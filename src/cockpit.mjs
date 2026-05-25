export function buildCockpitViewModel({ matters = [], tasks = [], gates = [], filings = [], servicePackets = [], auditEvents = [], deadlines = [] } = {}) {
  const now = Date.now();
  const overdueDeadlines = deadlines.filter((deadline) => deadline.dueAt && Date.parse(deadline.dueAt) < now && deadline.status !== 'done');
  const cards = {
    matters: matters.length,
    readyTasks: tasks.filter((task) => task.status === 'ready').length,
    blockedTasks: tasks.filter((task) => task.status === 'blocked').length,
    pendingGates: gates.filter((gate) => gate.status === 'pending').length,
    submittedFilings: filings.filter((filing) => filing.status === 'submitted').length,
    serviceInFlight: servicePackets.filter((packet) => !['closed', 'failed'].includes(packet.status)).length,
    overdueDeadlines: overdueDeadlines.length,
  };
  return {
    cards,
    matters: matters.map((matter) => ({
      ...matter,
      tasks: tasks.filter((task) => task.matterId === matter.id),
      gates: gates.filter((gate) => gate.matterId === matter.id),
      filings: filings.filter((filing) => filing.matterId === matter.id),
      servicePackets: servicePackets.filter((packet) => packet.matterId === matter.id),
      deadlines: deadlines.filter((deadline) => deadline.matterId === matter.id),
      auditTimeline: auditEvents.filter((event) => event.matterId === matter.id),
    })),
  };
}
