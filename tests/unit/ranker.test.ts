import { describe, expect, it } from 'vitest';
import { rankCandidates, tokenize, type Candidate } from '../../src/utils/ranker';

const snippet = (id: string, content: string, label?: string): Candidate => ({
  kind: 'snippet',
  id,
  projectId: 'p1',
  projectName: 'P',
  content,
  label,
});
const turn = (id: string, content: string, title = 'T'): Candidate => ({
  kind: 'turn',
  conversationId: id,
  conversationTitle: title,
  platform: 'chatgpt',
  content,
  role: 'assistant',
});
const memory = (id: string, content: string): Candidate => ({
  kind: 'memory',
  id,
  platform: 'chatgpt',
  content,
});

describe('tokenize', () => {
  it('lowercases and drops stopwords / single chars', () => {
    expect(tokenize('The quick brown fox in a jar')).toEqual(['quick', 'brown', 'fox', 'jar']);
  });

  it('keeps hyphens and underscores inside terms', () => {
    expect(tokenize('build-system fast_lookup')).toEqual(['build-system', 'fast_lookup']);
  });

  it('returns empty for pure punctuation', () => {
    expect(tokenize('!!!  ???  ...')).toEqual([]);
  });
});

describe('rankCandidates', () => {
  it('returns nothing when query is empty', () => {
    const r = rankCandidates('', [snippet('a', 'irrelevant content')]);
    expect(r).toEqual([]);
  });

  it('ranks the obvious match first', () => {
    const r = rankCandidates('sourdough hydration', [
      snippet('a', 'completely unrelated content about cars and engines'),
      snippet('b', 'sourdough hydration tips: start with 78% for an open crumb'),
      snippet('c', 'baking is fun but sourdough takes practice'),
    ]);
    expect(r[0].candidate.kind === 'snippet' && r[0].candidate.id).toBe('b');
    expect(r[0].score).toBe(1);
    expect(r[0].matchedTerms.sort()).toEqual(['hydration', 'sourdough']);
  });

  it('honours minScore to drop weak single-term matches', () => {
    const r = rankCandidates('python', [
      snippet('a', 'a single mention of python somewhere'),
      snippet('b', 'completely irrelevant'),
    ], { minScore: 5 });
    // BM25 score of 1 hit in ~7 tokens won't reach 5 — both should be filtered.
    expect(r).toHaveLength(0);
  });

  it('mixes candidate kinds and applies weights', () => {
    const r = rankCandidates('typescript generics', [
      snippet('s1', 'typescript generics are a way to parametrise types'),
      turn('t1', 'something completely unrelated about astronauts'),
      memory('m1', 'user prefers typescript generics over runtime checks'),
    ], { weights: { memory: 2 }, minScore: 0 });
    // Memory is doubled, so it should outrank the matching snippet.
    expect(r[0].candidate.kind).toBe('memory');
  });

  it('respects the limit', () => {
    const candidates: Candidate[] = Array.from({ length: 50 }, (_, i) => snippet(`s${i}`, 'test query token'));
    const r = rankCandidates('test query', candidates, { limit: 5, minScore: 0 });
    expect(r).toHaveLength(5);
  });

  it('matches against snippet labels and conversation titles too', () => {
    const r = rankCandidates('deploy binary', [
      snippet('a', 'unrelated', 'how to deploy a binary'),
      turn('t1', 'unrelated content', 'How to deploy a binary'),
      snippet('c', 'totally other stuff'),
    ]);
    // Both first two should match via their label/title fields; the third
    // shouldn't appear at all.
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.find(s => s.candidate.kind === 'snippet' && s.candidate.id === 'c')).toBeUndefined();
  });

  it('normalised score is 0..1 with at least one 1.0', () => {
    const r = rankCandidates('foo bar baz', [
      snippet('a', 'foo bar baz match all'),
      snippet('b', 'just foo'),
      snippet('c', 'nothing here'),
    ]);
    expect(r[0].score).toBe(1);
    for (const s of r) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });
});
