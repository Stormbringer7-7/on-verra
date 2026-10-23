// Copie des législatures publiées par on-verra dans l'app (assets/donnees) pour les embarquer :
// l'app fonctionne alors sans rien héberger. Génère src/di/embarquees.ts (requires statiques pour Metro).
//
//   npm run donnees                                   # 17e, depuis ../../on-verra/publication
//   npm run donnees -- --legislatures 16,17
//   npm run donnees -- --source /autre/publication

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ici = fileURLToPath(new URL('.', import.meta.url));
const { values } = parseArgs({
  options: {
    source: { type: 'string', default: join(ici, '../../on-verra/publication') },
    legislatures: { type: 'string', default: '17' },
  },
});
const source = resolve(values.source);
const voulues = values.legislatures.split(',').map((l) => l.trim());
const cible = join(ici, '../assets/donnees');

const cheminIndex = join(source, 'index.json');
if (!existsSync(cheminIndex)) {
  console.error(`Pas d'index.json dans ${source}.\nDans on-verra/ : python3 -m on_verra importer && python3 -m on_verra publier`);
  process.exit(1);
}
const index = JSON.parse(readFileSync(cheminIndex, 'utf8'));
const partitions = index.legislatures.filter((p) => voulues.includes(p.legislature));
const absentes = voulues.filter((l) => !partitions.some((p) => p.legislature === l));
if (absentes.length) {
  console.error(`Législature(s) non publiée(s) : ${absentes.join(', ')}`);
  process.exit(1);
}

rmSync(cible, { recursive: true, force: true });
for (const p of partitions) {
  const dossier = dirname(join(source, p.manifeste));
  const manifeste = JSON.parse(readFileSync(join(source, p.manifeste), 'utf8'));
  const base = join(dossier, manifeste.base.fichier);
  if (createHash('sha256').update(readFileSync(base)).digest('hex') !== manifeste.base.sha256) {
    console.error(`${base} ne correspond pas à son manifeste (SHA-256).`);
    process.exit(1);
  }
  mkdirSync(join(cible, p.legislature), { recursive: true });
  copyFileSync(base, join(cible, p.legislature, 'on_verra.db.gz'));
  // Les correctifs ne sont pas embarqués : seule la base complète l'est.
  writeFileSync(join(cible, p.legislature, 'manifest.json'), JSON.stringify({ ...manifeste, correctifs: [] }, null, 1) + '\n');
  console.log(`${p.legislature}e législature v${manifeste.version} : ${(manifeste.base.taille / 1e6).toFixed(1)} Mo`);
}
writeFileSync(join(cible, 'index.json'), JSON.stringify({ ...index, legislatures: partitions }, null, 1) + '\n');

const module = `// Généré par scripts/embarquer-donnees.mjs (npm run donnees) : ne pas modifier à la main.
/* eslint-disable @typescript-eslint/no-require-imports */
import index from '../../assets/donnees/index.json';

/** Législatures embarquées : manifeste et base compressée (asset Metro, référencé par require). */
export const indexEmbarque: unknown = index;
export const partitionsEmbarquees: Record<string, { manifeste: unknown; asset: number }> = {
${partitions
  .map((p) => `  '${p.legislature}': {
    manifeste: require('../../assets/donnees/${p.legislature}/manifest.json'),
    asset: require('../../assets/donnees/${p.legislature}/on_verra.db.gz'),
  },`)
  .join('\n')}
};
`;
writeFileSync(join(ici, '../src/di/embarquees.ts'), module);
console.log(`Embarqué dans ${cible} ; src/di/embarquees.ts généré.`);
