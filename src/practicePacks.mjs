import { createTask } from './tasks.mjs';

export function validatePracticePack(pack) {
  for (const key of ['id', 'name', 'practiceArea', 'stages', 'requiredFacts', 'requiredDocuments']) {
    if (!pack?.[key]) throw new Error(`practice pack missing ${key}`);
  }
  if (!Array.isArray(pack.stages) || !pack.stages.length) throw new Error('practice pack requires stages');
  return true;
}

export function loadPracticePack(pack) {
  validatePracticePack(pack);
  return Object.freeze({ ...pack, stages: Object.freeze([...pack.stages]) });
}

export function findMissingPackRequirements(pack, matter) {
  validatePracticePack(pack);
  const baseline = matter?.baseline ?? {};
  return {
    facts: pack.requiredFacts.filter((fact) => baseline[fact] === undefined || baseline[fact] === null || baseline[fact] === ''),
    documents: pack.requiredDocuments.filter((doc) => !(matter?.documents ?? []).some((item) => item.type === doc || item.name?.toLowerCase().includes(doc.toLowerCase()))),
  };
}

export function createMissingRequirementTasks(pack, matter) {
  const missing = findMissingPackRequirements(pack, matter);
  return [
    ...missing.facts.map((fact) => createTask({ id: `${matter.id}:fact:${fact}`, matterId: matter.id, title: `Collect missing ${pack.name} fact: ${fact}`, kind: 'missing_fact', payload: { fact, packId: pack.id } })),
    ...missing.documents.map((doc) => createTask({ id: `${matter.id}:doc:${doc}`, matterId: matter.id, title: `Collect missing ${pack.name} document: ${doc}`, kind: 'missing_document', payload: { documentType: doc, packId: pack.id } })),
  ];
}

export function advanceMatterStage(pack, matter, nextStage, { approvedGate = null } = {}) {
  if (!pack.stages.includes(nextStage)) throw new Error(`stage not in pack: ${nextStage}`);
  const criteria = pack.stageCriteria?.[nextStage] ?? {};
  const missing = findMissingPackRequirements({ ...pack, requiredFacts: criteria.requiredFacts ?? [], requiredDocuments: criteria.requiredDocuments ?? [] }, matter);
  if (missing.facts.length || missing.documents.length) throw new Error(`stage criteria unmet: ${[...missing.facts, ...missing.documents].join(', ')}`);
  if (criteria.requiresGate && approvedGate?.status !== 'approved') throw new Error(`stage requires approved gate: ${criteria.requiresGate}`);
  return { ...matter, stage: nextStage };
}

const COMMON_LEGAL_GATES = ['external_communication', 'attorney_document_review', 'filing_approval', 'service_approval'];

export const QDRO_FAMILY_PACK = Object.freeze({
  id: 'qdro-family',
  name: 'QDRO / Family Law',
  practiceArea: 'family_qdro',
  stages: ['intake', 'missing_info', 'drafting', 'attorney_review', 'submitted_to_plan', 'ready_to_file', 'filed', 'closed'],
  requiredFacts: ['client_display_name', 'plan_name', 'case_number', 'court_name', 'date_of_judgment'],
  requiredDocuments: ['judgment', 'plan_document'],
  factSchema: { plan_name: 'string', case_number: 'string', court_name: 'string', date_of_judgment: 'date' },
  stageCriteria: { attorney_review: { requiredDocuments: ['qdro'], requiresGate: 'attorney_document_review' }, ready_to_file: { requiredDocuments: ['qdro', 'judgment'], requiresGate: 'filing_approval' } },
  templates: ['qdro-draft', 'plan-preapproval-cover', 'court-filing-cover'],
  deadlineRules: ['plan_preapproval_followup_21d', 'filing_followup_14d'],
  gates: COMMON_LEGAL_GATES,
  filingRequirements: { requiredDocumentTypes: ['qdro', 'judgment'], requiresService: false },
  serviceRequirements: [],
  corpusScopes: [{ practiceArea: 'family_qdro', jurisdiction: 'CT', sourceTypes: ['statute', 'rule', 'firm_memo', 'sample_language'] }],
});

