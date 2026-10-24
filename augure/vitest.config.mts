// Tests de l'app sous Node : le contrat, les bus (API, fixtures), la logique de l'UI, et le rendu
// des composants partagés (react-native-web + react-dom/server, sans dépendance de test en plus).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __DEV__: 'false' },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      // Icônes : rendu natif sans intérêt pour les tests ; une version web minimale.
      { find: /^react-native-svg$/, replacement: fileURLToPath(new URL('./tests/support/svg.tsx', import.meta.url)) },
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./src/$1', import.meta.url)) },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
