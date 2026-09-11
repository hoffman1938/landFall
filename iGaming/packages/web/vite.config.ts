import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Build stamp for GLI-19 §2.6.2 (G34): the player software must carry enough
 * information to identify itself and its version. The commit is the honest
 * answer — it is what a support or dispute conversation actually needs — and it
 * falls back rather than failing a build outside a git checkout.
 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __LANDFALL_BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