export const ESTATE_PLANNING_PACK = Object.freeze({
  id: 'estate-planning', name: 'Estate Planning', practiceArea: 'estate_planning',
  stages: ['intake', 'conflict_check', 'planning', 'drafting', 'attorney_review', 'signing_ready', 'executed', 'closed'],
  requiredFacts: ['client_display_name', 'marital_status', 'children', 'fiduciaries', 'asset_summary'],
  requiredDocuments: ['id', 'asset_summary'],
  factSchema: { fiduciaries: 'array', children: 'array', asset_summary: 'text' },
  stageCriteria: { attorney_review: { requiredDocuments: ['will'], requiresGate: 'attorney_document_review' }, signing_ready: { requiresGate: 'attorney_document_review' } },
  templates: ['will', 'power-of-attorney', 'advance-healthcare-directive'], deadlineRules: [], gates: COMMON_LEGAL_GATES,
  filingRequirements: { requiredDocumentTypes: [], requiresService: false }, serviceRequirements: [], corpusScopes: [{ practiceArea: 'estate_planning', jurisdiction: 'state', sourceTypes: ['statute', 'firm_memo'] }],
});

export const PROBATE_PACK = Object.freeze({
  id: 'probate', name: 'Probate', practiceArea: 'probate',
  stages: ['intake', 'conflict_check', 'petition_prep', 'filed', 'notice_service', 'administration', 'accounting', 'closed'],
  requiredFacts: ['client_display_name', 'decedent_name', 'date_of_death', 'county', 'heirs'],
  requiredDocuments: ['death_certificate', 'will'],
  factSchema: { heirs: 'array', date_of_death: 'date', county: 'string' },
  stageCriteria: { filed: { requiredDocuments: ['petition'], requiresGate: 'filing_approval' }, notice_service: { requiresGate: 'service_approval' } },
  templates: ['probate-petition', 'notice-of-hearing', 'inventory'], deadlineRules: ['notice_before_hearing', 'inventory_due'], gates: COMMON_LEGAL_GATES,
  filingRequirements: { requiredDocumentTypes: ['petition', 'death_certificate'], requiresService: true }, serviceRequirements: [{ method: 'mail', requiredDocuments: ['notice'] }], corpusScopes: [{ practiceArea: 'probate', jurisdiction: 'state', sourceTypes: ['statute', 'court_rule'] }],
});

export const BANKRUPTCY_PACK = Object.freeze({
  id: 'bankruptcy', name: 'Bankruptcy', practiceArea: 'bankruptcy',
  stages: ['intake', 'credit_counseling', 'petition_prep', 'attorney_review', 'filed', '341_meeting', 'discharge', 'closed'],
  requiredFacts: ['client_display_name', 'chapter', 'household_size', 'income_summary', 'creditors'],
  requiredDocuments: ['credit_report', 'paystubs', 'tax_return'],
  factSchema: { chapter: 'enum', creditors: 'array', income_summary: 'money' },
  stageCriteria: { filed: { requiredDocuments: ['petition', 'credit_counseling_certificate'], requiresGate: 'filing_approval' } },
  templates: ['bankruptcy-petition-checklist', '341-prep-letter'], deadlineRules: ['credit_counseling_prepetition', '341_meeting_window'], gates: COMMON_LEGAL_GATES,
  filingRequirements: { requiredDocumentTypes: ['petition', 'credit_counseling_certificate'], requiresFee: true, requiresService: false }, serviceRequirements: [], corpusScopes: [{ practiceArea: 'bankruptcy', jurisdiction: 'federal', sourceTypes: ['code', 'rule', 'local_rule'] }],
});

export const DUI_PACK = Object.freeze({
  id: 'dui', name: 'DUI Defense', practiceArea: 'dui',
  stages: ['intake', 'conflict_check', 'arraignment', 'discovery', 'negotiation', 'motion_practice', 'trial_ready', 'closed'],
  requiredFacts: ['client_display_name', 'court_name', 'case_number', 'arrest_date', 'next_hearing'],
  requiredDocuments: ['citation', 'police_report'],
  factSchema: { arrest_date: 'date', next_hearing: 'date', bac: 'number' },
  stageCriteria: { discovery: { requiredDocuments: ['discovery_request'], requiresGate: 'external_communication' }, trial_ready: { requiresGate: 'attorney_document_review' } },
  templates: ['discovery-request', 'dmv-hearing-request', 'motion-template'], deadlineRules: ['dmv_hearing_request_deadline', 'arraignment_deadline'], gates: COMMON_LEGAL_GATES,
  filingRequirements: { requiredDocumentTypes: ['motion'], requiresService: true }, serviceRequirements: [{ method: 'mail', requiredDocuments: ['motion'] }], corpusScopes: [{ practiceArea: 'dui', jurisdiction: 'state', sourceTypes: ['statute', 'case_law', 'court_rule'] }],
});

export const PRACTICE_PACKS = Object.freeze([QDRO_FAMILY_PACK, ESTATE_PLANNING_PACK, PROBATE_PACK, BANKRUPTCY_PACK, DUI_PACK]);
