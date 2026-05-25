import { test, expect } from '@playwright/test';

const proofTarget = process.env.LEXYOS_E2E_TARGET ?? (process.env.LEXYOS_BASE_URL ? 'remote' : 'local');

async function expectPanelJson(locator, predicate, message) {
  await expect.poll(async () => {
    const text = await locator.textContent();
    if (!text?.trim()) return false;
    try {
      return predicate(JSON.parse(text));
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

    await page.getByRole('button', { name: /New Intake Client/ }).click();
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
    await expect(page.locator('#research-panel')).toContainText('gateDecision');
    await expect(page.locator('#research-panel')).toContainText('approved');
    await expect(page.locator('#ops-panel')).toContainText('approved');

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await expect(page.locator('#research-panel')).toContainText(`filing_${matterId}`);
    await expect(page.locator('#gate-list')).toContainText('filing_approval');
    await page.getByRole('button', { name: 'Reject selected gate' }).click();
    await expect(page.locator('#research-panel')).toContainText('rejected');
    await expect(page.locator('#ops-panel')).toContainText('blocked');

    await page.getByRole('button', { name: 'Prepare filing packet' }).click();
    await page.getByRole('button', { name: 'Approve selected gate' }).click();
    await page.getByRole('button', { name: 'Submit approved filing' }).click();
    await expect(page.locator('#research-panel')).toContainText(`manual-filing_${matterId}`);
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
    await page.getByRole('button', { name: 'Approve selected gate' }).click();
    await page.getByRole('button', { name: 'Send approved service' }).click();
    await expect(page.locator('#research-panel')).toContainText('LOCAL-');
    await page.getByRole('button', { name: 'Upload proof of service' }).click();
    await expect(page.locator('#research-panel')).toContainText('proof_received');
    await expect(page.locator('#research-panel')).toContainText('proof_of_service_review');

    await expect(page.locator('#audit-trail')).toContainText('document.artifact.rendered');
    await expect(page.locator('#audit-trail')).toContainText('filing.packet.submitted');
    await expect(page.locator('#audit-trail')).toContainText('service.proof.received');
    await expect(page.locator('#error-panel')).toBeEmpty();

    await page.screenshot({ path: `proof/matter-cockpit-${proofTarget}.png`, fullPage: true });
  });
});
