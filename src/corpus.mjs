export function createCorpusSource({ id, title, jurisdiction, practiceArea, sourceType, text, visibility = 'public', matterId = null }) {
  if (!id || !text) throw new Error('corpus source id and text are required');
  return { id, title: title ?? id, jurisdiction, practiceArea, sourceType, text, visibility, matterId };
}

export function queryCorpus({ sources = [], query, practiceArea, jurisdiction, matterId = null, allowPrivate = false }) {
  const terms = tokenize(query);
  const scoped = sources.filter((source) => {
    if (practiceArea && source.practiceArea !== practiceArea) return false;
    if (jurisdiction && source.jurisdiction !== jurisdiction) return false;
    if (source.visibility === 'private' && (!allowPrivate || !matterId || source.matterId !== matterId)) return false;
    return terms.some((term) => source.text.toLowerCase().includes(term));
  });
  return scoped.map((source) => ({ sourceId: source.id, title: source.title, quote: bestQuote(source.text, terms), citation: `${source.title} (${source.jurisdiction ?? 'general'})` }));
}

export function answerWithCitations({ question, sources = [], scope = {} }) {
  const citations = queryCorpus({ sources, query: question, ...scope });
  if (!citations.length) return { supported: false, answer: 'Unsupported by loaded Lexy Corpus sources.', citations: [] };
  return { supported: true, answer: citations.map((c) => c.quote).join(' '), citations };
}

export function createCorpusSearchBridge({ sources = [], searchImpl = queryCorpus } = {}) {
  return {
    search({ query, scope = {}, limit = 10 }) {
      const citations = searchImpl({ sources, query, ...scope }).slice(0, limit);
      return {
        status: 'ready',
        requiresFullIngestion: false,
        query,
        scope,
        citations,
        answer: citations.length ? citations.map((item) => item.quote).join(' ') : 'Unsupported by loaded Lexy Corpus sources.',
      };
    },
  };
}

export function verifyCitationQuote(source, quote) {
  return Boolean(source?.text && quote && source.text.includes(quote));
}

export function declareCorpusScope({ practiceArea, jurisdiction, sourceTypes = [] }) {
  return { practiceArea, jurisdiction, sourceTypes };
}

function tokenize(value) {
  return String(value ?? '').toLowerCase().split(/\W+/).filter((term) => term.length > 3);
}

function bestQuote(text, terms) {
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => terms.some((term) => sentence.toLowerCase().includes(term))) ?? sentences[0] ?? '';
}
