import { beforeEach, describe, expect, it } from 'vitest';

interface ChromeMock { __reset(): void; __getRaw(): Record<string, unknown> }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function load() {
  const { vi } = await import('vitest');
  vi.resetModules();
  const logger = await import('../../../src/utils/logger');
  const tracing = await import('../../../src/utils/tracing');
  return { logger, tracing };
}

async function flush() {
  // The ring buffer flushes via setTimeout(250). Wait it out reliably.
  await new Promise(resolve => setTimeout(resolve, 350));
}

describe('logger ring buffer', () => {
  beforeEach(() => chromeMock.__reset());

  it('caps at 500 entries even under 5x load', async () => {
    const { logger } = await load();
    logger.setLogLevel('debug');
    const log = logger.createLogger('stress');
    for (let i = 0; i < 2500; i++) log.info(`msg-${i}`);
    await flush();
    const buf = await logger.readLogBuffer();
    expect(buf.length).toBeLessThanOrEqual(500);
    // Most recent entries are retained (ring is FIFO).
    expect(buf[buf.length - 1].msg).toBe('msg-2499');
  });

  it('respects level filtering when minLevel is info (debug stays out of buffer)', async () => {
    const { logger } = await load();
    logger.setLogLevel('info');
    const log = logger.createLogger('lvl');
    for (let i = 0; i < 100; i++) log.debug(`d-${i}`);
    log.info('keep-me');
    await flush();
    const buf = await logger.readLogBuffer();
    expect(buf.some(e => e.msg === 'keep-me')).toBe(true);
    expect(buf.every(e => !e.msg.startsWith('d-'))).toBe(true);
  });

  it('clearLogBuffer removes everything', async () => {
    const { logger } = await load();
    const log = logger.createLogger('clear');
    log.info('a');
    log.info('b');
    await flush();
    expect((await logger.readLogBuffer()).length).toBeGreaterThan(0);
    await logger.clearLogBuffer();
    expect((await logger.readLogBuffer()).length).toBe(0);
  });
});

describe('tracing ring buffer', () => {
  beforeEach(() => chromeMock.__reset());

  it('caps spans at 200 even under heavy emit', async () => {
    const { tracing } = await load();
    for (let i = 0; i < 1000; i++) {
      const s = tracing.startSpan(`sp-${i}`, { i });
      s.end('ok');
    }
    await flush();
    const buf = await tracing.readTraceBuffer();
    expect(buf.length).toBeLessThanOrEqual(200);
    expect(buf[buf.length - 1].name).toBe('sp-999');
  });

  it('records duration and status on async work', async () => {
    const { tracing } = await load();
    const result = await tracing.trace('async.work', async () => {
      await new Promise(r => setTimeout(r, 10));
      return 42;
    });
    expect(result).toBe(42);
    await flush();
    const buf = await tracing.readTraceBuffer();
    const last = buf[buf.length - 1];
    expect(last.name).toBe('async.work');
    expect(last.status).toBe('ok');
    expect(last.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures error status when the wrapped fn throws', async () => {
    const { tracing } = await load();
    await expect(
      tracing.trace('bad', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await flush();
    const buf = await tracing.readTraceBuffer();
    const last = buf[buf.length - 1];
    expect(last.status).toBe('error');
    expect(last.error).toBe('boom');
  });
});
