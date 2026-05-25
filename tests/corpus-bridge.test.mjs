import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorpusSearchBridge, createCorpusSource } from '../src/corpus.mjs';

test('corpus bridge searches loaded sources and returns citations without requiring full ingestion', () => {
  const bridge = createCorpusSearchBridge({ sources: [createCorpusSource({ id: 's1', title: 'Firm QDRO Note', jurisdiction: 'CT', practiceArea: 'family_qdro', sourceType: 'firm_memo', text: 'A QDRO filing packet should include a signed order and judgment.' })] });
  const result = bridge.search({ query: 'QDRO filing judgment', scope: { practiceArea: 'family_qdro', jurisdiction: 'CT' } });
  assert.equal(result.status, 'ready');
  assert.equal(result.requiresFullIngestion, false);
  assert.equal(result.citations.length, 1);
});
