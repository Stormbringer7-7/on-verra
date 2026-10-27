#!/usr/bin/env node
// Contours des circonscriptions législatives pour la carte de l'app
// (src/ui/components/carte/circonscriptions.ts).
//
//   node scripts/carte-circonscriptions.mjs [dossier de téléchargement]
//
// Source : INSEE, « Circonscriptions législatives – Fond cartographique » (mai 2022, Licence
// Ouverte), seule source officielle : fond réalisé par l'INSEE à partir des fonds de l'IGN et du
// code électoral, avec le ministère de l'Intérieur et les préfectures. Contours simplifiés : bons
// pour colorer une carte, pas pour situer une adresse à la limite (avertissement de l'INSEE).
// L'IGN ne publie pas de contours de circonscriptions. Shapefile WGS84, lu ici sans dépendance
// (polygones et table attributaire), `unzip` du système pour l'archive.
//
// 558 circonscriptions. Absentes du fond : les 11 des Français établis hors de France, Nouvelle-
// Calédonie, Polynésie (plusieurs circonscriptions, pas de découpage officiel publié : l'app les
// liste à part) et les territoires à circonscription unique, ajoutés ici depuis le contour du
// territoire lui-même (la circonscription, c'est le territoire entier) : Saint-Pierre-et-Miquelon
// (975), Saint-Barthélemy et Saint-Martin (977 + 978, une seule circonscription, code 977),
// Wallis-et-Futuna (986).
//
// Les contours des départements (scripts/carte-departements.mjs) sont téléchargés aussi : la mise en
// page (Lambert-93, encarts d'outre-mer) est calculée sur eux, pour que les deux cartes se
// superposent exactement.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LICENCE_DEPARTEMENTS, SOURCE_DEPARTEMENTS, anneauxDe, miseEnPage, simplifier, telecharger } from './carte-commun.mjs';

const SOURCE = 'https://www.insee.fr/fr/statistiques/fichier/6441661/contours_circonscriptions_legislatives_03052022.zip';
const PAGE = 'https://www.insee.fr/fr/statistiques/6441661';
const NOM = 'circonscriptions_legislatives_030522';
const LICENCE = `Licence Ouverte — INSEE, « Circonscriptions législatives – Fond cartographique » (mai 2022) ; territoires à circonscription unique : ${LICENCE_DEPARTEMENTS}`;
const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = resolve(ICI, '../src/ui/components/carte/circonscriptions.ts');

/** Même tolérance que les départements : les limites communes coïncident ; îlots gardés plus petits. */
const TOLERANCE = 0.35;
const AIRE_MIN = 0.02;
const AIRE_MIN_ENCART = 0.005;
const PAS = 10;

/** Territoires à circonscription unique, absents du fond INSEE : code de circonscription → territoires. */
const UNIQUES = { 975: ['975'], 977: ['977', '978'], 986: ['986'] };

// ---------- Shapefile (polygones) ----------

/** Les polygones d'un .shp : pour chaque enregistrement, ses anneaux [[lon, lat], …]. */
function polygones(shp) {
  const resultat = [];
  for (let o = 100; o < shp.length; ) {
    const longueur = shp.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = shp.readInt32LE(c);
    if (type !== 5) throw new Error(`Forme ${type} inattendue (polygone attendu)`);
    const parties = shp.readInt32LE(c + 36);
    const points = shp.readInt32LE(c + 40);
    const debuts = Array.from({ length: parties }, (_, i) => shp.readInt32LE(c + 44 + 4 * i));
    const p0 = c + 44 + 4 * parties;
    const point = (i) => [shp.readDoubleLE(p0 + 16 * i), shp.readDoubleLE(p0 + 16 * i + 8)];
    resultat.push(debuts.map((d, i) => Array.from({ length: (debuts[i + 1] ?? points) - d }, (_, k) => point(d + k))));
    o = c + longueur;
  }
  return resultat;
}

