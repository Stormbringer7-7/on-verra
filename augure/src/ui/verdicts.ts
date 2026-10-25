// Lecture d'une série de votes sur un thème : un constat, jamais un jugement (design system Panoptique).

import type { Decompte } from '@/core';
import type { Palette } from './theme/tokens';

export type Verdict = 'PLUTÔT POUR' | 'PLUTÔT CONTRE' | 'PARTAGÉ' | 'PEU PRÉSENT';

/** Plutôt pour / contre : au moins 60 % des votes exprimés ; peu présent : absent plus d'une fois sur deux. */
export function verdictTheme(d: Decompte, absences = 0): Verdict {
  const exprimes = d.pour + d.contre + d.abstention;
  if (!exprimes || absences > (exprimes + absences) / 2) return 'PEU PRÉSENT';
  if (d.pour / exprimes >= 0.6) return 'PLUTÔT POUR';
  if (d.contre / exprimes >= 0.6) return 'PLUTÔT CONTRE';
  return 'PARTAGÉ';
}

export function couleurVerdict(p: Palette, v: Verdict): string {
  return v === 'PLUTÔT POUR' ? p.votePour : v === 'PLUTÔT CONTRE' ? p.voteContre : v === 'PEU PRÉSENT' ? p.inkMuted : p.ink;
}
