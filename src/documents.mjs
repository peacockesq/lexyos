import { createHumanGate } from './gates.mjs';
import { canAccessMatter } from './auth.mjs';

export function createDocumentTemplate({ id, name, practiceArea, requiredFacts = [], engine = 'docassemble', outputType = 'docx' }) {
  if (!id || !name) throw new Error('template id and name are required');
  return { id, name, practiceArea, requiredFacts, engine, outputType };
}

export function validateDocumentData(template, matter) {
  const baseline = matter?.baseline ?? {};
  const missingFacts = template.requiredFacts.filter((fact) => baseline[fact] === undefined || baseline[fact] === null || baseline[fact] === '');
  return { ok: missingFacts.length === 0, missingFacts };
}

export function createDocumentGenerationRequest({ template, matter, requestedBy = 'agent' }) {
  const validation = validateDocumentData(template, matter);
  return {
    id: `docgen_${matter.id}_${template.id}`,
    matterId: matter.id,
    templateId: template.id,
    engine: template.engine,
    outputType: template.outputType,
    status: validation.ok ? 'ready_for_generation' : 'missing_data',
    validation,
    payload: validation.ok ? { ...matter.baseline, matter_id: matter.id, client_display_name: matter.clientName ?? matter.baseline?.client_display_name } : null,
    requestedBy,
  };
}

export function requestDocumentApproval(generationRequest) {
  return createHumanGate({ id: `gate_${generationRequest.id}`, matterId: generationRequest.matterId, type: 'attorney_document_review', action: `approve_document:${generationRequest.id}`, requestedBy: generationRequest.requestedBy, payload: generationRequest, requiredRole: 'attorney' });
}

export function renderDocumentArtifact({ request, template, matter, renderer = defaultTemplateRenderer }) {
  if (request.status !== 'ready_for_generation') throw new Error('document request is not ready for generation');
  const content = renderer(template.body ?? defaultTemplateBody(template), request.payload, { template, matter });
  return {
    id: `artifact_${request.id}`,
    matterId: request.matterId,
    templateId: template.id,
    outputType: template.outputType,
    status: 'rendered',
    content,
    createdAt: new Date().toISOString(),
  };
}

export function applyAdeuTrackedChange({ artifact, gate, session = null, matter = null, change }) {
  if (gate?.status !== 'approved' || gate.action !== `approve_document:${artifact.id.replace(/^artifact_/, '')}`) throw new Error('approved document review gate required');
  if (session && !matter) throw new Error('document matter context required');
  if (matter && (matter.id !== artifact.matterId || !canAccessMatter(session, matter))) throw new Error('cannot access document matter');
  const content = artifact.content.replace(change.targetText, change.newText);
  return { ...artifact, status: 'tracked_change_applied', content, trackedChanges: [...(artifact.trackedChanges ?? []), change] };
}

function defaultTemplateRenderer(body, payload) {
  return String(body).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => payload[key] ?? '');
}

function defaultTemplateBody(template) {
  return `${template.name}\n\n${template.requiredFacts.map((fact) => `${fact}: {{${fact}}}`).join('\n')}`;
}
