import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Mêmes alias que tsconfig.json : le contrat partagé et ses fixtures (adaptateur mémoire).
const augure = (chemin: string) => fileURLToPath(new URL(`../augure/src/${chemin}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@contrat\/(.*)$/, replacement: `${augure('core')}/$1` },
      { find: /^@fixtures$/, replacement: augure('infra/fixtures/index.ts') },
      { find: /^@fixtures\/(.*)$/, replacement: `${augure('infra/fixtures')}/$1` },
    ],
  },
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
