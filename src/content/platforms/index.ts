import { PlatformAdapter } from './types';
import chatgpt from './chatgpt';

const adapters: PlatformAdapter[] = [chatgpt];

export function findAdapter(loc: Location = window.location): PlatformAdapter | null {
  return adapters.find(a => a.matches(loc)) ?? null;
}

export { adapters };
export type { PlatformAdapter } from './types';
