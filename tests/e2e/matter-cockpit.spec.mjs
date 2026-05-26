import { test, expect } from '@playwright/test';

const proofTarget = process.env.LEXYOS_E2E_TARGET ?? (process.env.LEXYOS_BASE_URL ? 'remote' : 'local');

async function panelPayload(locator) {
  return locator.evaluate((node) => node.dataset?.payload || node.textContent || '');
}

async function expectPanelJson(locator, predicate, message) {
  await expect.poll(async () => {
    const payload = await panelPayload(locator);
    if (!payload?.trim()) return false;
    try {
      return predicate(JSON.parse(payload));
    } catch {
      return false;
    }
  }, { message }).toBe(true);
}

async function expectPanelTextOrJson(locator, textPattern, predicate, message) {
  await expect.poll(async () => {
    const text = await locator.textContent();
    const payload = await panelPayload(locator);
    if (textPattern?.test(text || '') || textPattern?.test(payload || '')) return true;
    if (!predicate || !payload?.trim()) return false;
    try {
      return predicate(JSON.parse(payload));
    } catch {
      return false;
    }
  }, { message }).toBe(true);
}

async function readPanelJson(locator) {
  return JSON.parse(await panelPayload(locator));
}

async function clickGate(page, gateId) {
  const byData = page.locator(`[data-gate-id="${gateId}"]`);
  if (await byData.count()) {
    await byData.first().click();
    return;
  }
  await page.getByRole('button', { name: new RegExp(gateId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
}

async function authHeadersForTarget(request) {
  if (!process.env.LEXYOS_SMOKE_EMAIL || !process.env.LEXYOS_SMOKE_PASSWORD) {
    return { 'x-lexyos-session-id': 'local-dev-owner' };
  }
  const configResponse = await request.get('/api/auth/config');
  const config = await configResponse.json();
  if (config.mode !== 'supabase') return { 'x-lexyos-session-id': 'local-dev-owner' };
  const tokenResponse = await request.post(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: config.anonKey },
    data: { email: process.env.LEXYOS_SMOKE_EMAIL, password: process.env.LEXYOS_SMOKE_PASSWORD },
  });
  expect(tokenResponse).toBeOK();
  const tokenBody = await tokenResponse.json();
  return { Authorization: `Bearer ${tokenBody.access_token}` };
}

async function loginForTarget(page) {
  if (process.env.LEXYOS_SMOKE_EMAIL && process.env.LEXYOS_SMOKE_PASSWORD && await page.locator('#login-email').isVisible().catch(() => false)) {
    await page.locator('#login-email').fill(process.env.LEXYOS_SMOKE_EMAIL);
    await page.locator('#login-password').fill(process.env.LEXYOS_SMOKE_PASSWORD);
    await page.locator('#password-login button[type="submit"]').click();
    return;
  }
  await expect(page.getByRole('button', { name: 'Continue with Google Workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google Workspace' }).click();
}

test.describe('LexyOS matter cockpit workflow', () => {
  test('exercises matter files, document gates, filing/service lifecycle, corpus refusal/support, and audit trail', async ({ page, request }) => {
    const runId = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const matterId = `Q-${runId}`;
    const clientName = `Playwright Client ${runId}`;
    const authHeaders = await authHeadersForTarget(request);

    const matterResponse = await request.post('/api/matters', {
      headers: authHeaders,
      data: {
        id: matterId,
        matter_id: matterId,
        tenantId: 'peacock',
        client_display_name: clientName,
        matter_type: 'QDRO',
        stage: 'e2e-proof',
        drive_folder_id: `drive-${runId}`,
        baseline_data: {
          plan_name: 'Fidelity 401(k)',
          case_number: runId,
          court_name: 'Superior Court',
          jurisdiction: 'CT',
          participant: 'Pat Participant',
          alternate_payee: clientName,
        },
      },
    });
    expect(matterResponse).toBeOK();

    const qdroFileResponse = await request.post(`/api/matters/${encodeURIComponent(matterId)}/files`, {
      headers: authHeaders,
      data: { id: `file-${runId}-qdro`, name: `Draft QDRO ${runId}.docx`, type: 'qdro', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', content: 'E2E draft QDRO content.' },
    });
    expect(qdroFileResponse).toBeOK();

    const judgmentFileResponse = await request.post(`/api/matters/${encodeURIComponent(matterId)}/files`, {
      headers: authHeaders,
      data: { id: `file-${runId}-judgment`, name: `Judgment ${runId}.pdf`, type: 'judgment', mimeType: 'application/pdf', content: 'E2E judgment content.' },
    });
    expect(judgmentFileResponse).toBeOK();

    await page.goto('/');

    await expect(page).toHaveTitle(/LexyOS Matter Cockpit/);
    await loginForTarget(page);
    await expect(page.getByRole('heading', { name: /^(Document Workspace|Documents)$/ })).toBeVisible();

    await page.getByRole('button', { name: /^(Create API matter|New matter)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), /Matter created|createdMatter/, (json) => Boolean(json.createdMatter), 'created matter receipt should render');
    await expect(page.locator('#matter-search')).toHaveValue(/UI-/);
    const uiBaseline = await page.locator('#baseline-editor').evaluate((node) => JSON.parse(node.value));
    uiBaseline.plan_name = `UI Edited Plan ${runId}`;
    await page.locator('#baseline-editor').fill(JSON.stringify(uiBaseline, null, 2));
    await page.getByRole('button', { name: /^(Save baseline edit|Save facts)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), new RegExp(`UI Edited Plan ${runId}|Key facts saved`), null, 'baseline save receipt should render');
    await page.getByRole('button', { name: /^(Upload sample file|Add sample file)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), /uploadedFile|File uploaded/, (json) => Boolean(json.uploadedFile), 'file upload receipt should render');
    await expect(page.locator('#file-list')).toContainText('UI Uploaded QDRO Note');
    await page.getByRole('button', { name: 'Download selected file' }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), /downloadedFile|File ready/, (json) => Boolean(json.downloadedFile), 'file download receipt should render');
    await page.locator('#matter-search').fill('');

    await page.getByRole('button', { name: 'New Intake Client — QDRO' }).click();
    await expect(page.locator('#folder-status')).toContainText(/No Drive folder (ID|connected)/);

    await page.locator('#matter-search').fill(runId);
    await page.getByRole('button', { name: new RegExp(clientName) }).click();
    await expect(page.locator('#folder-status')).toContainText(`Drive folder: drive-${runId}`);
    await expect(page.getByRole('button', { name: new RegExp(`Draft QDRO ${runId}\\.docx`) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`Judgment ${runId}\\.pdf`) })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`Draft QDRO ${runId}\\.docx`) }).click();
    await expect(page.locator('#document-frame')).toContainText(new RegExp(`/api/matters/${matterId}/files|Loaded from selected matter files|Loaded from this matter`));

    await page.locator('#generate-doc').click();
    await expect(page.locator('#document-frame')).toContainText(`artifact_docgen_${matterId}_qdro-draft`);
    await expect(page.locator('#gate-list')).toContainText(/attorney[ _]document[ _]review/);
    await expect(page.locator('#ops-panel')).toContainText('Attorney review generated QDRO artifact');

    await page.getByRole('button', { name: /^(Approve selected gate|Approve selected item)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), /gateDecision|Approval approved|Gate approved/, (json) => Boolean(json.gateDecision), 'gate decision receipt should render');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await expect(page.locator('#ops-panel')).toContainText(/approved|No open tasks/);

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), new RegExp(`filing_${matterId}|Filing packet prepared`), (json) => Boolean(json.gate?.id?.includes(matterId)), 'filing packet receipt should render');
    await expect(page.locator('#gate-list')).toContainText(/filing[ _]approval/);
    await page.getByRole('button', { name: /^(Reject selected gate|Reject selected item)$/ }).click();
    await expect(page.locator('#research-panel')).toContainText('rejected');
    await expect(page.locator('#ops-panel')).toContainText('blocked');

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gate?.type === 'filing_approval' && json.gate?.status === 'pending' && json.gate?.id?.includes(matterId), 'retry filing gate should be pending before approval');
    const retryFilingGateId = (await readPanelJson(page.locator('#research-panel'))).gate.id;
    await clickGate(page, retryFilingGateId);
    await page.getByRole('button', { name: /^(Approve selected gate|Approve selected item)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), new RegExp(retryFilingGateId), (json) => json.gateDecision?.id === retryFilingGateId, 'approved filing gate id should be preserved');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await page.getByRole('button', { name: 'Submit approved filing' }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), new RegExp(`manual-filing_${matterId}|Filing status`), null, 'filing submission receipt should render');
    await expect(page.locator('#research-panel')).toContainText('submitted');

    await page.getByRole('button', { name: /^(Search Lexy Corpus|Search legal library)$/ }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.corpus?.supported === true && json.corpus?.answer?.includes('QDRO drafts require'), 'supported corpus answer should cite loaded memo');

    const refusal = await page.evaluate(async ({ matterIdForSearch, authHeadersForFetch }) => {
      const response = await fetch('/api/corpus/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeadersForFetch },
        body: JSON.stringify({
          query: 'alien spaceship transfer rules',
          scope: { matterId: matterIdForSearch, practiceArea: 'family_qdro', jurisdiction: 'CT' },
        }),
      });
      return response.json();
    }, { matterIdForSearch: matterId, authHeadersForFetch: authHeaders });
    expect(refusal.supported).toBe(false);
    expect(refusal.answer).toContain('Unsupported by loaded Lexy Corpus sources');

    await page.getByRole('button', { name: 'Prepare service packet' }).click();
    await expect(page.locator('#gate-list')).toContainText(/service[ _]approval/);
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gate?.type === 'service_approval' && json.gate?.status === 'pending' && json.gate?.id?.includes(matterId), 'service gate should be pending before approval');
    const serviceGateId = (await readPanelJson(page.locator('#research-panel'))).gate.id;
    await clickGate(page, serviceGateId);
    await page.getByRole('button', { name: /^(Approve selected gate|Approve selected item)$/ }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), new RegExp(serviceGateId), (json) => json.gateDecision?.id === serviceGateId, 'approved service gate id should be preserved');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await page.getByRole('button', { name: 'Send approved service' }).click();
    await expect(page.locator('#research-panel')).toContainText('LOCAL-');
    await page.getByRole('button', { name: 'Upload proof of service' }).click();
    await expectPanelTextOrJson(page.locator('#research-panel'), /proof_received|Proof of service uploaded/, (json) => Boolean(json.proof || json.gate), 'proof upload receipt should render');

    await expectPanelTextOrJson(page.locator('#audit-trail'), /document\.artifact\.rendered/, (events) => Array.isArray(events) && events.some((event) => event.action === 'document.artifact.rendered'), 'audit includes document artifact rendered');
    await expect(page.locator('#audit-trail')).toContainText(/filing\.packet\.submitted|filing packet submitted/);
    await expect(page.locator('#audit-trail')).toContainText(/service\.proof\.received|service proof received/);
    await expect(page.locator('#error-panel')).toBeEmpty();

    await page.screenshot({ path: `proof/matter-cockpit-${proofTarget}.png`, fullPage: true });
  });
});
