/**
 * Vitest configuration for the certification suite.
 *
 * The suite lives OUTSIDE the application workspace on purpose — a test
 * laboratory should be able to see, at a glance, which tests are the product's
 * own and which were written for the submission. It still runs against the
 * shipped source rather than a copy: the aliases below point straight at
 * the `src` directory of each shipped package, so every assertion exercises
 * the same bytes the game deploys.
 *
 * It is executed with the application workspace's own toolchain (see `run.sh`),
 * so there is nothing extra to install and no second copy of vitest that could
 * drift from the one the product's suites run under.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pkg = (name: string): string =>
  fileURLToPath(new URL(`../iGaming/packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  root: here,
  resolve: {
    alias: {
      '@landfall/core': pkg('core'),
      '@landfall/server': pkg('server'),
      /*
       * The server package's public surface deliberately excludes its database
       * module, because the Cloudflare host supplies its own. The lifecycle
       * suites need the Node one to stand a real game up against an in-memory
       * SQLite, so they reach it through this alias rather than by widening the
       * product's own exports for the benefit of a test.
       */
      '@landfall/server-src': fileURLToPath(
        new URL('../iGaming/packages/server/src', import.meta.url),
      ),
    },
  },
  test: {
    include: ['suites/**/*.test.ts'],
    /*
     * The lifecycle suite stands a real game up, and the game logs a structured
     * line per settled round. That is correct behaviour and useless output here:
     * a few hundred JSON lines bury the assertions a reviewer is reading. The
     * suites that care about a log line assert on the database record instead.
     */
    env: { LANDFALL_LOG_LEVEL: 'error' },
    // The statistical suites draw millions of samples; the default 5s timeout
    // is for unit tests, not for a chi-square over a million rounds.
    testTimeout: 600_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
});
