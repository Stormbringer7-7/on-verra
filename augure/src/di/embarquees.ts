// Généré par scripts/embarquer-donnees.mjs (npm run donnees) : ne pas modifier à la main.
/* eslint-disable @typescript-eslint/no-require-imports */
import index from '../../assets/donnees/index.json';

/** Législatures embarquées : manifeste et base compressée (asset Metro, référencé par require). */
export const indexEmbarque: unknown = index;
export const partitionsEmbarquees: Record<string, { manifeste: unknown; asset: number }> = {
  '17': {
    manifeste: require('../../assets/donnees/17/manifest.json'),
    asset: require('../../assets/donnees/17/on_verra.db.gz'),
  },
};
