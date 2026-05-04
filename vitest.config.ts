import { defineConfig } from 'vitest/config';

// Default config used by the unit project. The integration project lives in
// vitest.workspace.ts so it can run in the node environment without the
// jsdom + chrome-mock setup the unit tests need.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/sidepanel/**/*.tsx', 'src/manifest.json'],
    },
  },
});
