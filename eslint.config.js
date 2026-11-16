// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['lib/', 'docs/', 'coverage/', 'test/fixtures/']),
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      quotes: ['error', 'single', { avoidEscape: true }],
      'eol-last': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Browser runtime served to the SharePoint page.
    files: ['src/runtime/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/runtime/componentShim.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }] },
  },
);
