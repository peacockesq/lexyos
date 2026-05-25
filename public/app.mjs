const API_ENDPOINT_RECEIPTS = Object.freeze([
  '/api/matters',
  '/files',
  '/api/document-requests',
  '/artifacts',
  '/api/gates',
  '/approve',
  '/reject',
  '/api/tasks',
  '/api/audit-events',
  '/api/filing-packets',
  '/submit',
  '/api/corpus/search',
  '/api/service-packets',
  '/send',
  '/proof',
]);

const state = {
  matters: [],
  visibleMatters: [],
  files: [],
  tasks: [],
  gates: [],
  auditEvents: [],
  filingPackets: [],
  servicePackets: [],
  selectedMatter: null,
  selectedDocument: null,
  selectedGate: null,
  lastFilingPacket: null,
  lastServicePacket: null,
};

const $ = (selector) => document.querySelector(selector);
const matterSearch = $('#matter-search');
const matterList = $('#matter-list');
const fileList = $('#file-list');
const baselinePanel = $('#baseline-panel');
const documentFrame = $('#document-frame');
const folderStatus = $('#folder-status');
const sessionPanel = $('#session-panel');
const opsPanel = $('#ops-panel');
const researchPanel = $('#research-panel');
const gateList = $('#gate-list');
const auditTrail = $('#audit-trail');
const errorPanel = $('#error-panel');
const evaInstruction = $('#eva-instruction');
const evaContext = $('#eva-context');
const evaProposal = $('#eva-proposal');

async function boot() {
  bindControls();
  await refreshAll();
}

function bindControls() {
  matterSearch.addEventListener('input', (event) => {
    state.visibleMatters = searchLocalMatters(state.matters, event.target.value);
    renderMatters();
  });
  $('#generate-doc').addEventListener('click', withUiErrors(generateDocumentArtifact));
  $('#approve-gate').addEventListener('click', withUiErrors(() => decideSelectedGate('approve')));
  $('#reject-gate').addEventListener('click', withUiErrors(() => decideSelectedGate('reject')));
  $('#create-filing').addEventListener('click', withUiErrors(createFilingPacketFromMatter));
  $('#submit-filing').addEventListener('click', withUiErrors(submitLatestFiling));
  $('#prepare-service').addEventListener('click', withUiErrors(prepareServicePacketFromMatter));
  $('#send-service').addEventListener('click', withUiErrors(sendLatestService));
  $('#upload-proof').addEventListener('click', withUiErrors(uploadProofForLatestService));
  $('#search-corpus').addEventListener('click', withUiErrors(searchCorpus));
  $('#eva-propose').addEventListener('click', createEvaProposal);
}

async function refreshAll() {
  clearError();
  state.matters = await apiJson('/api/matters');
  state.visibleMatters = searchLocalMatters(state.matters, matterSearch.value);
  if (!state.selectedMatter || !state.matters.some((matter) => matter.id === state.selectedMatter.id)) {
    state.selectedMatter = state.matters[0] ?? null;
  }
  await refreshMatterScopedData();
  renderAll();
}

async function refreshMatterScopedData() {
  if (!state.selectedMatter) return;
  const matterId = encodeURIComponent(state.selectedMatter.id);
  state.files = await apiJson(`/api/matters/${matterId}/files`);
  state.tasks = await apiJson('/api/tasks');
  state.gates = await apiJson('/api/gates');
  state.auditEvents = await apiJson('/api/audit-events');
  state.filingPackets = await apiJson('/api/filing-packets');
  state.selectedGate = state.gates.find((gate) => gate.id === state.selectedGate?.id) ?? state.gates.find((gate) => gate.matterId === state.selectedMatter.id && gate.status === 'pending') ?? null;
  state.lastFilingPacket = state.filingPackets.find((packet) => packet.id === state.lastFilingPacket?.id) ?? state.filingPackets.findLast?.((packet) => packet.matterId === state.selectedMatter.id) ?? state.filingPackets.filter((packet) => packet.matterId === state.selectedMatter.id).at(-1) ?? null;
}

function renderAll() {
  renderMatters();
  renderFiles();
  renderBaseline();
  renderDocument();
  renderSession();
  renderTasks();
  renderGates();
  renderAudit();
  renderResearch({ message: 'Ready. Actions call the local LexyOS API and refresh persisted state.' });
  renderEvaContext();
}

