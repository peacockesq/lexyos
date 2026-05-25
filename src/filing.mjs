import { LEXY_PERMISSIONS, canAccessMatter, requirePermission } from './auth.mjs';
import { requireApprovedGate } from './gates.mjs';

export function createFilingPacket({ id, matterId, jurisdiction, filingType, documents = [], filingFee = null, serviceRequirements = [], createdBy = 'agent' }) {
  if (!id || !matterId || !filingType) throw new Error('filing packet id, matterId, and filingType are required');
  return { id, matterId, jurisdiction, filingType, documents, filingFee, serviceRequirements, createdBy, status: 'draft', history: [] };
}

export function attachDocumentToPacket(packet, document) {
  if (!document?.id || !document?.name) throw new Error('document id and name are required');
  return { ...packet, documents: [...packet.documents, document] };
}

export function validateFilingPacket(packet, requirements = {}) {
  const errors = [];
  const requiredDocumentTypes = requirements.requiredDocumentTypes ?? [];
  for (const type of requiredDocumentTypes) {
    if (!packet.documents.some((doc) => doc.type === type || doc.name?.toLowerCase().includes(type.toLowerCase()))) errors.push(`missing required document: ${type}`);
  }
  if (requirements.requiresFee && !packet.filingFee) errors.push('missing filing fee/payment prerequisite');
  if (requirements.requiresService && !packet.serviceRequirements.length) errors.push('missing service requirements');
  return { ok: errors.length === 0, errors };
}

export function requestFilingApproval(packet) {
  return { id: `gate_${packet.id}`, matterId: packet.matterId, type: 'filing_approval', action: `submit_filing:${packet.id}`, requestedBy: packet.createdBy, requiredRole: 'attorney', status: 'pending', payload: { packetId: packet.id } };
}

export function submitApprovedFiling(packet, { gate, session, matter, connector = manualFilingConnector(), validation = { ok: true, errors: [] } } = {}) {
  requirePermission(session, LEXY_PERMISSIONS.FILING_SUBMIT);
  if (!matter || matter.id !== packet.matterId || !canAccessMatter(session, matter)) throw new Error('filing session cannot access packet matter');
  if (!validation.ok) throw new Error(`cannot submit invalid filing packet: ${validation.errors.join('; ')}`);
  requireApprovedGate(gate, `submit_filing:${packet.id}`, { matterId: packet.matterId, type: 'filing_approval' });
  const submitted = connector.submit(packet);
  return { ...packet, status: 'submitted', submitted, history: [...packet.history, { action: 'submitted', at: new Date().toISOString(), receiptId: submitted.receiptId }] };
}

export function ingestFilingReceipt(packet, receipt) {
  return { ...packet, status: receipt.status ?? packet.status, history: [...packet.history, { action: 'receipt', at: new Date().toISOString(), receipt }] };
}

export function getFilingStatus(packet) {
  return { packetId: packet.id, status: packet.status, lastEvent: packet.history.at(-1) ?? null };
}

export function manualFilingConnector() {
  return { submit(packet) { return { connector: 'manual', receiptId: `manual-${packet.id}`, status: 'submitted', checklist: packet.documents.map((doc) => doc.name) }; } };
}

export function createFilingToolRegistry({ session, matter, connector = manualFilingConnector() } = {}) {
  return {
    prepare(input) {
      return createFilingPacket(input);
    },
    validate(packet, requirements = {}) {
      return validateFilingPacket(packet, requirements);
    },
    requestApproval(packet) {
      return requestFilingApproval(packet);
    },
    submit(packet, { gate, validation = validateFilingPacket(packet), matter: packetMatter = matter } = {}) {
      return submitApprovedFiling(packet, { gate, session, matter: packetMatter, connector, validation });
    },
    status(packet) {
      return getFilingStatus(packet);
    },
    receipt(packet, receipt) {
      return ingestFilingReceipt(packet, receipt);
    },
  };
}
