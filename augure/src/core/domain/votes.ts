import type { Bilan, Decompte, Position, PositionExprimee, VoteDepute } from './model';

export const SEUIL_VOTE_UNI = 0.9;

export function exprimes(d: Decompte): number {
  return d.pour + d.contre + d.abstention;
}

export function estExprimee(p: Position | null): p is PositionExprimee {
  return p === 'pour' || p === 'contre' || p === 'abstention';
}

/** Position la plus fréquente ; null en cas d'égalité ou sans vote (même règle que on-verra). */
export function majoritaire(d: Decompte): PositionExprimee | null {
  const tri = (['pour', 'contre', 'abstention'] as const)
    .map((p) => [p, d[p]] as const)
    .sort((a, b) => b[1] - a[1]);
  if (tri[0][1] === 0 || tri[0][1] === tri[1][1]) return null;
  return tri[0][0];
}

/** Part de la position majoritaire parmi les votes exprimés (0 à 1). */
export function partMajoritaire(d: Decompte): number {
  const total = exprimes(d);
  return total === 0 ? 0 : Math.max(d.pour, d.contre, d.abstention) / total;
}

/** Écart : vote exprimé différent de la ligne de son groupe au moment du vote. */
export function estEcart(position: Position, ligneGroupe: PositionExprimee | null): boolean {
  return estExprimee(position) && ligneGroupe !== null && position !== ligneGroupe;
}

export function bilan(votes: VoteDepute[]): Bilan {
  let ecarts = 0;
  let absences = 0;
  for (const v of votes) {
    if (v.ecart) ecarts++;
    if (v.position === 'absent') absences++;
  }
  // Les non-votes statutaires (présidence de séance, gouvernement) ne sont ni l'un ni l'autre.
  const statutaires = votes.filter((v) => v.position === 'non_votant').length;
  return { total: votes.length, commeGroupe: votes.length - ecarts - absences - statutaires, ecarts, absences };
}

export function verdict(sort: string | null, d: Decompte): 'Adopté' | 'Rejeté' {
  if (sort) return sort.startsWith('adopt') ? 'Adopté' : 'Rejeté';
  return d.pour > d.contre ? 'Adopté' : 'Rejeté';
}
