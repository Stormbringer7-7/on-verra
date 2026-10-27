#!/usr/bin/env node
// Contours des départements pour la carte de l'app (src/ui/components/carte/departements.ts).
//
//   node scripts/carte-departements.mjs [dossier de téléchargement]
//
// Source : contours administratifs d'Etalab, dérivés d'ADMIN EXPRESS (IGN), généralisés à 1 000 m,
// Licence Ouverte 2.0. Le fichier est téléchargé dans un dossier à part (par défaut un dossier
// temporaire), lu comme une donnée, puis :
//   - la métropole est projetée en Lambert-93 (EPSG:2154, la projection officielle) ;
//   - l'outre-mer représenté au Parlement est placé en encarts, chacun à sa propre échelle
//     (projection équirectangulaire locale) : 971 à 976, 975, 977, 978, 986, 987, 988 ;
//     984 (TAAF) et 989 (Clipperton), sans élu, sont écartés ;
//   - chaque anneau est simplifié (Douglas-Peucker, tolérance 0,35 unité sur un cadre de 1 000) ;
//     les îlots de moins de 0,3 unité² (0,01 dans un encart) disparaissent, jamais le dernier
//     anneau d'un territoire.
// L'asset garde l'URL, la date, l'empreinte sha256 du fichier source et la licence.

import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

import { LARGEUR, LICENCE_DEPARTEMENTS as LICENCE, SOURCE_DEPARTEMENTS as SOURCE, miseEnPage, simplifier, telecharger } from './carte-commun.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = resolve(ICI, '../src/ui/components/carte/departements.ts');

const TOLERANCE = 0.35;
const AIRE_MIN = 0.3;
/** Encarts : archipels (Polynésie, Wallis-et-Futuna) faits d'îles minuscules à leur échelle. */
const AIRE_MIN_ENCART = 0.01;

// ---------- Lecture, mise en page, écriture ----------

const dossier = resolve(process.argv[2] ?? join(tmpdir(), 'augure-contours'));
const { geo, sha256: empreinte } = await telecharger(SOURCE, dossier, 'departements-1000m.geojson');
const { entites, hauteur: HAUTEUR, encarts, placer, estEncart } = miseEnPage(geo);

const departements = entites
  .filter((f) => !(f.code.startsWith('97') || f.code.startsWith('98')) || estEncart(f.code))
  .map((f) => {
    const encart = estEncart(f.code);
    return {
      code: f.code,
      nom: f.nom,
      encart,
      anneaux: simplifier(f.anneaux.map(placer(f.code)), { tolerance: TOLERANCE, aireMin: encart ? AIRE_MIN_ENCART : AIRE_MIN }),
    };
  })
  .sort((x, y) => x.code.localeCompare(y.code, 'fr', { numeric: true }));

const contenu = `// Généré par scripts/carte-departements.mjs : ne pas modifier à la main.
// Source : ${SOURCE}
// ${LICENCE}
// Téléchargé le ${new Date().toISOString().slice(0, 10)}, sha256 ${empreinte}.
// Métropole en Lambert-93 ; outre-mer en encarts, chacun à sa propre échelle. Coordonnées du cadre
// (y vers le bas), anneaux à plat [x0, y0, x1, y1, …].

export interface ContourDepartement {
  code: string;
  nom: string;
  /** Dans un encart (outre-mer), à sa propre échelle. */
  encart: boolean;
  anneaux: number[][];
}

export const SOURCE_CONTOURS = {
  url: ${JSON.stringify(SOURCE)},
  licence: ${JSON.stringify(LICENCE)},
  telechargeLe: ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  sha256: ${JSON.stringify(empreinte)},
} as const;

export const CADRE_CARTE = { largeur: ${LARGEUR}, hauteur: ${HAUTEUR} } as const;

export const ENCARTS: { code: string; x: number; y: number; largeur: number; hauteur: number }[] = ${JSON.stringify(encarts)};

export const DEPARTEMENTS: ContourDepartement[] = [
${departements.map((d) => `  ${JSON.stringify(d)},`).join('\n')}
];
`;
writeFileSync(SORTIE, contenu);
console.log(`${departements.length} territoires, ${(Buffer.byteLength(contenu) / 1024).toFixed(0)} Ko → ${SORTIE}`);
