// ESLint flat config. Pragmatic rules — surface real bugs, ignore stylistic noise.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'mcp-server/dist/**',
      'mcp-server/node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        MutationObserver: 'readonly',
        CompressionStream: 'readonly',
        history: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Document: 'readonly',
        Location: 'readonly',
        Node: 'readonly',
        globalThis: 'readonly',
      },
    },
    settings: { react: { version: '18.3' } },
    rules: {
      // Real-bug detectors stay on.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-uses-react': 'off',  // React 17+ JSX runtime
      'react/react-in-jsx-scope': 'off',
      // Style + nitpick rules off — we have prettier-style formatting elsewhere.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
      // Playwright's `use(...)` callback inside fixture functions is not a
      // React hook — the rule's name detector misfires.
      'react-hooks/rules-of-hooks': 'off',
      // Playwright fixtures sometimes use empty destructuring patterns.
      'no-empty-pattern': 'off',
    },
  },
];