/** Les lignes d'un .dbf (champs caractères), dans l'ordre des enregistrements. */
function table(dbf) {
  const n = dbf.readUInt32LE(4);
  const entete = dbf.readUInt16LE(8);
  const ligne = dbf.readUInt16LE(10);
  const champs = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) champs.push({ nom: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), longueur: dbf[o + 16] });
  return Array.from({ length: n }, (_, i) => {
    let o = entete + i * ligne + 1;
    const r = {};
    for (const ch of champs) {
      r[ch.nom] = dbf.toString('utf8', o, o + ch.longueur).trim();
      o += ch.longueur;
    }
    return r;
  });
}

// ---------- Construction ----------

const dossier = resolve(process.argv[2] ?? join(tmpdir(), 'augure-contours'));
mkdirSync(dossier, { recursive: true });
const departements = await telecharger(SOURCE_DEPARTEMENTS, dossier, 'departements-1000m.geojson');
const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}) : ${SOURCE}`);
const archive = Buffer.from(await reponse.arrayBuffer());
const sha256 = createHash('sha256').update(archive).digest('hex');
writeFileSync(join(dossier, `${NOM}.zip`), archive);
execFileSync('unzip', ['-o', '-q', join(dossier, `${NOM}.zip`), '-d', dossier]);
const formes = polygones(readFileSync(join(dossier, `${NOM}.shp`)));
const lignes = table(readFileSync(join(dossier, `${NOM}.dbf`)));
if (formes.length !== lignes.length) throw new Error(`${formes.length} formes pour ${lignes.length} lignes`);

const { placer, estEncart } = miseEnPage(departements.geo);
const contour = (departement, numero, anneaux) => {
  const encart = estEncart(departement);
  return {
    code: `${departement}-${String(numero).padStart(2, '0')}`,
    departement,
    numero,
    encart,
    anneaux: simplifier(anneaux, { tolerance: TOLERANCE, aireMin: encart ? AIRE_MIN_ENCART : AIRE_MIN, pas: PAS }),
  };
};

const contours = lignes.map((l, i) => {
  const departement = l.dep;
  const numero = Number(l.id_circo.slice(-2));
  if (!departement || !Number.isInteger(numero) || numero < 1 || !l.id_circo.startsWith(departement.padStart(2, '0'))) {
    throw new Error(`Circonscription illisible : ${JSON.stringify(l)}`);
  }
  return contour(departement, numero, formes[i].map(placer(departement)));
});
const presents = new Set(contours.map((c) => c.departement));
for (const [code, territoires] of Object.entries(UNIQUES)) {
  if (presents.has(code)) throw new Error(`${code} est déjà dans le fond INSEE : retirer de UNIQUES`);
  const anneaux = territoires.flatMap((t) => {
    const f = departements.geo.features.find((x) => String(x.properties.code) === t);
    if (!f) throw new Error(`Territoire ${t} absent des contours des départements`);
    return anneauxDe(f.geometry).map(placer(t));
  });
  contours.push(contour(code, 1, anneaux));
}
contours.sort((x, y) => x.departement.localeCompare(y.departement, 'fr', { numeric: true }) || x.numero - y.numero);

const jour = new Date().toISOString().slice(0, 10);
const contenu = `// Généré par scripts/carte-circonscriptions.mjs : ne pas modifier à la main.
// Source : ${SOURCE}
// ${LICENCE}
// Téléchargé le ${jour}, sha256 ${sha256}.
// Même cadre que departements.ts (Lambert-93, outre-mer en encarts) : les deux cartes se superposent.
// Code « 33-02 » : département du COG, tiret, numéro sur deux chiffres. Anneaux à plat [x0, y0, …].

export interface ContourCirconscription {
  code: string;
  departement: string;
  numero: number;
  /** Dans un encart (outre-mer), à l'échelle de son territoire. */
  encart: boolean;
  anneaux: number[][];
}

export const SOURCE_CIRCONSCRIPTIONS = {
  url: ${JSON.stringify(SOURCE)},
  page: ${JSON.stringify(PAGE)},
  licence: ${JSON.stringify(LICENCE)},
  telechargeLe: ${JSON.stringify(jour)},
  sha256: ${JSON.stringify(sha256)},
} as const;

export const CIRCONSCRIPTIONS: ContourCirconscription[] = [
${contours.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
];
`;
writeFileSync(SORTIE, contenu);
console.log(`${contours.length} circonscriptions, ${(Buffer.byteLength(contenu) / 1024).toFixed(0)} Ko → ${SORTIE}`);
