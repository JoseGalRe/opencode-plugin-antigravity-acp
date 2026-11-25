import { readFileSync } from 'node:fs';

import { defineConfig } from 'vite-plus';

/**
 * Every dependency is bundled into `dist/index.js`, so the file carries their licenses.
 */
const BUNDLED_LICENSES = [
  ['@agentclientprotocol/sdk', 'https://github.com/agentclientprotocol/typescript-sdk'],
  ['zod', 'https://github.com/colinhacks/zod'],
].map(([name, url]) => `Includes ${name} (${url}):\n${readFileSync(`node_modules/${name}/LICENSE`, 'utf8').trimEnd()}`);

export default defineConfig({
  pack: {
    banner: {
      js: `/*\n${BUNDLED_LICENSES.join('\n\n')}\n*/`,
    },
    clean: true,
    deps: {
      alwaysBundle: [/.*/],
      dts: {
        alwaysBundle: [/.*/],
      },
      onlyBundle: false,
      onlyImport: [],
    },
    dts: {
      sourcemap: false,
    },
    entry: {
      index: 'src/index.ts',
    },
    fixedExtension: false,
    format: ['esm'],
    inputOptions: {
      experimental: {
        attachDebugInfo: 'none',
      },
    },
    platform: 'node',
    root: 'src',
    sourcemap: false,
    target: 'node26',
  },
  lint: {
    env: {
      node: true,
      vitest: true,
    },
    plugins: ['eslint', 'jsdoc', 'node', 'oxc', 'promise', 'typescript', 'unicorn', 'import', 'vitest'],
    categories: {
      correctness: 'error',
      nursery: 'error',
      suspicious: 'warn',
    },
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
    },
    rules: {
      /**
       * Prevent circular dependencies, which can cause runtime errors and make code harder to understand.
       */
      'import/no-cycle': 'error',
      /**
       * ACP names its extension field `_meta`.
       */
      'eslint/no-underscore-dangle': ['warn', { allow: ['_meta'] }],
    },
    ignorePatterns: [
      '**/.git',
      '**/.vscode',
      '**/client.d.ts',
      '**/build',
      '**/coverage',
      '**/dist',
      '**/node_modules',
      '**/pnpm-lock.*',
    ],
    overrides: [
      {
        files: ['**/*.test.ts', 'tests/**', 'scripts/**'],
        rules: {
          'typescript/restrict-template-expressions': 'off',
          'typescript/no-base-to-string': 'off',
          'eslint/no-shadow': 'off',
        },
      },
    ],
  },
  fmt: {
    printWidth: 128,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    quoteProps: 'consistent',
    trailingComma: 'all',
    sortImports: {
      newlinesBetween: true,
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
    },
    ignorePatterns: ['dist/**', 'pnpm-lock.yaml'],
  },
  test: {
    coverage: {
      exclude: [
        '**/node_modules/**',
        '**/build/**',
        '**/dist/**',
        '**/.{git,cache,output,temp}/**',
        '**/{*-test,*-types,index}.{js,ts,jsx,tsx}',
        '**/*.json',
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        perFile: true,
        statements: 100,
      },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
  },
  staged: {
    '*': 'vp fmt --no-error-on-unmatched-pattern',
  },
});
