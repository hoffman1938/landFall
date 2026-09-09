// @ts-check
/**
 * Flat ESLint config for the workspace.
 *
 * Deliberately narrow: `tsc --strict` already carries the type safety, and
 * Prettier owns formatting, so lint only catches what neither can — unused
 * code, floating promises, `any` creeping into the money paths, and the
 * console.log habit the structured logger replaced.
 *
 * Everything here is a dev dependency; the reason is recorded in the
 * remediation decisions log per §3 of the program document.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/data/**',
      '**/*.d.ts',
      'packages/web/vite.config.ts',
      'packages/server/vitest.config.ts',
      'eslint.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused code is dead weight; `_`-prefixed args stay legal for signatures
      // that must match an interface.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // A dropped promise in the round loop is a silently skipped settlement.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // `any` in a money path defeats the point of strict mode.
      '@typescript-eslint/no-explicit-any': 'error',
      // Logging goes through the structured logger (server) so lines are
      // indexable and carry the instance id.
      'no-console': 'warn',

      // Noise from a codebase that is already strict-typed.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',

      /*
       * The `no-unsafe-*` family is OFF by decision, not by neglect. It fires
       * almost exclusively where `unknown` crosses a wire or JSON boundary —
       * and every one of those boundaries in this codebase is already guarded
       * by a Zod schema (`clientMessage`) or a documented parse of the server's
       * own persisted JSON. Leaving them on produced ~200 findings, none of
       * which pointed at a defect, which is how a linter gets ignored.
       * `no-explicit-any` above still stops `any` being written by hand.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Fires on vitest matcher references and Pixi handler passing; neither is
      // the `this`-loss bug the rule is looking for.
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // The client: React rules of hooks, and console is the browser's own log.
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'off',
    },
  },

  // Tests and dev scripts. Console output is the point, and the smoke script
  // deliberately consumes RAW wire JSON to prove the protocol from the outside
  // — typing it against the internal message union would defeat the test.
  {
    files: ['**/test/**/*.ts', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
