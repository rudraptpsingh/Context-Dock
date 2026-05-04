import { defineWorkspace } from 'vitest/config';

// Two test projects:
//  - unit: jsdom + in-memory chrome mock, runs every src/*.ts pure-logic test.
//  - integration: node, no setup, spawns the real MCP binary as a subprocess
//    and speaks JSON-RPC against it.
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      testTimeout: 20_000,
    },
  },
]);
