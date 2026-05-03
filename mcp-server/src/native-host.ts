// Chrome Native Messaging host loop.
//
// Each message from Chrome is framed as: 4-byte little-endian length + UTF-8 JSON.
// We read those frames off stdin, process, and write a response with the same framing.

import { upsert, replaceAll, listConversations } from './store.js';
import { createLogger } from './logger.js';

const log = createLogger('native-host');

interface InMessage {
  type:
    | 'PUSH_SNAPSHOT'
    | 'REPLACE_ALL'
    | 'GET_CONVERSATIONS'
    | 'GET_CONVERSATION';
  payload?: unknown;
  id?: string;
}

interface OutMessage {
  ok: boolean;
  type: string;
  data?: unknown;
  error?: string;
}

function writeFramed(obj: unknown) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

let inBuf = Buffer.alloc(0);

async function handleMessage(msg: InMessage): Promise<OutMessage> {
  log.debug('msg', { type: msg.type });
  try {
    switch (msg.type) {
      case 'PUSH_SNAPSHOT':
        if (msg.payload && typeof msg.payload === 'object') {
          await upsert(msg.payload as Parameters<typeof upsert>[0]);
        }
        return { ok: true, type: 'PUSH_SNAPSHOT_ACK' };
      case 'REPLACE_ALL':
        if (Array.isArray(msg.payload)) {
          await replaceAll(msg.payload as Parameters<typeof replaceAll>[0]);
        }
        return { ok: true, type: 'REPLACE_ALL_ACK' };
      case 'GET_CONVERSATIONS': {
        const list = await listConversations();
        return { ok: true, type: 'CONVERSATIONS', data: list };
      }
      default:
        return { ok: false, type: 'ERROR', error: `Unknown message type: ${msg.type}` };
    }
  } catch (err) {
    return { ok: false, type: 'ERROR', error: err instanceof Error ? err.message : String(err) };
  }
}

export function startNativeHost(): void {
  process.stdin.on('data', (chunk: Buffer) => {
    inBuf = Buffer.concat([inBuf, chunk]);
    while (inBuf.length >= 4) {
      const len = inBuf.readUInt32LE(0);
      if (inBuf.length < 4 + len) break;
      const body = inBuf.subarray(4, 4 + len);
      inBuf = inBuf.subarray(4 + len);
      try {
        const msg = JSON.parse(body.toString('utf8')) as InMessage;
        handleMessage(msg).then(writeFramed).catch(err => {
          writeFramed({ ok: false, type: 'ERROR', error: String(err) });
        });
      } catch (err) {
        writeFramed({ ok: false, type: 'ERROR', error: `Invalid JSON: ${String(err)}` });
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}