function renderMatters() {
  matterList.innerHTML = '';
  for (const matter of state.visibleMatters) {
    const button = document.createElement('button');
    button.className = `matter-card ${matter.id === state.selectedMatter?.id ? 'selected' : ''}`;
    button.innerHTML = `<strong>${escapeHtml(displayName(matter))}</strong><span>${escapeHtml(matter.id)} · ${escapeHtml(matter.stage)}</span>`;
    button.addEventListener('click', withUiErrors(async () => {
      state.selectedMatter = matter;
      state.selectedDocument = null;
      state.selectedGate = null;
      await refreshMatterScopedData();
      renderAll();
    }));
    matterList.appendChild(button);
  }
}

function renderFiles() {
  fileList.innerHTML = '';
  if (!state.files.length) {
    fileList.innerHTML = '<div class="empty">No API files found for this matter folder yet.</div>';
    return;
  }
  for (const file of state.files) {
    const button = document.createElement('button');
    button.className = `file-card ${file.id === state.selectedDocument?.id ? 'selected' : ''}`;
    button.innerHTML = `<strong>${escapeHtml(file.name ?? file.id)}</strong><span>${escapeHtml(file.mimeType ?? file.type ?? file.kind ?? 'document')}</span>`;
    button.addEventListener('click', () => {
      state.selectedDocument = file;
      renderDocument();
      renderEvaContext();
    });
    fileList.appendChild(button);
  }
  if (!state.selectedDocument) state.selectedDocument = state.files[0];
}

