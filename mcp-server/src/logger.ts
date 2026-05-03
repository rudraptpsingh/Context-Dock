// Logger for the MCP server binary.
//
// CRITICAL: in MCP stdio mode, stdout is reserved for protocol frames. Anything
// printed to stdout will corrupt the MCP stream. We log to stderr only, plus
// optionally append to a rotating file at $DATA_DIR/logs/server.log.

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level = (process.env.CONTEXT_STASH_LOG_LEVEL as Level) ?? 'info';
const dataDir =
  process.env.CONTEXT_STASH_DATA_DIR ?? join(homedir(), '.config', 'context-stash');
const logFile = join(dataDir, 'logs', 'server.log');

let fileReady = false;
async function ensureLogDir() {
  if (fileReady) return;
  try {
    await mkdir(dirname(logFile), { recursive: true });
    fileReady = true;
  } catch {
    /* fall back to stderr-only */
  }
}

function fmt(level: Level, ns: string, msg: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const payload = data === undefined ? '' : ` ${safeStringify(data)}`;
  return `${ts} ${level.toUpperCase().padEnd(5)} [${ns}] ${msg}${payload}\n`;
}

function safeStringify(d: unknown): string {
  try { return JSON.stringify(d); }
  catch { return String(d); }
}

async function emit(level: Level, ns: string, msg: string, data?: unknown) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = fmt(level, ns, msg, data);
  process.stderr.write(line);
  try {
    await ensureLogDir();
    if (fileReady) await appendFile(logFile, line, 'utf8');
  } catch {
    /* log writes must never throw */
  }
}

export interface ServerLogger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(suffix: string): ServerLogger;
}

export function createLogger(ns: string): ServerLogger {
  return {
    debug(msg, data) { void emit('debug', ns, msg, data); },
    info(msg, data)  { void emit('info',  ns, msg, data); },
    warn(msg, data)  { void emit('warn',  ns, msg, data); },
    error(msg, data) { void emit('error', ns, msg, data); },
    child(suffix)    { return createLogger(`${ns}:${suffix}`); },
  };
}

export const logFilePath = logFile;
