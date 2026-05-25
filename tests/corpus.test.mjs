import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithCitations, createCorpusSource, declareCorpusScope, queryCorpus, verifyCitationQuote } from '../src/corpus.mjs';

test('Lexy Corpus returns cited supported answers and verifies quotes', () => {
  const source = createCorpusSource({ id: 'ct-rule', title: 'CT QDRO Memo', jurisdiction: 'CT', practiceArea: 'family_qdro', sourceType: 'firm_memo', text: 'A QDRO filing packet should include the signed order and judgment.' });
  const answer = answerWithCitations({ question: 'What should a QDRO filing packet include?', sources: [source], scope: { practiceArea: 'family_qdro', jurisdiction: 'CT' } });
  assert.equal(answer.supported, true);
  assert.equal(answer.citations.length, 1);
  assert.equal(verifyCitationQuote(source, answer.citations[0].quote), true);
});

test('Lexy Corpus refuses unsupported answers and respects private matter boundary', () => {
  const privateSource = createCorpusSource({ id: 'client-note', text: 'Private plan detail.', visibility: 'private', matterId: 'M1' });
  assert.equal(queryCorpus({ sources: [privateSource], query: 'plan detail', matterId: 'M2', allowPrivate: true }).length, 0);
  assert.equal(answerWithCitations({ question: 'unloaded topic', sources: [] }).supported, false);
  assert.deepEqual(declareCorpusScope({ practiceArea: 'family_qdro', jurisdiction: 'CT', sourceTypes: ['rule'] }), { practiceArea: 'family_qdro', jurisdiction: 'CT', sourceTypes: ['rule'] });
});
