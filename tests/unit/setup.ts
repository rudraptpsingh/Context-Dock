// Vitest setup: install a minimal in-memory chrome.* mock so storage-using
// modules can run in jsdom without the real Chrome APIs. Keeps every test
// isolated by resetting the store between runs.

import { beforeEach, vi } from 'vitest';

interface ChromeStorageMock {
  __reset(): void;
  __getRaw(): Record<string, unknown>;
}

function makeStorageArea() {
  let data: Record<string, unknown> = {};
  const listeners: Array<
    (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void
  > = [];
  return {
    data,
    listeners,
    api: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
        if (keys == null) return { ...data };
        if (typeof keys === 'string') return { [keys]: data[keys] };
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {};
          for (const k of keys) out[k] = data[k];
          return out;
        }
        const out: Record<string, unknown> = { ...keys };
        for (const k of Object.keys(keys)) {
          if (k in data) out[k] = data[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data[k], newValue: v };
          data[k] = v;
        }
        for (const l of listeners) l(changes, 'local');
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete data[k];
      }),
      clear: vi.fn(async () => {
        data = {};
      }),
    },
    reset() {
      data = {};
      listeners.length = 0;
    },
    getRaw() {
      return data;
    },
  };
}

const local = makeStorageArea();

const chromeMock: typeof globalThis.chrome & ChromeStorageMock = {
  storage: {
    local: local.api,
    onChanged: {
      addListener: (
        fn: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void,
      ) => local.listeners.push(fn),
      removeListener: (fn: unknown) => {
        const i = local.listeners.indexOf(
          fn as (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void,
        );
        if (i >= 0) local.listeners.splice(i, 1);
      },
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: undefined,
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(async () => []),
  },
  downloads: {
    download: vi.fn(async () => 1),
  },
  __reset() {
    local.reset();
  },
  __getRaw() {
    return local.getRaw();
  },
} as unknown as typeof globalThis.chrome & ChromeStorageMock;

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// Provide crypto.randomUUID for jsdom (some Node versions miss it on globalThis).
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...(globalThis.crypto ?? {}),
      randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 10),
    },
  });
}

beforeEach(() => {
  chromeMock.__reset();
});

export {};
