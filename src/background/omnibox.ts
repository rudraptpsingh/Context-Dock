// Omnibox: type "cs " in the URL bar to search the Context Stash corpus.
//
// Suggestions show across three kinds (snippet / conversation / memory)
// ranked by the same BM25 ranker we use for the in-page injector. Picking
// a suggestion opens its source URL (or the side panel for a snippet).

import { getConversations, getMemories, getProjects } from '../utils/storage';
import { rankCandidates, type Candidate } from '../utils/ranker';
import { createLogger } from '../utils/logger';

const log = createLogger('omnibox');

interface OmniboxSuggestion {
  content: string;
  description: string;
}

const ESC = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rankCorpus(query: string): Promise<Array<{ candidate: Candidate; score: number }>> {
  if (!query.trim()) return [];
  const [projects, conversations, memories] = await Promise.all([
    getProjects(),
    getConversations(),
    getMemories(),
  ]);
  const candidates: Candidate[] = [];
  for (const p of projects) {
    for (const s of p.snippets) {
      candidates.push({
        kind: 'snippet',
        id: s.id,
        projectId: p.id,
        projectName: p.name,
        content: s.content,
        label: s.label,
        sourceUrl: s.sourceUrl,
      });
    }
  }
  for (const conv of conversations) {
    // For conversations we want the title-or-summary to be searchable, so
    // we fold them in as a single candidate per conversation rather than
    // per-turn. Per-turn is too noisy for autocomplete.
    candidates.push({
      kind: 'turn',
      conversationId: conv.id,
      conversationTitle: conv.title,
      platform: conv.platform,
      content: `${conv.title}\n${conv.summary ?? ''}\n${conv.turns.map(t => t.content).join('\n').slice(0, 4_000)}`,
      role: 'assistant',
    });
  }
  for (const m of memories) {
    candidates.push({ kind: 'memory', id: m.id, platform: m.platform, content: m.text });
  }
  return rankCandidates(query, candidates, { limit: 6, minScore: 0.4 }).map(r => ({
    candidate: r.candidate,
    score: r.score,
  }));
}

function suggestionFor(c: Candidate): OmniboxSuggestion {
  if (c.kind === 'snippet') {
    return {
      content: `cs:snippet:${c.id}`,
      description: `<match>snippet</match> · <dim>${ESC(c.projectName)}</dim> ${ESC((c.label ?? c.content).slice(0, 80))}`,
    };
  }
  if (c.kind === 'turn') {
    return {
      content: `cs:conversation:${c.conversationId}`,
      description: `<match>conversation</match> · <dim>${ESC(c.platform)}</dim> ${ESC(c.conversationTitle.slice(0, 80))}`,
    };
  }
  return {
    content: `cs:memory:${c.id}`,
    description: `<match>memory</match> · <dim>${ESC(c.platform)}</dim> ${ESC(c.content.slice(0, 80))}`,
  };
}

export function installOmnibox() {
  if (!chrome.omnibox) return;

  chrome.omnibox.setDefaultSuggestion({
    description: 'Search Context Stash · type a query',
  });

  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    void (async () => {
      try {
        const ranked = await rankCorpus(text);
        suggest(ranked.map(r => suggestionFor(r.candidate)));
      } catch (err) {
        log.warn('rank failed', err instanceof Error ? err.message : String(err));
        suggest([]);
      }
    })();
  });

  chrome.omnibox.onInputEntered.addListener(async (input, disposition) => {
    const open = (url: string) => {
      if (disposition === 'currentTab') {
        chrome.tabs.update({ url });
      } else if (disposition === 'newForegroundTab') {
        chrome.tabs.create({ url, active: true });
      } else {
        chrome.tabs.create({ url, active: false });
      }
    };

    // If the user picked one of our suggestions the input contains a
    // `cs:<kind>:<id>` token. Otherwise treat it as a free-text query and
    // open the side panel with the query pre-filled.
    const match = /^cs:(snippet|conversation|memory):(.+)$/.exec(input.trim());
    if (!match) {
      const url = chrome.runtime.getURL(
        `src/sidepanel/index.html?q=${encodeURIComponent(input.trim())}`,
      );
      open(url);
      return;
    }
    const [, kind, id] = match;
    if (kind === 'conversation') {
      const all = await getConversations();
      const conv = all.find(c => c.id === id);
      if (conv?.url) {
        open(conv.url);
        return;
      }
    }
    // Snippet / memory: open the side panel pinned to the result.
    open(
      chrome.runtime.getURL(`src/sidepanel/index.html?focus=${kind}:${encodeURIComponent(id)}`),
    );
  });
}
