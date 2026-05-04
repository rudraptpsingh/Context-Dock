// Lightweight structured logger.
//
// - Namespaced: createLogger('harvester:chatgpt') tags every line.
// - Level-aware: silent in production unless `?cs_debug=1` or
//   `localStorage.contextStashDebug = '1'`.
// - Ring-buffered to chrome.storage.local under `__logs__` so the side panel
//   can render the recent log stream for diagnostics. Capped at 500 entries.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  ns: string;
  msg: string;
  data?: unknown;
}

const RING_KEY = '__cs_logs__';
const RING_CAP = 500;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = 'info';
let ringEnabled = true;
let pendingFlush: number | null = null;
const buffer: LogEntry[] = [];

function detectMinLevel(): LogLevel {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('cs_debug') === '1') return 'debug';
      const ls = window.localStorage?.getItem('contextStashDebug');
      if (ls === '1') return 'debug';
    }
  } catch {
    /* no DOM in service worker; ignore */
  }
  return 'info';
}

minLevel = detectMinLevel();

function flushSoon() {
  if (!ringEnabled) return;
  if (pendingFlush !== null) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  pendingFlush = setTimeout(async () => {
    pendingFlush = null;
    const drained = buffer.splice(0, buffer.length);
    if (!drained.length) return;
    try {
      const existing = await chrome.storage.local.get(RING_KEY);
      const prev: LogEntry[] = existing[RING_KEY] ?? [];
      const next = prev.concat(drained).slice(-RING_CAP);
      await chrome.storage.local.set({ [RING_KEY]: next });
    } catch {
      /* swallow — logging should never throw */
    }
  }, 250) as unknown as number;
}

function emit(entry: LogEntry) {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel]) return;
  const prefix = `[${entry.ns}]`;
  const fn =
    entry.level === 'debug'
      ? console.debug
      : entry.level === 'info'
        ? console.info
        : entry.level === 'warn'
          ? console.warn
          : console.error;
  if (entry.data !== undefined) fn(prefix, entry.msg, entry.data);
  else fn(prefix, entry.msg);
  buffer.push(entry);
  flushSoon();
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(suffix: string): Logger;
}

export function createLogger(ns: string): Logger {
  return {
    debug(msg, data) { emit({ ts: Date.now(), level: 'debug', ns, msg, data }); },
    info(msg, data)  { emit({ ts: Date.now(), level: 'info',  ns, msg, data }); },
    warn(msg, data)  { emit({ ts: Date.now(), level: 'warn',  ns, msg, data }); },
    error(msg, data) { emit({ ts: Date.now(), level: 'error', ns, msg, data }); },
    child(suffix)    { return createLogger(`${ns}:${suffix}`); },
  };
}

export async function readLogBuffer(): Promise<LogEntry[]> {
  try {
    const r = await chrome.storage.local.get(RING_KEY);
    return r[RING_KEY] ?? [];
  } catch {
    return [];
  }
}

export async function clearLogBuffer(): Promise<void> {
  try { await chrome.storage.local.remove(RING_KEY); } catch { /* ignore */ }
  buffer.length = 0;
}

export function setLogLevel(level: LogLevel): void { minLevel = level; }
export function setRingEnabled(enabled: boolean): void { ringEnabled = enabled; }
