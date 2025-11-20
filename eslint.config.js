import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        CONFIG: 'writable',
        API: 'writable',
        Components: 'writable',
        MOCK_DATA: 'writable',
        debug: 'readonly',
        debugWarn: 'readonly',
        debugError: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
  {
    ignores: [
      'src/bundles/**',
      'web-ext-artifacts/**',
      'coverage/**',
      'node_modules/**',
    ],
  },
];
