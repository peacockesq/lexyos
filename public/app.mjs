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
  authConfig: null,
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
const baselineEditor = $('#baseline-editor');
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
const matterHealthScore = $('#matter-health-score');
const activeEndpoints = $('#active-endpoints');
const loginScreen = $('#login-screen');
const loginFootnote = $('#login-footnote');
const productLinks = $('#product-links');
const passwordLogin = $('#password-login');
const loginEmail = $('#login-email');
const loginPassword = $('#login-password');
const appShell = $('#app-shell');
const mobileMenuToggle = $('#mobile-menu-toggle');
const mobileEvaToggle = $('#mobile-eva-toggle');
const evaBubble = $('#eva-bubble');
activeEndpoints.classList.add('api-receipt-list');
let authConfigPromise = null;

async function boot() {
  authConfigPromise = hydrateAuthConfig();
  bindLogin();
  await authConfigPromise;
  completeOAuthCallbackFromUrl();
  bindShellControls();
  bindControls();
  if (currentAccessToken() || currentSessionId()) await enterApp();
}

function bindLogin() {
  $('#login-google').addEventListener('click', () => startSso('google'));
  $('#login-microsoft').addEventListener('click', () => startSso('azure'));
  passwordLogin?.addEventListener('submit', (event) => {
    event.preventDefault();
    signInWithPassword().catch(showError);
  });
  $('#logout').addEventListener('click', logout);
}

async function hydrateAuthConfig() {
  try {
    state.authConfig = await fetch('/api/auth/config').then((response) => response.json());
    renderProductLinks();
    passwordLogin.hidden = state.authConfig.mode !== 'supabase';
    const mode = state.authConfig.mode === 'supabase' ? 'Supabase auth enabled.' : 'Local preview session enabled.';
    loginFootnote.textContent = `${mode} Google Workspace and Microsoft 365 route through Supabase when their OAuth providers are enabled; email sign-in is available for approved users.`;
  } catch (error) {
    state.authConfig = { mode: 'local', products: [] };
    loginFootnote.textContent = `Auth config unavailable: ${error.message}`;
  }
}

function renderProductLinks() {
  productLinks.innerHTML = (state.authConfig?.products ?? [])
    .map((product) => `<a href="${escapeHtml(product.url)}" rel="noreferrer">${escapeHtml(product.name)}</a>`)
    .join('');
}

async function startSso(provider) {
  if (authConfigPromise) await authConfigPromise;
  const providerConfig = state.authConfig?.providers?.[provider];
  if (state.authConfig?.mode === 'supabase' && providerConfig?.authorizeUrl) {
    window.location.assign(providerConfig.authorizeUrl);
    return;
  }
  startPreviewSession(provider === 'azure' ? 'microsoft-365-preview' : 'google-workspace-preview');
}

function completeOAuthCallbackFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!token) return;
  persistSupabaseSession(token, refreshToken, 'supabase-sso');
  history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

