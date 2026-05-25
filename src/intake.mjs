import { createHumanGate } from './gates.mjs';
import { createTask } from './tasks.mjs';

const PRACTICE_KEYWORDS = [
  ['family_qdro', /qdro|pension|401k|retirement|divorce|judgment/i],
  ['probate', /probate|decedent|death certificate|estate administration/i],
  ['estate_planning', /will|trust|power of attorney|healthcare directive|estate plan/i],
  ['bankruptcy', /bankruptcy|chapter 7|chapter 13|creditor|discharge/i],
  ['dui', /dui|dwi|arrest|bac|arraignment|dmv hearing/i],
];

export function classifyIntakeEvent(event = {}) {
  const text = `${event.channel ?? ''} ${event.subject ?? ''} ${event.text ?? ''}`;
  const [practiceArea] = PRACTICE_KEYWORDS.find(([, re]) => re.test(text)) ?? ['general_legal'];
  const urgency = /tomorrow|today|deadline|hearing|filed|served|emergency/i.test(text) ? 'high' : 'normal';
  return { practiceArea, urgency, channel: event.channel ?? 'unknown' };
}

export function createIntakeMatterDraft(event = {}) {
  const classification = classifyIntakeEvent(event);
  const clientName = event.contact?.name ?? event.client_display_name ?? 'Unknown Client';
  return {
    matter_id: event.matterId ?? `intake_${event.id ?? Date.now()}`,
    tenantId: event.tenantId,
    client_display_name: clientName,
    matter_type: classification.practiceArea,
    stage: 'intake',
    baseline_data: {
      intake_channel: classification.channel,
      intake_urgency: classification.urgency,
      contact_email: event.contact?.email ?? null,
      intake_text: event.text ?? '',
    },
  };
}

export function createIntakeWorkflow(event = {}) {
  const classification = classifyIntakeEvent(event);
  const matterDraft = createIntakeMatterDraft(event);
  const matterId = matterDraft.matter_id;
  const gates = [
    createHumanGate({ id: `${matterId}:conflict`, matterId, type: 'conflict_check', action: `clear_conflict:${matterId}`, requestedBy: 'intake', requiredRole: 'attorney' }),
    createHumanGate({ id: `${matterId}:representation`, matterId, type: 'representation_acceptance', action: `accept_representation:${matterId}`, requestedBy: 'intake', requiredRole: 'attorney' }),
  ];
  const tasks = [
    createTask({ id: `${matterId}:classify`, matterId, title: `Classify ${classification.practiceArea} intake`, kind: 'intake_classification', payload: { event, classification } }),
    createTask({ id: `${matterId}:missing-info`, matterId, title: 'Collect missing intake documents and facts', kind: 'missing_info', requiresGate: 'external_communication', payload: { event } }),
    createTask({ id: `${matterId}:payment-rep`, matterId, title: 'Verify payment/work authorization before legal work', kind: 'representation_gate', requiresGate: 'representation_acceptance' }),
  ];
  return { classification, matterDraft, gates, tasks };
}
