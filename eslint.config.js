import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import react from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nextApps = ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
      // Static assets served as-is (the service worker, offline fallback page, icons) — not
      // application source.
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  // NestJS resolves constructor dependencies from runtime class references, so imports used only
  // in constructor parameter types must stay value imports in the API.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  ...nextVitals.map((config) => ({ ...config, files: nextApps })),
  {
    files: nextApps,
    settings: { next: { rootDir: ['apps/web/', 'apps/admin/'] } },
    plugins: { react },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // All user-facing text comes from the i18n catalogs (docs/architecture.md §M).
      // Punctuation needs no translation.
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ['·', '—', '–', '/', ':', '(', ')', '×'],
        },
      ],
    },
  },
);
