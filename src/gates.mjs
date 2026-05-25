import { LEXY_PERMISSIONS, can, canAccessMatter } from './auth.mjs';

export function createHumanGate({ id, matterId, type, requestedBy, action, payload = {}, requiredRole = 'attorney' }) {
  if (!id || !type || !action) throw new Error('gate id, type, and action are required');
  return { id, matterId, type, requestedBy, action, payload, requiredRole, status: 'pending', decision: null };
}

export function approveGate(gate, { decidedBy, session, matter = null, reason = '' }) {
  if (gate.status !== 'pending') throw new Error('gate already decided');
  if (!session || !can(session, LEXY_PERMISSIONS.GATE_DECIDE)) throw new Error('gate decision requires authorized session');
  if (gate.matterId && !matter) throw new Error('gate matter context required');
  if (matter && (matter.id !== gate.matterId || !canAccessMatter(session, matter))) throw new Error('cannot access gate matter');
  if (!session.roles.includes(gate.requiredRole) && !session.roles.includes('owner')) throw new Error(`gate requires ${gate.requiredRole}`);
  return { ...gate, status: 'approved', decision: { decidedBy: decidedBy ?? session.userId, tenantId: session.tenantId, role: session.roles.includes('owner') ? 'owner' : gate.requiredRole, reason, decidedAt: new Date().toISOString() } };
}

export function rejectGate(gate, { decidedBy, session, matter = null, reason }) {
  if (gate.status !== 'pending') throw new Error('gate already decided');
  if (!session || !can(session, LEXY_PERMISSIONS.GATE_DECIDE)) throw new Error('gate decision requires authorized session');
  if (gate.matterId && !matter) throw new Error('gate matter context required');
  if (matter && (matter.id !== gate.matterId || !canAccessMatter(session, matter))) throw new Error('cannot access gate matter');
  return { ...gate, status: 'rejected', decision: { decidedBy: decidedBy ?? session.userId, tenantId: session.tenantId, roles: session.roles, reason, decidedAt: new Date().toISOString() } };
}

export function requireApprovedGate(gate, action, { matterId = null, type = null } = {}) {
  if (!gate || gate.action !== action || gate.status !== 'approved') throw new Error(`approved human gate required for ${action}`);
  if (matterId && gate.matterId !== matterId) throw new Error('approved gate matter mismatch');
  if (type && gate.type !== type) throw new Error('approved gate type mismatch');
  return true;
}
