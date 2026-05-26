import { test, expect } from '@playwright/test';

const proofTarget = process.env.LEXYOS_E2E_TARGET ?? (process.env.LEXYOS_BASE_URL ? 'remote' : 'local');

async function expectPanelJson(locator, predicate, message) {
  await expect.poll(async () => {
    const payload = await locator.evaluate((node) => node.dataset.payload || node.textContent);
    if (!payload?.trim()) return false;
    try {
      return predicate(JSON.parse(payload));
    } catch {
      return false;
    }
  }, { message }).toBe(true);
}

test.describe('LexyOS matter cockpit workflow', () => {
  test('exercises matter files, document gates, filing/service lifecycle, corpus refusal/support, and audit trail', async ({ page, request }) => {
    const runId = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const matterId = `Q-${runId}`;
    const clientName = `Playwright Client ${runId}`;
    const authHeaders = { 'x-lexyos-session-id': 'local-dev-owner' };

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
    await expect(page.getByRole('heading', { name: 'Document Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Create API matter' }).click();
    await expect(page.locator('#research-panel')).toContainText('Matter created');
    await expect(page.locator('#matter-search')).toHaveValue(/UI-/);
    const uiBaseline = await page.locator('#baseline-editor').evaluate((node) => JSON.parse(node.value));
    uiBaseline.plan_name = `UI Edited Plan ${runId}`;
    await page.locator('#baseline-editor').fill(JSON.stringify(uiBaseline, null, 2));
    await page.getByRole('button', { name: 'Save baseline edit' }).click();
    await expect(page.locator('#research-panel')).toContainText('Key facts saved');
    await page.getByRole('button', { name: 'Upload sample file' }).click();
    await expect(page.locator('#research-panel')).toContainText('File uploaded');
    await expect(page.locator('#file-list')).toContainText('UI Uploaded QDRO Note');
    await page.getByRole('button', { name: 'Download selected file' }).click();
    await expect(page.locator('#research-panel')).toContainText('File ready');
    await page.locator('#matter-search').fill('');

    await page.getByRole('button', { name: 'New Intake Client — QDRO' }).click();
    await expect(page.locator('#folder-status')).toContainText(/No Drive folder ID/);

    await page.locator('#matter-search').fill(runId);
    await page.getByRole('button', { name: new RegExp(clientName) }).click();
    await expect(page.locator('#folder-status')).toContainText(`Drive folder: drive-${runId}`);
    await expect(page.getByRole('button', { name: new RegExp(`Draft QDRO ${runId}\\.docx`) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`Judgment ${runId}\\.pdf`) })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`Draft QDRO ${runId}\\.docx`) }).click();
    await expect(page.locator('#document-frame')).toContainText(`/api/matters/${matterId}/files`);

    await page.getByRole('button', { name: 'Generate persistent QDRO artifact' }).click();
    await expect(page.locator('#document-frame')).toContainText(`artifact_docgen_${matterId}_qdro-draft`);
    await expect(page.locator('#gate-list')).toContainText('attorney_document_review');
    await expect(page.locator('#ops-panel')).toContainText('Attorney review generated QDRO artifact');

    await page.getByRole('button', { name: 'Approve selected gate' }).click();
    await expect(page.locator('#research-panel')).toContainText('Gate approved');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await expect(page.locator('#ops-panel')).toContainText('No open tasks');

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await expect(page.locator('#research-panel')).toContainText('Filing packet prepared');
    await expect(page.locator('#gate-list')).toContainText('filing_approval');
    await page.getByRole('button', { name: 'Reject selected gate' }).click();
    await expect(page.locator('#research-panel')).toContainText('rejected');
    await expect(page.locator('#ops-panel')).toContainText('blocked');

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gate?.type === 'filing_approval' && json.gate?.status === 'pending' && json.gate?.id?.includes(matterId), 'retry filing gate should be pending before approval');
    const retryFilingGateId = await page.locator('#research-panel').evaluate((el) => JSON.parse(el.dataset.payload).gate.id);
    await page.getByRole('button', { name: new RegExp(retryFilingGateId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.getByRole('button', { name: 'Approve selected gate' }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gateDecision?.id === retryFilingGateId, 'approved filing gate id should be preserved in payload');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await page.getByRole('button', { name: 'Submit approved filing' }).click();
    await expect(page.locator('#research-panel')).toContainText('Filing status');
    await expect(page.locator('#research-panel')).toContainText('submitted');

    await page.getByRole('button', { name: 'Search Lexy Corpus' }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.corpus?.supported === true && json.corpus?.answer?.includes('QDRO drafts require'), 'supported corpus answer should cite loaded memo');

    const refusal = await page.evaluate(async (matterIdForSearch) => {
      const response = await fetch('/api/corpus/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lexyos-session-id': 'local-dev-owner' },
        body: JSON.stringify({
          query: 'alien spaceship transfer rules',
          scope: { matterId: matterIdForSearch, practiceArea: 'family_qdro', jurisdiction: 'CT' },
        }),
      });
      return response.json();
    }, matterId);
    expect(refusal.supported).toBe(false);
    expect(refusal.answer).toContain('Unsupported by loaded Lexy Corpus sources');

    await page.getByRole('button', { name: 'Prepare service packet' }).click();
    await expect(page.locator('#gate-list')).toContainText('service_approval');
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gate?.type === 'service_approval' && json.gate?.status === 'pending' && json.gate?.id?.includes(matterId), 'service gate should be pending before approval');
    const serviceGateId = await page.locator('#research-panel').evaluate((el) => JSON.parse(el.dataset.payload).gate.id);
    await page.getByRole('button', { name: new RegExp(serviceGateId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.getByRole('button', { name: 'Approve selected gate' }).click();
    await expectPanelJson(page.locator('#research-panel'), (json) => json.gateDecision?.id === serviceGateId, 'approved service gate id should be preserved in payload');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await page.getByRole('button', { name: 'Send approved service' }).click();
    await expect(page.locator('#research-panel')).toContainText('LOCAL-');
    await page.getByRole('button', { name: 'Upload proof of service' }).click();
    await expect(page.locator('#research-panel')).toContainText('Proof of service uploaded');

    await expectPanelJson(page.locator('#audit-trail'), (events) => events.some((event) => event.action === 'document.artifact.rendered'), 'audit includes document artifact rendered');
    await expect(page.locator('#audit-trail')).toContainText('filing packet submitted');
    await expect(page.locator('#audit-trail')).toContainText('service proof received');
    await expect(page.locator('#error-panel')).toBeEmpty();

    await page.screenshot({ path: `proof/matter-cockpit-${proofTarget}.png`, fullPage: true });
  });
});
