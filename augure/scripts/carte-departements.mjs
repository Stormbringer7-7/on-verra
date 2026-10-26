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

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2025/geojson/departements-1000m.geojson';
const LICENCE = 'Licence Ouverte 2.0 (Etalab) — contours administratifs dérivés d’ADMIN EXPRESS, IGN';
const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = resolve(ICI, '../src/ui/components/carte/departements.ts');

const LARGEUR = 1000;
const LARGEUR_METROPOLE = 800;
const TOLERANCE = 0.35;
const AIRE_MIN = 0.3;
/** Encarts : archipels (Polynésie, Wallis-et-Futuna) faits d'îles minuscules à leur échelle. */
const AIRE_MIN_ENCART = 0.01;
const ENCARTS = ['971', '972', '973', '974', '976', '975', '977', '978', '986', '987', '988'];
const ECARTES = new Set(['984', '989']);

// ---------- Lambert-93 (GRS80, parallèles 44° et 49°, origine 46°30' N, 3° E) ----------

const rad = (d) => (d * Math.PI) / 180;
const e = Math.sqrt(0.00669438002290);
const a = 6378137;
const [phi1, phi2, phi0, lambda0] = [rad(44), rad(49), rad(46.5), rad(3)];
const mDe = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
const tDe = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
const n = (Math.log(mDe(phi1)) - Math.log(mDe(phi2))) / (Math.log(tDe(phi1)) - Math.log(tDe(phi2)));
const F = mDe(phi1) / (n * tDe(phi1) ** n);
const rho0 = a * F * tDe(phi0) ** n;
function lambert93([lon, lat]) {
  const rho = a * F * tDe(rad(lat)) ** n;
  const theta = n * (rad(lon) - lambda0);
  return [700000 + rho * Math.sin(theta), 6600000 + rho0 - rho * Math.cos(theta)];
}

// ---------- Géométrie ----------

const anneauxDe = (geometrie) => (geometrie.type === 'Polygon' ? geometrie.coordinates : geometrie.coordinates.flat());

function bornes(anneaux) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of anneaux) for (const [x, y] of r) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return { x0, y0, x1, y1 };
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 3) return points;
  const garder = new Uint8Array(points.length);
  garder[0] = garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [i, j] = pile.pop();
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    let [dmax, k] = [0, -1];
    for (let m = i + 1; m < j; m++) {
      const d = Math.abs((bx - ax) * (ay - points[m][1]) - (ax - points[m][0]) * (by - ay)) / l;
      if (d > dmax) [dmax, k] = [d, m];
    }
    if (dmax > tolerance && k > 0) {
      garder[k] = 1;
      pile.push([i, k], [k, j]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

/** Anneau fermé : coupé au point le plus éloigné du départ, chaque moitié simplifiée à part. */
function simplifierAnneau(r, tolerance) {
  let [k, dmax] = [0, -1];
  r.forEach(([x, y], i) => {
    const d = Math.hypot(x - r[0][0], y - r[0][1]);
    if (d > dmax) [k, dmax] = [i, d];
  });
  if (k === 0) return r;
  return [...douglasPeucker(r.slice(0, k + 1), tolerance).slice(0, -1), ...douglasPeucker(r.slice(k), tolerance)];
}

const aire = (r) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0)) / 2;
const arrondi = (v) => Math.round(v * 10) / 10;

function simplifier(anneaux, aireMin = AIRE_MIN) {
  const simples = anneaux.map((r) => simplifierAnneau(r, TOLERANCE)).filter((r) => r.length >= 4);
  const gardes = simples.filter((r) => aire(r) >= aireMin);
  const choisis = gardes.length ? gardes : simples.sort((x, y) => aire(y) - aire(x)).slice(0, 1);
  return choisis.map((r) => r.slice(0, -1).flatMap(([x, y]) => [arrondi(x), arrondi(y)]));
}

