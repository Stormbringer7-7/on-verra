/** Comparaison sans casse ni accents, pour la recherche. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const MOT = /[\p{L}\p{N}]+/gu;

/**
 * Où une expression figure dans un texte, mot pour mot (casse, accents et ponctuation ignorés) :
 * [début, fin] dans le texte d'origine. Sert au surlignage et aux fixtures ; la base cherche aussi
 * les formes accordées (plein texte français), que ceci ne repère pas : rien n'est deviné.
 */
export function occurrences(texte: string, expression: string): [number, number][] {
  const cherches = [...expression.matchAll(MOT)].map((m) => normaliser(m[0]));
  if (!cherches.length) return [];
  const mots = [...texte.matchAll(MOT)].map((m) => ({ mot: normaliser(m[0]), debut: m.index!, fin: m.index! + m[0].length }));
  const trouves: [number, number][] = [];
  for (let i = 0; i + cherches.length <= mots.length; i++)
    if (cherches.every((c, j) => mots[i + j].mot === c)) trouves.push([mots[i].debut, mots[i + cherches.length - 1].fin]);
  return trouves;
}

/** 2026-10-12 → 2025-10-12 */
export function moinsUnAn(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** 2026-10-12 → 2025-11-01 : début des 12 mois calendaires qui finissent avec celui de la date. */
export function debutDouzeMois(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  return d.toISOString().slice(0, 10);
}

/** Nombre de dates (triées) comprises entre deux bornes incluses. */
export function compterEntre(dates: readonly string[], debut: string, fin: string): number {
  const premier = (borne: string, strict: boolean) => {
    let bas = 0;
    let haut = dates.length;
    while (bas < haut) {
      const milieu = (bas + haut) >> 1;
      if (strict ? dates[milieu] <= borne : dates[milieu] < borne) bas = milieu + 1;
      else haut = milieu;
    }
    return bas;
  };
  return Math.max(0, premier(fin, true) - premier(debut, false));
}
