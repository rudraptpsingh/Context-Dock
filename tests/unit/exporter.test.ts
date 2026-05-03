import { describe, it, expect } from 'vitest';
import { conversationToJson, conversationToMarkdown } from '../../src/utils/exporter';
import { Conversation } from '../../src/types';

const sample: Conversation = {
  id: 'cs-1',
  platform: 'chatgpt',
  platformConversationId: 'cgpt-1',
  title: 'Brainstorm: launch plan',
  url: 'https://chatgpt.com/c/cgpt-1',
  turns: [
    { id: 't1', role: 'user',      content: 'How should I launch?',          createdAt: 1, model: 'gpt-4o' },
    { id: 't2', role: 'assistant', content: 'Start with a small audience.', createdAt: 2, model: 'gpt-4o' },
  ],
  tags: ['launch', 'plan'],
  createdAt: 1700_000_000_000,
  lastSyncedAt: 1700_000_001_000,
  autoSync: true,
  contentHash: 'h-test',
};

describe('exporter', () => {
  it('renders conversation to markdown with role headings and metadata', () => {
    const md = conversationToMarkdown(sample);
    expect(md).toContain('# Brainstorm: launch plan');
    expect(md).toContain('**Platform:** chatgpt');
    expect(md).toContain('**Source:** https://chatgpt.com/c/cgpt-1');
    expect(md).toContain('**Tags:** launch, plan');
    expect(md).toContain('## 👤 User');
    expect(md).toContain('## 🤖 Assistant');
    expect(md).toContain('How should I launch?');
    expect(md).toContain('Start with a small audience.');
    expect(md).toContain('*gpt-4o*');
  });

  it('round-trips through JSON without losing fields', () => {
    const json = conversationToJson(sample);
    const parsed = JSON.parse(json) as Conversation;
    expect(parsed).toEqual(sample);
  });

  it('omits the tags line when there are no tags', () => {
    const md = conversationToMarkdown({ ...sample, tags: [] });
    expect(md).not.toContain('Tags:');
  });
});
