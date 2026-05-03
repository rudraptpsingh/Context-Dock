import { Conversation } from '../types';

function escapeForMarkdown(s: string): string {
  // We don't escape full Markdown — the content is already markdown-flavored
  // from the source LLM. We just trim trailing whitespace per line.
  return s.replace(/[ \t]+$/gm, '');
}

export function conversationToMarkdown(conv: Conversation): string {
  const header = [
    `# ${conv.title}`,
    '',
    `- **Platform:** ${conv.platform}`,
    `- **Source:** ${conv.url}`,
    `- **Captured:** ${new Date(conv.createdAt).toISOString()}`,
    `- **Last synced:** ${new Date(conv.lastSyncedAt).toISOString()}`,
    conv.tags.length ? `- **Tags:** ${conv.tags.join(', ')}` : null,
    '',
    '---',
    '',
  ]
    .filter(line => line !== null)
    .join('\n');

  const body = conv.turns
    .map(turn => {
      const heading =
        turn.role === 'user'
          ? '## 👤 User'
          : turn.role === 'assistant'
            ? '## 🤖 Assistant'
            : turn.role === 'system'
              ? '## ⚙️ System'
              : '## 🛠️ Tool';
      const meta = turn.model ? `*${turn.model}*\n\n` : '';
      return `${heading}\n\n${meta}${escapeForMarkdown(turn.content)}\n`;
    })
    .join('\n');

  return `${header}${body}`;
}

export function conversationToJson(conv: Conversation): string {
  return JSON.stringify(conv, null, 2);
}

function safeFilename(name: string): string {
  return name.replace(/[/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'conversation';
}

export async function downloadMarkdown(conv: Conversation): Promise<void> {
  await downloadString(
    `${safeFilename(conv.title)}.md`,
    conversationToMarkdown(conv),
    'text/markdown',
  );
}

export async function downloadJson(conv: Conversation): Promise<void> {
  await downloadString(
    `${safeFilename(conv.title)}.json`,
    conversationToJson(conv),
    'application/json',
  );
}

export async function downloadAllJson(conversations: Conversation[]): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  await downloadString(
    `context-stash-export-${stamp}.json`,
    JSON.stringify({ schemaVersion: 2, exportedAt: Date.now(), conversations }, null, 2),
    'application/json',
  );
}

async function downloadString(filename: string, content: string, mime: string): Promise<void> {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
  } finally {
    // Revoke after a small delay so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