/** Ajuste des anneaux projetés (y vers le nord) dans un cadre (y vers le bas), proportions gardées. */
function ajuster(anneaux, cadre) {
  const b = bornes(anneaux);
  const k = Math.min(cadre.largeur / (b.x1 - b.x0), cadre.hauteur / (b.y1 - b.y0));
  const dx = cadre.x + (cadre.largeur - (b.x1 - b.x0) * k) / 2;
  const dy = cadre.y + (cadre.hauteur - (b.y1 - b.y0) * k) / 2;
  return (r) => r.map(([x, y]) => [dx + (x - b.x0) * k, dy + (b.y1 - y) * k]);
}

// ---------- Lecture, mise en page, écriture ----------

const dossier = resolve(process.argv[2] ?? join(tmpdir(), 'augure-contours'));
mkdirSync(dossier, { recursive: true });
const fichier = join(dossier, 'departements-1000m.geojson');
const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}) : ${SOURCE}`);
const octets = Buffer.from(await reponse.arrayBuffer());
writeFileSync(fichier, octets);
const empreinte = createHash('sha256').update(octets).digest('hex');
const geo = JSON.parse(readFileSync(fichier, 'utf8'));

const entites = geo.features
  .map((f) => ({ code: String(f.properties.code), nom: String(f.properties.nom), anneaux: anneauxDe(f.geometry) }))
  .filter((f) => !ECARTES.has(f.code));

// Métropole : Lambert-93, dans un cadre de LARGEUR_METROPOLE de large.
const metropole = entites.filter((f) => !f.code.startsWith('97') && !f.code.startsWith('98'));
const projetes = metropole.map((f) => ({ ...f, anneaux: f.anneaux.map((r) => r.map(lambert93)) }));
const bm = bornes(projetes.flatMap((f) => f.anneaux));
const HAUTEUR = Math.round((LARGEUR_METROPOLE * (bm.y1 - bm.y0)) / (bm.x1 - bm.x0));
const versCadre = ajuster(projetes.flatMap((f) => f.anneaux), { x: 0, y: 0, largeur: LARGEUR_METROPOLE, hauteur: HAUTEUR });

// Encarts : deux colonnes à droite, une case par territoire, libellé sous la case.
const COLONNES = 2;
const LIGNES = Math.ceil(ENCARTS.length / COLONNES);
const marge = 12;
const colonne = (LARGEUR - LARGEUR_METROPOLE - marge * (COLONNES + 1)) / COLONNES;
const ligne = (HAUTEUR - marge * (LIGNES + 1)) / LIGNES;
const encarts = ENCARTS.map((code, i) => {
  const x = LARGEUR_METROPOLE + marge + (i % COLONNES) * (colonne + marge);
  const y = marge + Math.floor(i / COLONNES) * (ligne + marge);
  return { code, x: arrondi(x), y: arrondi(y), largeur: arrondi(colonne), hauteur: arrondi(ligne - 18) };
});

const departements = [
  ...projetes.map((f) => ({ code: f.code, nom: f.nom, encart: false, anneaux: simplifier(f.anneaux.map(versCadre)) })),
  ...encarts.flatMap((c) => {
    const f = entites.find((x) => x.code === c.code);
    if (!f) return [];
    const latc = (bornes(f.anneaux).y0 + bornes(f.anneaux).y1) / 2;
    const locale = f.anneaux.map((r) => r.map(([lon, lat]) => [lon * Math.cos(rad(latc)), lat]));
    const versEncart = ajuster(locale, { x: c.x + 4, y: c.y + 4, largeur: c.largeur - 8, hauteur: c.hauteur - 8 });
    return [{ code: f.code, nom: f.nom, encart: true, anneaux: simplifier(locale.map(versEncart), AIRE_MIN_ENCART) }];
  }),
].sort((x, y) => x.code.localeCompare(y.code, 'fr', { numeric: true }));

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