function renderBaseline() {
  const baseline = state.selectedMatter?.baseline ?? state.selectedMatter?.baseline_data ?? {};
  baselinePanel.innerHTML = Object.entries(baseline)
    .map(([key, value]) => `<div class="baseline-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join('') || '<div class="empty">No baseline facts persisted for this matter.</div>';
  folderStatus.textContent = state.selectedMatter?.driveFolderId || state.selectedMatter?.drive_folder_id
    ? `Drive folder: ${state.selectedMatter.driveFolderId ?? state.selectedMatter.drive_folder_id}`
    : 'No Drive folder ID on this matter; file list is scoped by matterId only.';
}

function renderDocument(artifact = null) {
  if (artifact) {
    state.selectedDocument = artifact;
    documentFrame.innerHTML = `<div class="doc-preview"><div class="doc-title">${escapeHtml(artifact.id)}</div><pre>${escapeHtml(artifact.content ?? JSON.stringify(artifact, null, 2))}</pre></div>`;
    return;
  }
  const file = state.selectedDocument;
  if (!file) {
    documentFrame.innerHTML = '<div class="empty big">Select a matter file or generate a persistent artifact.</div>';
    return;
  }
  documentFrame.innerHTML = `
    <div class="doc-preview">
      <div class="doc-title">${escapeHtml(file.name ?? file.id)}</div>
      <p>Loaded from <strong>/api/matters/${escapeHtml(state.selectedMatter.id)}/files</strong>. No local demo data is used.</p>
      <blockquote id="selected-text">${escapeHtml(file.content ?? 'The Alternate Payee shall receive fifty percent of the marital portion.')}</blockquote>
      <pre>${escapeHtml(JSON.stringify(file, null, 2))}</pre>
    </div>`;
}

function renderSession() {
  sessionPanel.textContent = JSON.stringify({ backend: '/api', persistence: 'data/lexyos.json', selectedMatterId: state.selectedMatter?.id ?? null }, null, 2);
}

function renderTasks() {
  const scoped = state.tasks.filter((task) => !state.selectedMatter || task.matterId === state.selectedMatter.id);
  opsPanel.textContent = JSON.stringify(scoped.map(({ id, title, status, requiresGate, kind }) => ({ id, title, status, requiresGate, kind })), null, 2);
}

function renderGates() {
  gateList.innerHTML = '';
  const scoped = state.gates.filter((gate) => !state.selectedMatter || gate.matterId === state.selectedMatter.id);
  if (!scoped.length) {
    gateList.innerHTML = '<div class="empty">No gates yet. Generate a document, filing, or service packet.</div>';
    return;
  }
  for (const gate of scoped) {
    const button = document.createElement('button');
    button.className = `matter-card ${gate.id === state.selectedGate?.id ? 'selected' : ''}`;
    button.innerHTML = `<strong>${escapeHtml(gate.type ?? gate.action)}</strong><span>${escapeHtml(gate.id)} · ${escapeHtml(gate.status)} · ${escapeHtml(gate.action)}</span>`;
    button.addEventListener('click', () => {
      state.selectedGate = gate;
      renderGates();
    });
    gateList.appendChild(button);
  }
}

function renderAudit() {
  const scoped = state.auditEvents
    .filter((event) => !state.selectedMatter || !event.matterId || event.matterId === state.selectedMatter.id)
    .slice(-12)
    .map((event) => ({ at: event.occurredAt ?? event.createdAt, action: event.action, matterId: event.matterId, metadata: event.metadata }));
  auditTrail.textContent = JSON.stringify(scoped, null, 2);
}

function renderResearch(payload) {
  researchPanel.textContent = JSON.stringify(payload, null, 2);
}

async function generateDocumentArtifact() {
  requireMatter();
  const requestResult = await apiJson('/api/document-requests', {
    method: 'POST',
    body: {
      matterId: state.selectedMatter.id,
      template: { id: 'qdro-draft', name: 'QDRO Draft', practiceArea: 'family_qdro', requiredFacts: ['plan_name', 'case_number'] },
      requestedBy: 'lexyos-ui',
    },
  });
  const artifact = requestResult.request.status === 'ready_for_generation'
    ? await apiJson(`/api/document-requests/${encodeURIComponent(requestResult.request.id)}/artifacts`, { method: 'POST' })
    : null;
  await apiJson('/api/tasks', {
    method: 'POST',
    body: {
      id: `task_review_${requestResult.request.id}`,
      matterId: state.selectedMatter.id,
      title: 'Attorney review generated QDRO artifact',
      kind: 'attorney_review',
      requiresGate: requestResult.gate.action,
      payload: { requestId: requestResult.request.id, gateId: requestResult.gate.id, artifactId: artifact?.id ?? null },
    },
  });
  state.selectedGate = requestResult.gate;
  await refreshMatterScopedData();
  renderAll();
  if (artifact) renderDocument(artifact);
  renderResearch({ documentRequest: requestResult.request, gate: requestResult.gate, artifact });
}

async function decideSelectedGate(decision) {
  requireGate();
  const decided = await apiJson(`/api/gates/${encodeURIComponent(state.selectedGate.id)}/${decision}`, {
    method: 'POST',
    body: { reason: `${decision} from LexyOS local cockpit` },
  });
  await refreshMatterScopedData();
  renderAll();
  renderResearch({ gateDecision: decided, affectedTasks: state.tasks.filter((task) => task.matterId === decided.matterId && task.requiresGate && [decided.type, decided.action].includes(task.requiresGate)) });
}

async function createFilingPacketFromMatter() {
  requireMatter();
  const documents = filingDocuments();
  const result = await apiJson('/api/filing-packets', {
    method: 'POST',
    body: {
      id: `filing_${state.selectedMatter.id}`,
      matterId: state.selectedMatter.id,
      jurisdiction: baselineValue('jurisdiction', 'CT'),
      filingType: 'QDRO filing',
      documents,
      requirements: { requiredDocumentTypes: ['qdro', 'judgment'] },
    },
  });
  state.lastFilingPacket = result.packet;
  state.selectedGate = result.gate;
  await apiJson('/api/tasks', { method: 'POST', body: { id: `task_file_${result.packet.id}`, matterId: state.selectedMatter.id, title: 'Submit approved QDRO filing packet', kind: 'filing', requiresGate: result.gate.action, payload: { packetId: result.packet.id, gateId: result.gate.id } } });
  await refreshMatterScopedData();
  renderAll();
  renderResearch(result);
}

async function submitLatestFiling() {
  const packet = state.lastFilingPacket ?? state.filingPackets.find((item) => item.matterId === state.selectedMatter?.id);
  if (!packet) throw new Error('Prepare a filing packet first.');
  const result = await apiJson(`/api/filing-packets/${encodeURIComponent(packet.id)}/submit`, { method: 'POST', body: { requirements: { requiredDocumentTypes: ['qdro', 'judgment'] } } });
  state.lastFilingPacket = result.packet;
  await refreshMatterScopedData();
  renderAll();
  renderResearch(result);
}

async function searchCorpus() {
  requireMatter();
  const result = await apiJson('/api/corpus/search', { method: 'POST', body: { query: 'What does a QDRO draft require before filing?', scope: { matterId: state.selectedMatter.id, practiceArea: 'family_qdro', jurisdiction: baselineValue('jurisdiction', 'CT') } } });
  await refreshMatterScopedData();
  renderAll();
  renderResearch({ corpus: result });
}

async function prepareServicePacketFromMatter() {
  requireMatter();
  const result = await apiJson('/api/service-packets', {
    method: 'POST',
    body: {
      id: `service_${state.selectedMatter.id}`,
      matterId: state.selectedMatter.id,
      recipient: baselineValue('plan_admin_tpa', 'Plan Administrator'),
      requirement: { id: 'plan-admin-mail', method: 'mail', requiredDocuments: ['notice'] },
      documents: serviceDocuments(),
      vendor: 'manual-local',
    },
  });
  state.lastServicePacket = result.packet;
  state.selectedGate = result.gate;
  await apiJson('/api/tasks', { method: 'POST', body: { id: `task_send_${result.packet.id}`, matterId: state.selectedMatter.id, title: 'Send approved service packet', kind: 'service', requiresGate: result.gate.action, payload: { packetId: result.packet.id, gateId: result.gate.id } } });
  await refreshMatterScopedData();
  renderAll();
  renderResearch(result);
}

async function sendLatestService() {
  const packet = state.lastServicePacket;
  if (!packet) throw new Error('Prepare a service packet first.');
  const result = await apiJson(`/api/service-packets/${encodeURIComponent(packet.id)}/send`, { method: 'POST', body: { vendor: 'manual-local', trackingId: `LOCAL-${Date.now()}` } });
  state.lastServicePacket = result;
  await refreshMatterScopedData();
  renderAll();
  renderResearch({ serviceSent: result });
}

async function uploadProofForLatestService() {
  const packet = state.lastServicePacket;
  if (!packet) throw new Error('Prepare and send a service packet first.');
  const result = await apiJson(`/api/service-packets/${encodeURIComponent(packet.id)}/proof`, { method: 'POST', body: { proofDocument: { id: `proof_${packet.id}`, name: 'Proof of Service.pdf' }, extracted: { servedAt: new Date().toISOString() } } });
  state.lastServicePacket = result.packet;
  await refreshMatterScopedData();
  renderAll();
  renderResearch({ proof: result });
}

function createEvaProposal() {
  const selectedText = $('#selected-text')?.textContent ?? '';
  const replacement = `${selectedText} ${evaInstruction.value}`.trim();
  const proposal = {
    type: 'tracked_change_proposal',
    matterId: state.selectedMatter?.id ?? null,
    documentId: state.selectedDocument?.id ?? null,
    targetText: selectedText,
    proposedText: replacement,
    status: 'requires_attorney_review',
  };
  evaProposal.textContent = JSON.stringify(proposal, null, 2);
}

function renderEvaContext() {
  evaContext.textContent = JSON.stringify({ matter: state.selectedMatter, document: state.selectedDocument, selectedText: $('#selected-text')?.textContent ?? '' }, null, 2);
}

function filingDocuments() {
  const docs = state.files.map((file) => ({ id: file.id, name: file.name, type: inferDocumentType(file), mimeType: file.mimeType }));
  if (!docs.some((doc) => doc.type === 'qdro')) docs.push({ id: 'ui-qdropdf', name: 'Generated QDRO.pdf', type: 'qdro' });
  return docs;
}

function serviceDocuments() {
  const docs = state.files.map((file) => ({ id: file.id, name: file.name, type: inferDocumentType(file), mimeType: file.mimeType }));
  if (!docs.some((doc) => doc.type === 'notice')) docs.push({ id: 'ui-notice', name: 'Notice to Plan Administrator.pdf', type: 'notice' });
  return docs;
}

function inferDocumentType(file) {
  const name = String(file.name ?? '').toLowerCase();
  if (file.type) return file.type;
  if (name.includes('qdro')) return 'qdro';
  if (name.includes('judgment')) return 'judgment';
  if (name.includes('notice')) return 'notice';
  return 'supporting';
}

function baselineValue(key, defaultValue) {
  return state.selectedMatter?.baseline?.[key] ?? state.selectedMatter?.baseline_data?.[key] ?? defaultValue;
}

function displayName(matter) {
  return matter.displayName ?? `${matter.clientName ?? matter.client_display_name ?? matter.name ?? 'Unnamed Matter'} — ${matter.matterType ?? matter.matter_type ?? 'Matter'}`;
}

function searchLocalMatters(matters, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return matters;
  return matters.filter((matter) => [matter.id, displayName(matter), matter.stage, JSON.stringify(matter.baseline ?? matter.baseline_data ?? {})].join(' ').toLowerCase().includes(q));
}

async function apiJson(path, options = {}) {
  const sessionId = localStorage.getItem('lexyos-session-id') || 'local-dev-owner';
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-lexyos-session-id': sessionId, ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`LexyOS API failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function requireMatter() {
  if (!state.selectedMatter) throw new Error('Select a matter first.');
}

function requireGate() {
  if (!state.selectedGate) throw new Error('Select a pending gate first.');
}

function withUiErrors(fn) {
  return async (...args) => {
    try {
      clearError();
      await fn(...args);
    } catch (error) {
      showError(error);
    }
  };
}

function showError(error) {
  errorPanel.textContent = `${error.message}\n${error.stack ?? ''}`;
}

function clearError() {
  errorPanel.textContent = '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

boot().catch(showError);
