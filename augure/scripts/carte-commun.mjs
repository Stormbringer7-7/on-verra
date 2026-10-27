// Géométrie partagée des cartes de l'app (scripts/carte-departements.mjs, carte-circonscriptions.mjs) :
// projection Lambert-93, simplification, et la mise en page commune (métropole + encarts d'outre-mer)
// calculée sur les contours des départements, pour que toutes les cartes se superposent exactement.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE_DEPARTEMENTS = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2025/geojson/departements-1000m.geojson';
export const LICENCE_DEPARTEMENTS = 'Licence Ouverte 2.0 (Etalab) — contours administratifs dérivés d’ADMIN EXPRESS, IGN';

export const LARGEUR = 1000;
const LARGEUR_METROPOLE = 800;
export const ENCARTS = ['971', '972', '973', '974', '976', '975', '977', '978', '986', '987', '988'];
export const ECARTES = new Set(['984', '989']);

// ---------- Lambert-93 (GRS80, parallèles 44° et 49°, origine 46°30' N, 3° E) ----------

export const rad = (d) => (d * Math.PI) / 180;
const e = Math.sqrt(0.00669438002290);
const a = 6378137;
const [phi1, phi2, phi0, lambda0] = [rad(44), rad(49), rad(46.5), rad(3)];
const mDe = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
const tDe = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
const n = (Math.log(mDe(phi1)) - Math.log(mDe(phi2))) / (Math.log(tDe(phi1)) - Math.log(tDe(phi2)));
const F = mDe(phi1) / (n * tDe(phi1) ** n);
const rho0 = a * F * tDe(phi0) ** n;
export function lambert93([lon, lat]) {
  const rho = a * F * tDe(rad(lat)) ** n;
  const theta = n * (rad(lon) - lambda0);
  return [700000 + rho * Math.sin(theta), 6600000 + rho0 - rho * Math.cos(theta)];
}

// ---------- Géométrie ----------

export const anneauxDe = (geometrie) => (geometrie.type === 'Polygon' ? geometrie.coordinates : geometrie.coordinates.flat());

export function bornes(anneaux) {
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
export const arrondi = (v, pas = 10) => Math.round(v * pas) / pas;

/**
 * Simplifie (Douglas-Peucker) ; les îlots de moins de `aireMin` disparaissent, jamais le dernier
 * anneau d'un territoire. Coordonnées arrondies au pas donné (10 : un dixième d'unité).
 */
export function simplifier(anneaux, { tolerance, aireMin, pas = 10 }) {
  const simples = anneaux.map((r) => simplifierAnneau(r, tolerance)).filter((r) => r.length >= 4);
  const gardes = simples.filter((r) => aire(r) >= aireMin);
  const choisis = gardes.length ? gardes : simples.sort((x, y) => aire(y) - aire(x)).slice(0, 1);
  return choisis.map((r) => r.slice(0, -1).flatMap(([x, y]) => [arrondi(x, pas), arrondi(y, pas)]));
}

/** Ajuste des anneaux projetés (y vers le nord) dans un cadre (y vers le bas), proportions gardées. */
export function ajuster(anneaux, cadre) {
  const b = bornes(anneaux);
  const k = Math.min(cadre.largeur / (b.x1 - b.x0), cadre.hauteur / (b.y1 - b.y0));
  const dx = cadre.x + (cadre.largeur - (b.x1 - b.x0) * k) / 2;
  const dy = cadre.y + (cadre.hauteur - (b.y1 - b.y0) * k) / 2;
  return (r) => r.map(([x, y]) => [dx + (x - b.x0) * k, dy + (b.y1 - y) * k]);
}

// ---------- Sources ----------

/** Télécharge une source dans `dossier` (fichier lu comme une donnée) ; rend son JSON et son empreinte. */
export async function telecharger(url, dossier, nom) {
  mkdirSync(dossier, { recursive: true });
  const fichier = join(dossier, nom);
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Téléchargement impossible (${reponse.status}) : ${url}`);
  const octets = Buffer.from(await reponse.arrayBuffer());
  writeFileSync(fichier, octets);
  return { geo: JSON.parse(readFileSync(fichier, 'utf8')), sha256: createHash('sha256').update(octets).digest('hex') };
}

// ---------- Mise en page commune ----------

/**
 * La mise en page des cartes, calculée sur les contours des départements : la métropole en
 * Lambert-93 dans un cadre de LARGEUR_METROPOLE, et une case par territoire d'outre-mer (deux
 * colonnes à droite, libellé sous la case), chacun à sa propre échelle (projection
 * équirectangulaire locale). Rend la hauteur du cadre, les encarts et, pour un code de département,
 * la fonction qui place un anneau [lon, lat] dans le cadre.
 */
export function miseEnPage(departementsGeo) {
  const entites = departementsGeo.features
    .map((f) => ({ code: String(f.properties.code), nom: String(f.properties.nom), anneaux: anneauxDe(f.geometry) }))
    .filter((f) => !ECARTES.has(f.code));
  const metropole = entites.filter((f) => !f.code.startsWith('97') && !f.code.startsWith('98'));
  const projetes = metropole.flatMap((f) => f.anneaux.map((r) => r.map(lambert93)));
  const bm = bornes(projetes);
  const hauteur = Math.round((LARGEUR_METROPOLE * (bm.y1 - bm.y0)) / (bm.x1 - bm.x0));
  const versCadre = ajuster(projetes, { x: 0, y: 0, largeur: LARGEUR_METROPOLE, hauteur });

  const colonnes = 2;
  const lignes = Math.ceil(ENCARTS.length / colonnes);
  const marge = 12;
  const colonne = (LARGEUR - LARGEUR_METROPOLE - marge * (colonnes + 1)) / colonnes;
  const ligne = (hauteur - marge * (lignes + 1)) / lignes;
  const encarts = ENCARTS.map((code, i) => {
    const x = LARGEUR_METROPOLE + marge + (i % colonnes) * (colonne + marge);
    const y = marge + Math.floor(i / colonnes) * (ligne + marge);
    return { code, x: arrondi(x), y: arrondi(y), largeur: arrondi(colonne), hauteur: arrondi(ligne - 18) };
  });

  // Encart : ajusté sur le contour du territoire entier (latitude moyenne pour l'échelle locale).
  const placeurs = new Map();
  for (const c of encarts) {
    const f = entites.find((x) => x.code === c.code);
    if (!f) continue;
    const latc = (bornes(f.anneaux).y0 + bornes(f.anneaux).y1) / 2;
    const locale = (r) => r.map(([lon, lat]) => [lon * Math.cos(rad(latc)), lat]);
    const versEncart = ajuster(f.anneaux.map(locale), { x: c.x + 4, y: c.y + 4, largeur: c.largeur - 8, hauteur: c.hauteur - 8 });
    placeurs.set(c.code, (r) => versEncart(locale(r)));
  }
  const placer = (code) => placeurs.get(code) ?? ((r) => versCadre(r.map(lambert93)));
  return { entites, hauteur, encarts, placer, estEncart: (code) => placeurs.has(code) };
}
