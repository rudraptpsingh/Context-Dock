// Minimal span-based tracing for the extension.
//
// Each span records: name, start, end, duration, status, attributes. We hold
// a ring buffer in memory and mirror to chrome.storage.local for the side
// panel's debug view.

import { createLogger } from './logger';

const log = createLogger('tracing');

const RING_KEY = '__cs_traces__';
const RING_CAP = 200;

export interface Span {
  id: string;
  parentId?: string;
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  error?: string;
}

const completed: Span[] = [];
let pendingFlush: number | null = null;

function flushSoon() {
  if (pendingFlush !== null) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  pendingFlush = setTimeout(async () => {
    pendingFlush = null;
    const drained = completed.splice(0, completed.length);
    if (!drained.length) return;
    try {
      const existing = await chrome.storage.local.get(RING_KEY);
      const prev: Span[] = existing[RING_KEY] ?? [];
      await chrome.storage.local.set({ [RING_KEY]: prev.concat(drained).slice(-RING_CAP) });
    } catch {
      /* swallow */
    }
  }, 250) as unknown as number;
}

function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  end(status?: 'ok' | 'error', error?: unknown): void;
}

export function startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
  const span: Span = {
    id: crypto.randomUUID(),
    name,
    startMs: now(),
    status: 'ok',
    attributes: { ...attributes },
  };
  return {
    setAttribute(key, value) { span.attributes[key] = value; },
    end(status, error) {
      span.endMs = now();
      span.durationMs = span.endMs - span.startMs;
      span.status = status ?? 'ok';
      if (error) span.error = error instanceof Error ? error.message : String(error);
      completed.push(span);
      log.debug(`span:${span.name}`, {
        durationMs: Math.round(span.durationMs),
        status: span.status,
        ...span.attributes,
      });
      flushSoon();
    },
  };
}

export async function trace<T>(
  name: string,
  fn: (span: SpanHandle) => Promise<T> | T,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.end('ok');
    return result;
  } catch (err) {
    span.end('error', err);
    throw err;
  }
}

export async function readTraceBuffer(): Promise<Span[]> {
  try {
    const r = await chrome.storage.local.get(RING_KEY);
    return r[RING_KEY] ?? [];
  } catch {
    return [];
  }
}

export async function clearTraceBuffer(): Promise<void> {
  try { await chrome.storage.local.remove(RING_KEY); } catch { /* ignore */ }
  completed.length = 0;
}
