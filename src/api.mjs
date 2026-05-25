import { canAccessMatter, requirePermission, LEXY_PERMISSIONS } from './auth.mjs';

export function createLexyService({ matterRepository, tasks = [], gates = [], auditLog }) {
  async function accessibleMatters(session) {
    const matters = await matterRepository.listMatters();
    return matters.filter((matter) => canAccessMatter(session, matter));
  }

  async function accessibleMatterIds(session) {
    return new Set((await accessibleMatters(session)).map((matter) => matter.id));
  }

  return {
    async handle({ method = 'GET', path, session, body = {} }) {
      if (path === '/matters' && method === 'GET') {
        requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
        return ok(await accessibleMatters(session));
      }
      if (path === '/tasks' && method === 'GET') {
        requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
        const ids = await accessibleMatterIds(session);
        return ok(tasks.filter((task) => ids.has(task.matterId)));
      }
      if (path === '/tasks' && method === 'POST') {
        requirePermission(session, LEXY_PERMISSIONS.TASK_RUN);
        const ids = await accessibleMatterIds(session);
        if (!ids.has(body.matterId)) return { status: 403, body: { error: 'matter_forbidden' } };
        tasks.push(body);
        auditLog?.append({ actor: session.userId, actorType: 'human', source: 'api', action: 'task.created', matterId: body.matterId, metadata: { taskId: body.id } });
        return created(body);
      }
      if (path === '/gates' && method === 'GET') {
        requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
        const ids = await accessibleMatterIds(session);
        return ok(gates.filter((gate) => ids.has(gate.matterId)));
      }
      if (path === '/audit-events' && method === 'GET') {
        requirePermission(session, LEXY_PERMISSIONS.MATTER_READ);
        const ids = await accessibleMatterIds(session);
        return ok((auditLog?.list() ?? []).filter((event) => !event.matterId || ids.has(event.matterId)));
      }
      return { status: 404, body: { error: 'not_found' } };
    },
  };
}

function ok(body) { return { status: 200, body }; }
function created(body) { return { status: 201, body }; }
