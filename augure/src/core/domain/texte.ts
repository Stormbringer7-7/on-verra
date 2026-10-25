/** Comparaison sans casse ni accents, pour la recherche. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
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
