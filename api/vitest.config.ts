import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@contrat': fileURLToPath(new URL('../augure/src/core', import.meta.url)) } },
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
