import { requireApprovedGate } from './gates.mjs';
import { createHumanGate } from './gates.mjs';
import { createTask } from './tasks.mjs';
import { canAccessMatter } from './auth.mjs';

export function defineServiceRequirement({ id, jurisdiction, method, requiredDocuments = [], proofRequired = true, staleAfterDays = 30 }) {
  if (!id || !method) throw new Error('service requirement id and method are required');
  return { id, jurisdiction, method, requiredDocuments, proofRequired, staleAfterDays };
}

export function prepareServicePacket({ id, matter, requirement, documents = [], recipient, vendor = null }) {
  const missingDocuments = requirement.requiredDocuments.filter((type) => !documents.some((doc) => doc.type === type || doc.name?.toLowerCase().includes(type.toLowerCase())));
  return { id, matterId: matter.id, recipient, vendor, requirementId: requirement.id, method: requirement.method, documents, missingDocuments, status: missingDocuments.length ? 'blocked' : 'ready', history: [] };
}

export function requestServiceApproval(packet) {
  return createHumanGate({ id: `gate_service_${packet.id}`, matterId: packet.matterId, type: 'service_approval', action: `send_service:${packet.id}`, requestedBy: 'agent', payload: { packetId: packet.id }, requiredRole: 'paralegal' });
}

export function markServiceSent(packet, { gate, vendor, trackingId, session = null, matter = null }) {
  requireApprovedGate(gate, `send_service:${packet.id}`, { matterId: packet.matterId, type: 'service_approval' });
  if (session && !matter) throw new Error('service matter context required');
  if (matter && (matter.id !== packet.matterId || !canAccessMatter(session, matter))) throw new Error('cannot access service matter');
  return { ...packet, vendor: vendor ?? packet.vendor, trackingId, status: 'sent', history: [...(packet.history ?? []), { action: 'sent', at: new Date().toISOString(), trackingId }] };
}

export function createServiceLifecycle(packet) {
  return { packetId: packet.id, matterId: packet.matterId, currentStatus: packet.status, history: packet.history ?? [] };
}

export function createVendorAssignmentTask(packet) {
  return createTask({ id: `${packet.id}:vendor`, matterId: packet.matterId, title: `Assign service vendor for ${packet.recipient}`, kind: 'service_vendor', requiresGate: 'service_approval', payload: { packetId: packet.id } });
}

export function ingestProofOfService({ packet, proofDocument, extracted = {} }) {
  const gate = createHumanGate({ id: `gate_proof_${packet.id}`, matterId: packet.matterId, type: 'proof_of_service_review', action: `accept_proof:${packet.id}`, requestedBy: 'system', payload: { proofDocument, extracted }, requiredRole: 'paralegal' });
  return { packet: { ...packet, status: 'proof_received', proofDocument, extracted, history: [...(packet.history ?? []), { action: 'proof_received', at: new Date().toISOString(), proofDocument }] }, gate };
}

export function createProofFilingHandoff(packet) {
  return createTask({ id: `${packet.id}:file-proof`, matterId: packet.matterId, title: `File proof of service for ${packet.recipient}`, kind: 'filing_proof_of_service', requiresGate: 'filing_approval', payload: { servicePacketId: packet.id, proofDocument: packet.proofDocument } });
}

export function createFailedServiceEscalation(packet, reason) {
  return createTask({ id: `${packet.id}:failed`, matterId: packet.matterId, title: `Escalate failed/stale service for ${packet.recipient}`, kind: 'service_escalation', requiresGate: 'attorney_strategy_review', payload: { packetId: packet.id, reason } });
}
