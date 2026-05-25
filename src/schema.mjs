export const LEXY_MATTER_FIELDS = [
  // Lexy core: reusable across practice areas and firms.
  { name: 'matter_id', title: 'matter_id', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'matter_number', title: 'matter_number', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'matter_reference', title: 'matter_reference', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'client_display_name', title: 'client_display_name', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'matter_type', title: 'matter_type', uidt: 'SingleSelect', group: 'lexy_core' },
  { name: 'stage', title: 'stage', uidt: 'SingleSelect', group: 'lexy_core' },
  { name: 'stage_updated_at', title: 'stage_updated_at', uidt: 'DateTime', group: 'lexy_core' },
  { name: 'stage_owner', title: 'stage_owner', uidt: 'SingleSelect', group: 'lexy_core' },
  { name: 'blocked', title: 'blocked', uidt: 'Checkbox', group: 'lexy_core' },
  { name: 'blocker_reason', title: 'blocker_reason', uidt: 'LongText', group: 'lexy_core' },
  { name: 'next_action', title: 'next_action', uidt: 'LongText', group: 'lexy_core' },
  { name: 'next_action_due_at', title: 'next_action_due_at', uidt: 'DateTime', group: 'lexy_core' },
  { name: 'drive_folder_id', title: 'drive_folder_id', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'drive_folder_url', title: 'drive_folder_url', uidt: 'URL', group: 'lexy_core' },
  { name: 'lawmatics_id', title: 'lawmatics_id', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'source_system', title: 'source_system', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'source_record_id', title: 'source_record_id', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'state', title: 'state', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'county', title: 'county', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'court_name', title: 'court_name', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'court_address', title: 'court_address', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'case_number', title: 'case_number', uidt: 'SingleLineText', group: 'lexy_core' },
  { name: 'notes', title: 'notes', uidt: 'LongText', group: 'lexy_core' },

  // QDRO/family-law practice pack: reusable beyond Peacock, but not generic core.
  { name: 'plan_name', title: 'plan_name', uidt: 'SingleLineText', group: 'qdro_pack' },
  { name: 'plan_admin_tpa', title: 'plan_admin_tpa', uidt: 'SingleLineText', group: 'qdro_pack' },
  { name: 'plan_ein', title: 'plan_ein', uidt: 'SingleLineText', group: 'qdro_pack' },
  { name: 'pre_or_post_judgment', title: 'pre_or_post_judgment', uidt: 'SingleSelect', group: 'qdro_pack' },
  { name: 'date_of_marriage', title: 'date_of_marriage', uidt: 'Date', group: 'qdro_pack' },
  { name: 'date_of_separation', title: 'date_of_separation', uidt: 'Date', group: 'qdro_pack' },
  { name: 'date_of_judgment', title: 'date_of_judgment', uidt: 'Date', group: 'qdro_pack' },
  { name: 'valuation_date', title: 'valuation_date', uidt: 'Date', group: 'qdro_pack' },
  { name: 'qdro_count', title: 'qdro_count', uidt: 'Number', group: 'qdro_pack' },
  { name: 'joinder_required', title: 'joinder_required', uidt: 'Checkbox', group: 'qdro_pack' },
  { name: 'service_scope', title: 'service_scope', uidt: 'SingleSelect', group: 'qdro_pack' },

  // Peacock operations: useful internally, not product religion unless generalized later.
  { name: 'lead_id', title: 'lead_id', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'intake_status', title: 'intake_status', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'invoice_status', title: 'invoice_status', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'invoice_amount', title: 'invoice_amount', uidt: 'Currency', group: 'peacock_ops' },
  { name: 'retainer_status', title: 'retainer_status', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'last_intake_token_id', title: 'last_intake_token_id', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'last_intake_sent_at', title: 'last_intake_sent_at', uidt: 'DateTime', group: 'peacock_ops' },
  { name: 'last_intake_submitted_at', title: 'last_intake_submitted_at', uidt: 'DateTime', group: 'peacock_ops' },
  { name: 'last_retainer_document_id', title: 'last_retainer_document_id', uidt: 'SingleLineText', group: 'peacock_ops' },
  { name: 'last_invoice_id', title: 'last_invoice_id', uidt: 'SingleLineText', group: 'peacock_ops' },
];

export const LEGACY_FIELD_ALIASES = {
  Title: 'client_display_name',
  Case_Reference: 'matter_reference',
  Current_Status: 'stage',
  Kanban_Stage: 'stage',
  Status_Updated_Date: 'stage_updated_at',
  State_of_Divorce: 'state',
  County_of_Divorce: 'county',
  Case_Number: 'case_number',
  Matter_ID: 'matter_id',
  Matter_Reference: 'matter_reference',
  Matter_Type: 'matter_type',
  Stage_Owner: 'stage_owner',
  Blocked: 'blocked',
  Blocker_Reason: 'blocker_reason',
  Next_Action: 'next_action',
  Next_Action_Due_Date: 'next_action_due_at',
  Court_Name: 'court_name',
  Court_Address: 'court_address',
  Lawmatics_ID: 'lawmatics_id',
  Plan_Name: 'plan_name',
  Plan_Admin___TPA: 'plan_admin_tpa',
  Plan_EIN: 'plan_ein',
  Pre_or_Post_Judgment: 'pre_or_post_judgment',
  Date_of_Marriage: 'date_of_marriage',
  Date_of_Separation: 'date_of_separation',
  Date_of_Judgment: 'date_of_judgment',
  Number_of_QDROs: 'qdro_count',
  Service_Scope: 'service_scope',
  Notes: 'notes',
};

export function classifyFieldForLexy(name) {
  const field = LEXY_MATTER_FIELDS.find((item) => item.name === name);
  return field?.group ?? 'legacy_or_unknown';
}

export function buildNocoDbSchemaPlan(existingColumns) {
  const existingNames = new Set((existingColumns ?? []).map((column) => column.column_name).filter(Boolean));
  const add = LEXY_MATTER_FIELDS.filter((field) => !existingNames.has(field.name));
  const legacy = (existingColumns ?? []).filter((column) => LEGACY_FIELD_ALIASES[column.column_name]);
  return {
    add,
    drop: [],
    legacy,
    aliases: legacy.map((column) => ({ from: column.column_name, to: LEGACY_FIELD_ALIASES[column.column_name] })),
  };
}
