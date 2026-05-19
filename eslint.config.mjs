import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'playwright-report',
      'playwright-report/**',
      'test-results',
      'test-results/**',
      'coverage',
      'coverage/**',
      'node_modules/**',
      'apps/**',
      '**/*.config.ts',
      '**/*.config.js',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['warn', { allow: ['error', 'warn', 'info', 'debug'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
        React: 'readonly',
        // Ambient Electron namespace exposed by @types/electron via global merge.
        // Referenced as `Electron.IpcMainInvokeEvent` etc. in handler signatures.
        Electron: 'readonly',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['error', 'warn', 'info', 'debug'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // Test files: relax type strictness because they use untyped fixtures and
  // ad-hoc mock objects extensively. Production code remains strict; tests
  // prioritize behavior coverage without forcing every mock through app types.
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty-pattern': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  // E2E Playwright fixtures use base.extend({ key: async ({}, use) => ... })
  // where the property name (vaultPath, electronApp, window) starts lowercase
  // and triggers a false-positive "use is called outside a hook" from
  // react-hooks/rules-of-hooks. The functions are Playwright fixtures, not
  // React hooks.
  {
    files: ['e2e/fixtures/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
