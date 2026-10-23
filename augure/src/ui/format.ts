const MOIS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

/** 2026-10-12 → 12/10/2026 */
export function date(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** 2026-10-12 → 12/10/26 */
export function dateCourte(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a.slice(2)}`;
}

/** 2026-10-12 → OCT. 26 */
export function mois(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${MOIS[Number(m) - 1]} ${a.slice(2)}`;
}

/** 0.843 → 84 % */
export function pourcent(x: number | null): string {
  return x === null ? '—' : `${Math.round(x * 100)} %`;
}

/** 17 → 17E */
export function legislature(n: string): string {
  return `${n}E LÉGISLATURE`;
}

export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

export function nomComplet(d: { prenom: string; nom: string }): string {
  return `${d.prenom} ${d.nom}`;
}
