import test from 'node:test';
import assert from 'node:assert/strict';
import { createLicenseBoundaryMemo, createThreatModel } from '../src/risk.mjs';

test('risk memo documents clean-room license boundary and security threat controls', () => {
  const threat = createThreatModel({ product: 'LexyOS', assets: ['tenant matters', 'filings'], controls: ['tenant filtering', 'approval gates'] });
  assert.ok(threat.risks.some((risk) => risk.includes('cross-tenant')));
  const memo = createLicenseBoundaryMemo({ inspirations: ['MikeOS', 'Lawvern'], copiedCode: false, publicCore: ['schema', 'adapters'], privatePlugins: ['Peacock QDRO workflows'] });
  assert.equal(memo.cleanRoom, true);
  assert.match(memo.summary, /No upstream code copied/);
});
