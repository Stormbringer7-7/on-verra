// Carte des départements, sans React : tracés SVG, département sous un point (toucher), classes
// d'une échelle séquentielle. Testé seul (tests/carte.test.ts).

import { DEPARTEMENTS, type ContourDepartement } from './departements';

/** Tracé SVG d'un territoire : un sous-chemin fermé par anneau. */
export function chemin(anneaux: number[][]): string {
  return anneaux
    .map((r) => {
      let d = `M${r[0]} ${r[1]}`;
      for (let i = 2; i < r.length; i += 2) d += `L${r[i]} ${r[i + 1]}`;
      return `${d}Z`;
    })
    .join('');
}

/** Point dans un anneau à plat (règle pair-impair). */
export function dansAnneau(r: number[], x: number, y: number): boolean {
  let dedans = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

interface Boite {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boite = (anneaux: number[][]): Boite => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of anneaux)
    for (let i = 0; i < r.length; i += 2) {
      b.x0 = Math.min(b.x0, r[i]);
      b.x1 = Math.max(b.x1, r[i]);
      b.y0 = Math.min(b.y0, r[i + 1]);
      b.y1 = Math.max(b.y1, r[i + 1]);
    }
  return b;
};

export interface Territoire extends ContourDepartement {
  d: string;
  boite: Boite;
  /** Centre de la boîte (repère, libellé). */
  centre: { x: number; y: number };
}

/** Les territoires prêts à dessiner, calculés une fois. */
export const TERRITOIRES: Territoire[] = DEPARTEMENTS.map((t) => {
  const b = boite(t.anneaux);
  return { ...t, d: chemin(t.anneaux), boite: b, centre: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } };
});

/**
 * Code du territoire sous (x, y), ou null. `marge` (unités du cadre) rattrape un toucher tombé
 * juste à côté d'un petit territoire (Paris, îles) : le plus proche par sa boîte.
 */
export function territoireSous(x: number, y: number, marge = 0): string | null {
  for (const t of TERRITOIRES) {
    const b = t.boite;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    if (t.anneaux.some((r) => dansAnneau(r, x, y))) return t.code;
  }
  if (marge <= 0) return null;
  let meilleur: string | null = null;
  let distance = marge;
  for (const t of TERRITOIRES) {
    const b = t.boite;
    const d = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
    if (d < distance) [meilleur, distance] = [t.code, d];
  }
  return meilleur;
}

export interface Classe {
  min: number;
  max: number;
  couleur: string;
}

/**
 * Échelle séquentielle à `couleurs.length` classes d'égale amplitude entre la plus petite et la
 * plus grande valeur connue ; une seule classe si toutes les valeurs sont égales.
 */
export function classes(valeurs: number[], couleurs: string[]): Classe[] {
  if (valeurs.length === 0) return [];
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  if (min === max) return [{ min, max, couleur: couleurs[couleurs.length - 1] }];
  const pas = (max - min) / couleurs.length;
  return couleurs.map((couleur, i) => ({ min: min + i * pas, max: i === couleurs.length - 1 ? max : min + (i + 1) * pas, couleur }));
}

export const classeDe = (v: number, cl: Classe[]) => cl.find((c) => v <= c.max) ?? cl[cl.length - 1];

/** Mélange linéaire de deux couleurs « #rrggbb » (t de 0 à 1). */
export function melange(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}