async function signInWithPassword() {
  if (authConfigPromise) await authConfigPromise;
  if (state.authConfig?.mode !== 'supabase') return startPreviewSession('local-preview');
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    showError(new Error('Email and password are required.'));
    return;
  }
  const response = await fetch(`${state.authConfig.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: state.authConfig.anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.msg || body.error || 'Supabase password sign-in failed.');
  }
  persistSupabaseSession(body.access_token, body.refresh_token, 'supabase-password');
  await enterApp();
}

function persistSupabaseSession(token, refreshToken, provider) {
  localStorage.removeItem('lexyos-session-id');
  localStorage.setItem('lexyos-access-token', token);
  if (refreshToken) localStorage.setItem('lexyos-refresh-token', refreshToken);
  localStorage.setItem('lexyos-session-provider', provider);
}

async function startPreviewSession(provider) {
  localStorage.setItem('lexyos-session-id', 'local-dev-owner');
  localStorage.setItem('lexyos-session-provider', provider);
  await enterApp();
}

function logout() {
  localStorage.removeItem('lexyos-session-id');
  localStorage.removeItem('lexyos-access-token');
  localStorage.removeItem('lexyos-refresh-token');
  localStorage.removeItem('lexyos-session-provider');
  window.location.assign('/');
}

async function enterApp() {
  document.body.classList.remove('login-required');
  loginScreen.hidden = true;
  appShell.hidden = false;
  await refreshAll();
}

function bindShellControls() {
  mobileMenuToggle.addEventListener('click', () => toggleShellPanel('nav-open', mobileMenuToggle));
  mobileEvaToggle.addEventListener('click', () => toggleShellPanel('agent-open', mobileEvaToggle));
  evaBubble.addEventListener('click', () => toggleShellPanel('agent-open', mobileEvaToggle));
}

function toggleShellPanel(className, control) {
  const active = document.body.classList.toggle(className);
  control?.setAttribute('aria-expanded', String(active));
}

function closeMobileNav() {
  document.body.classList.remove('nav-open');
  mobileMenuToggle?.setAttribute('aria-expanded', 'false');
}

function bindControls() {
  matterSearch.addEventListener('input', (event) => {
    state.visibleMatters = searchLocalMatters(state.matters, event.target.value);
    renderMatters();
  });
  $('#create-matter').addEventListener('click', withUiErrors(createMatterFromUi));
  $('#save-baseline').addEventListener('click', withUiErrors(saveBaselineFromUi));
  $('#upload-file').addEventListener('click', withUiErrors(uploadMatterFileFromUi));
  $('#download-file').addEventListener('click', withUiErrors(downloadSelectedFile));
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
  renderMatterMetrics();
  renderDocument();
  renderSession();
  renderTasks();
  renderGates();
  renderAudit();
  renderResearch({ message: 'Ready. Actions update the matter record and refresh the workspace.' });
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
      closeMobileNav();
    }));
    matterList.appendChild(button);
  }
}

function renderFiles() {
  fileList.innerHTML = '';
  if (!state.files.length) {
    fileList.innerHTML = '<div class="empty">No files found for this matter yet.</div>';
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
  baselineEditor.value = JSON.stringify(baseline, null, 2);
  baselinePanel.innerHTML = Object.entries(baseline)
    .map(([key, value]) => `<div class="baseline-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join('') || '<div class="empty">No key facts saved for this matter yet.</div>';
  folderStatus.textContent = state.selectedMatter?.driveFolderId || state.selectedMatter?.drive_folder_id
    ? `Drive folder: ${state.selectedMatter.driveFolderId ?? state.selectedMatter.drive_folder_id}`
    : 'No Drive folder connected; files are scoped to this matter.';
}

