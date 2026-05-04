// BM25-lite ranker for snippets, conversation turns, and memories. Single
// file, no deps, works against the existing storage shape. Good enough as
// the v1 of "find the most relevant context for this prompt"; the optional
// embeddings upgrade later swaps the score function and keeps the rest.
//
// Implementation notes:
// - Tokeniser is intentionally simple: lowercase, split on non-word, drop
//   stopwords < 2 chars and a stoplist.
// - BM25 with k1 = 1.5, b = 0.75 over the full candidate pool (no IDF
//   smoothing tricks). For a few hundred candidates this is fast enough
//   that we don't need an inverted index.
// - The result is a stable list of items with a normalised 0–1 score so
//   callers can compare across candidate types.

export type Candidate =
  | {
      kind: 'snippet';
      id: string;
      projectId: string;
      projectName: string;
      content: string;
      label?: string;
      sourceUrl?: string;
    }
  | {
      kind: 'turn';
      conversationId: string;
      conversationTitle: string;
      platform: string;
      content: string;
      role: string;
    }
  | {
      kind: 'memory';
      id: string;
      platform: string;
      content: string;
    };

export interface RankedCandidate {
  candidate: Candidate;
  score: number;          // 0–1 normalised
  rawScore: number;       // raw BM25 sum
  matchedTerms: string[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will',
  'with', 'i', 'you', 'we', 'me', 'my', 'your', 'our', 'us', 'them', 'how',
  'what', 'when', 'where', 'why', 'who', 'which',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

interface ScoredDoc {
  candidate: Candidate;
  tokens: string[];
  length: number;
}

export interface RankOptions {
  // top-K cut. Default 20.
  limit?: number;
  // Minimum raw score to keep. Default 0.5 — anything lower is essentially
  // noise (single common-word matches).
  minScore?: number;
  // Down-weight candidates by kind. Defaults to 1 across the board, but
  // callers can prefer e.g. memories over snippets if they want.
  weights?: Partial<Record<Candidate['kind'], number>>;
}

export function rankCandidates(
  query: string,
  candidates: Candidate[],
  opts: RankOptions = {},
): RankedCandidate[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length || !candidates.length) return [];

  const docs: ScoredDoc[] = candidates.map(c => {
    const tokens = tokenize(c.content + ' ' + ('label' in c && c.label ? c.label : '') + ' ' + ('conversationTitle' in c ? c.conversationTitle : ''));
    return { candidate: c, tokens, length: tokens.length };
  });

  // Document frequency for query terms.
  const df = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    df.set(term, docs.filter(d => d.tokens.includes(term)).length);
  }
  const N = docs.length;
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, N);
  const k1 = 1.5;
  const b = 0.75;

  function scoreDoc(d: ScoredDoc): { score: number; matched: string[] } {
    let s = 0;
    const matched: string[] = [];
    for (const term of queryTokens) {
      const dfTerm = df.get(term) ?? 0;
      if (dfTerm === 0) continue;
      const idf = Math.log(1 + (N - dfTerm + 0.5) / (dfTerm + 0.5));
      const tf = d.tokens.filter(t => t === term).length;
      if (tf === 0) continue;
      const norm = tf * (k1 + 1);
      const denom = tf + k1 * (1 - b + b * (d.length / Math.max(1, avgLen)));
      s += idf * (norm / denom);
      if (!matched.includes(term)) matched.push(term);
    }
    return { score: s, matched };
  }

  const weights = { snippet: 1, turn: 1, memory: 1, ...opts.weights };
  const minScore = opts.minScore ?? 0.5;
  const limit = opts.limit ?? 20;

  const scored = docs
    .map(d => {
      const { score, matched } = scoreDoc(d);
      const weighted = score * (weights[d.candidate.kind] ?? 1);
      return { candidate: d.candidate, rawScore: weighted, matchedTerms: matched };
    })
    .filter(s => s.rawScore >= minScore)
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, limit);

  const max = scored.reduce((m, s) => Math.max(m, s.rawScore), 0);
  return scored.map(s => ({
    ...s,
    score: max === 0 ? 0 : s.rawScore / max,
  }));
}
