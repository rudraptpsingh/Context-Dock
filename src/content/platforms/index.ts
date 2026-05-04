import { PlatformAdapter } from './types';
import chatgpt from './chatgpt';
import claude from './claude';
import gemini from './gemini';
import perplexity from './perplexity';

const adapters: PlatformAdapter[] = [chatgpt, claude, gemini, perplexity];

export function findAdapter(loc: Location = window.location): PlatformAdapter | null {
  return adapters.find(a => a.matches(loc)) ?? null;
}

export { adapters };
export type { PlatformAdapter } from './types';
