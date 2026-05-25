const VALUE_KEYS = new Set([
  'matter_id',
  'id',
  'client_name',
  'client_display_name',
  'name',
  'matter_type',
  'type',
  'stage',
  'status',
  'drive_folder_id',
  'folderId',
  'baseline_data',
  'data',
  'tenantId',
  'tenant_id',
]);

export function normalizeMatter(raw = {}, source = raw.source ?? 'manual') {
  const id = String(raw.matter_id ?? raw.id ?? '').trim();
  if (!id) throw new Error('matter_id or id is required');

  const clientName = String(raw.client_display_name ?? raw.client_name ?? raw.name ?? 'Unnamed Matter').trim();
  const matterType = String(raw.matter_type ?? raw.type ?? 'Matter').trim();
  const stage = String(raw.stage ?? raw.status ?? 'unknown').trim();
  const driveFolderId = raw.drive_folder_id ?? raw.folderId ?? null;
  const tenantId = raw.tenantId ?? raw.tenant_id ?? raw.baseline_data?.tenantId ?? raw.data?.tenantId ?? null;
  const baseline = {
    ...(isObject(raw.baseline_data) ? raw.baseline_data : {}),
    ...(isObject(raw.data) ? raw.data : {}),
  };

  for (const [key, value] of Object.entries(raw)) {
    if (!VALUE_KEYS.has(key) && value !== undefined && value !== null && typeof value !== 'object') {
      baseline[key] = value;
    }
  }

  return {
    id,
    source,
    clientName,
    matterType,
    stage,
    driveFolderId,
    tenantId,
    baseline,
    displayName: `${clientName} — ${matterType}`,
  };
}

export function searchMatters(matters, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return matters;
  return matters.filter((matter) => matterSearchBlob(matter).includes(q));
}

export function matterFolderPath(root, matter) {
  return `${String(root).replace(/\/$/, '')}/${safePathSegment(`${matter.displayName} — ${matter.id}`)}`;
}

function matterSearchBlob(matter) {
  return [
    matter.id,
    matter.clientName,
    matter.matterType,
    matter.stage,
    matter.displayName,
    JSON.stringify(matter.baseline ?? {}),
  ]
    .join(' ')
    .toLowerCase();
}

function safePathSegment(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
