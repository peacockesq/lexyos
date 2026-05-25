from pathlib import Path
from playwright.sync_api import sync_playwright, expect

import os

BASE_URL = os.environ.get('LEXYOS_BASE_URL', 'http://127.0.0.1:5199')
ROOT = Path(__file__).resolve().parents[1]
PROOF_DIR = Path(os.environ.get('LEXYOS_PROOF_DIR', ROOT / 'proof'))
PROOF_DIR.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={'width': 1600, 'height': 1100})
        page.goto(BASE_URL, wait_until='networkidle')
        expect(page.locator('#matter-list')).to_contain_text('Q-2026-001')
        expect(page.locator('#session-panel')).to_contain_text('/api')

        page.locator('#generate-doc').click()
        expect(page.locator('#document-frame')).to_contain_text('artifact_docgen_Q-2026-001_qdro-draft')
        expect(page.locator('#gate-list')).to_contain_text('approve_document:docgen_Q-2026-001_qdro-draft')

        page.locator('#approve-gate').click()
        expect(page.locator('#ops-panel')).to_contain_text('approved')

        page.locator('#create-filing').click()
        expect(page.locator('#research-panel')).to_contain_text('filing_Q-2026-001')
        page.locator('#gate-list').get_by_text('submit_filing:filing_Q-2026-001').click()
        page.locator('#approve-gate').click()
        page.locator('#submit-filing').click()
        expect(page.locator('#research-panel')).to_contain_text('submitted')

        page.locator('#prepare-service').click()
        expect(page.locator('#research-panel')).to_contain_text('service_Q-2026-001')
        page.locator('#gate-list').get_by_text('send_service:service_Q-2026-001').click()
        page.locator('#approve-gate').click()
        page.locator('#send-service').click()
        expect(page.locator('#research-panel')).to_contain_text('sent')
        page.locator('#upload-proof').click()
        expect(page.locator('#research-panel')).to_contain_text('proof_received')

        page.locator('#search-corpus').click()
        expect(page.locator('#research-panel')).to_contain_text('supported')

        page.locator('#eva-propose').click()
        expect(page.locator('#eva-proposal')).to_contain_text('tracked_change_proposal')

        expect(page.locator('#error-panel')).to_be_empty()
        page.screenshot(path=str(PROOF_DIR / 'lexyos-ui-smoke.png'), full_page=True)
        print({
            'url': BASE_URL,
            'screenshot': str(PROOF_DIR / 'lexyos-ui-smoke.png'),
            'document_frame': page.locator('#document-frame').inner_text()[:120],
            'research_panel': page.locator('#research-panel').inner_text()[:240],
            'ops_panel': page.locator('#ops-panel').inner_text()[:240],
        })
    finally:
        browser.close()