function renderMatterMetrics() {
  const pendingGates = state.gates.filter((gate) => !state.selectedMatter || gate.matterId === state.selectedMatter.id).filter((gate) => gate.status === 'pending').length;
  const openTasks = state.tasks.filter((task) => !state.selectedMatter || task.matterId === state.selectedMatter.id).filter((task) => !['done', 'approved', 'submitted'].includes(task.status)).length;
  const health = Math.max(0, 100 - (pendingGates * 12) - (openTasks * 4));
  const metrics = [
    ['matter-health-score', `${health}%`, 'Matter health'],
    ['files', String(state.files.length), 'Files'],
    ['gates', String(pendingGates), 'Pending approvals'],
    ['active-endpoints', String(API_ENDPOINT_RECEIPTS.length), 'Advanced'],
  ];
  matterHealthScore.innerHTML = metrics.map(([id, value, label]) => `<div class="metric-card" data-metric="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  activeEndpoints.innerHTML = API_ENDPOINT_RECEIPTS.map((endpoint) => `<span class="api-receipt">${escapeHtml(endpoint)}</span>`).join('');
}

function renderDocument(artifact = null) {
  if (artifact) {
    state.selectedDocument = artifact;
    documentFrame.innerHTML = `<div class="doc-preview"><div class="doc-title">${escapeHtml(artifact.id)}</div><pre>${escapeHtml(artifact.content ?? JSON.stringify(artifact, null, 2))}</pre></div>`;
    return;
  }
  const file = state.selectedDocument;
  if (!file) {
    documentFrame.innerHTML = '<div class="empty big">Select a matter file or draft a document.</div>';
    return;
  }
  documentFrame.innerHTML = `
    <div class="doc-preview">
      <div class="doc-title">${escapeHtml(file.name ?? file.id)}</div>
      <p>Loaded from this matter’s files.</p>
      <blockquote id="selected-text">${escapeHtml(file.content ?? 'The Alternate Payee shall receive fifty percent of the marital portion.')}</blockquote>
      <pre>${escapeHtml(JSON.stringify(file, null, 2))}</pre>
    </div>`;
}

function renderSession() {
  const provider = localStorage.getItem('lexyos-session-provider') ?? 'preview';
  sessionPanel.textContent = JSON.stringify({ provider, authMode: state.authConfig?.mode ?? 'unknown', backend: '/api', products: (state.authConfig?.products ?? []).map((product) => product.id), selectedMatterId: state.selectedMatter?.id ?? null }, null, 2);
}

function renderTasks() {
  const scoped = state.tasks.filter((task) => !state.selectedMatter || task.matterId === state.selectedMatter.id);
  opsPanel.textContent = JSON.stringify(scoped.map(({ id, title, status, requiresGate, kind }) => ({ id, title, status, requiresGate, kind })), null, 2);
}

function renderGates() {
  gateList.innerHTML = '';
  const scoped = state.gates.filter((gate) => !state.selectedMatter || gate.matterId === state.selectedMatter.id);
  if (!scoped.length) {
    gateList.innerHTML = '<div class="empty">No approvals yet. Draft a document, filing, or service packet.</div>';
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
    .slice(-24)
    .map((event) => ({ at: event.occurredAt ?? event.createdAt, action: event.action, matterId: event.matterId, metadata: event.metadata }));
  auditTrail.textContent = JSON.stringify(scoped, null, 2);
}

function renderResearch(payload) {
  researchPanel.textContent = JSON.stringify(payload, null, 2);
}

async function createMatterFromUi() {
  const stamp = Date.now();
  const matterId = `UI-${stamp}`;
  const matter = await apiJson('/api/matters', {
    method: 'POST',
    body: {
      id: matterId,
      matter_id: matterId,
      tenantId: 'peacock',
      client_display_name: `New Intake Client ${stamp}`,
      matter_type: 'QDRO',
      stage: 'ui-created',
      baseline_data: {
        plan_name: 'New 401(k) Plan',
        case_number: matterId,
        jurisdiction: 'CT',
        participant: 'Participant Name',
        alternate_payee: `New Intake Client ${stamp}`,
      },
    },
  });
  state.selectedMatter = matter;
  matterSearch.value = matterId;
  await refreshAll();
  renderResearch({ createdMatter: matter });
}

async function saveBaselineFromUi() {
  requireMatter();
  const baseline = JSON.parse(baselineEditor.value || '{}');
  const updated = await apiJson('/api/matters', {
    method: 'POST',
    body: {
      ...state.selectedMatter,
      baseline_data: baseline,
      baseline,
      updatedFrom: 'lexyos-ui-baseline-editor',
    },
  });
  state.selectedMatter = updated;
  await refreshAll();
  renderResearch({ baselineSaved: updated });
}

async function uploadMatterFileFromUi() {
  requireMatter();
  const stamp = Date.now();
  const file = await apiJson(`/api/matters/${encodeURIComponent(state.selectedMatter.id)}/files`, {
    method: 'POST',
    body: {
      id: `ui_upload_${state.selectedMatter.id}_${stamp}`,
      name: `UI Uploaded QDRO Note ${stamp}.txt`,
      type: 'qdro',
      mimeType: 'text/plain',
      content: `Uploaded from LexyOS UI for ${displayName(state.selectedMatter)} at ${new Date(stamp).toISOString()}.`,
    },
  });
  state.selectedDocument = file;
  await refreshMatterScopedData();
  renderAll();
  renderDocument(file);
  renderResearch({ uploadedFile: file });
}

async function downloadSelectedFile() {
  requireMatter();
  if (!state.selectedDocument?.id) throw new Error('Select a file before downloading.');
  const result = await apiJson(`/api/matters/${encodeURIComponent(state.selectedMatter.id)}/files/download?fileId=${encodeURIComponent(state.selectedDocument.id)}`);
  renderResearch({ downloadedFile: result });
  renderDocument(result.file ?? state.selectedDocument);
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
  state.selectedDocument = artifact ?? state.selectedDocument;
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
  const filingPacketId = `filing_${state.selectedMatter.id}_${Date.now()}`;
  const result = await apiJson('/api/filing-packets', {
    method: 'POST',
    body: {
      id: filingPacketId,
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
  const servicePacketId = `service_${state.selectedMatter.id}_${Date.now()}`;
  const result = await apiJson('/api/service-packets', {
    method: 'POST',
    body: {
      id: servicePacketId,
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

function currentSessionId() {
  return localStorage.getItem('lexyos-session-id');
}

function currentAccessToken() {
  return localStorage.getItem('lexyos-access-token');
}

async function apiJson(path, options = {}) {
  const accessToken = currentAccessToken();
  const sessionId = currentSessionId();
  if (!accessToken && !sessionId) throw new Error('Sign in before calling LexyOS.');
  const authHeaders = accessToken ? { authorization: `Bearer ${accessToken}` } : { 'x-lexyos-session-id': sessionId };
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...authHeaders, ...(options.headers ?? {}) },
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
