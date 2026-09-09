import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The structured logger writes a line per settled round; tests settle
    // hundreds. Silence it so a failure is readable without scrolling.
    env: { LANDFALL_LOG_LEVEL: 'error' },
  },
});
