export function createAgentRun({ id, taskId, matterId, agent, allowedTools = [], input = {} }) {
  if (!id || !taskId || !agent) throw new Error('agent run id, taskId, and agent are required');
  return {
    id,
    taskId,
    matterId,
    agent,
    allowedTools,
    input,
    status: 'queued',
    toolCalls: [],
    createdAt: new Date().toISOString(),
  };
}

export function enforceToolAllowlist(run, tool) {
  if (!run.allowedTools.includes(tool)) throw new Error(`tool not allowed for run ${run.id}: ${tool}`);
  return true;
}

export function recordToolCall(run, { id = `${run.id}:tool:${run.toolCalls.length + 1}`, tool, args = {}, result = null, status = 'succeeded' }) {
  enforceToolAllowlist(run, tool);
  const call = { id, runId: run.id, tool, args, result, status, calledAt: new Date().toISOString() };
  run.toolCalls.push(call);
  return call;
}

export async function executeTaskWithAgent({ task, agent, allowedTools = [], input = {} }, fn) {
  const run = createAgentRun({ id: `run_${task.id}`, taskId: task.id, matterId: task.matterId, agent, allowedTools, input });
  const started = { ...run, status: 'running', startedAt: new Date().toISOString() };
  try {
    const result = await fn({ run: started });
    return { ...started, status: 'succeeded', result, completedAt: new Date().toISOString() };
  } catch (error) {
    return { ...started, status: 'failed', error: error.message, completedAt: new Date().toISOString() };
  }
}
