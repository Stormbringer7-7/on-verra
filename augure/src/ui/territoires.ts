// Libellés des écrans Carte et Département, construits depuis les faits du contrat seulement
// (fonctions pures, testées sous Node).

import type { Carte, Chambre, Position, VotesDepartement } from '@/core';
import { nombre, pluriel } from './format';

/** Valeur de chaque département pour `CarteDepartements`, par code. */
export function valeursCarte(carte: Carte): Record<string, number | null> {
  return Object.fromEntries(carte.departements.map((d) => [d.departement.code, d.valeur]));
}

/** « 72,5 % » */
export const formaterPourcentage = (v: number): string => `${nombre(v, 1)} %`;

/** « 3 pour, 2 contre, 1 abstention · 4 absents » (les zéros sont omis, sauf s'il n'y a rien). */
export function texteVotes(v: VotesDepartement): string {
  const exprimes = [
    v.pour ? `${nombre(v.pour)} pour` : null,
    v.contre ? `${nombre(v.contre)} contre` : null,
    v.abstention ? pluriel(v.abstention, 'abstention') : null,
  ].filter(Boolean);
  const autres = [v.nonVotants ? pluriel(v.nonVotants, 'non-votant') : null, v.absents ? pluriel(v.absents, 'absent') : null].filter(Boolean);
  const texte = [exprimes.join(', '), autres.join(', ')].filter(Boolean).join(' · ');
  return texte || 'Aucun vote publié';
}

export const LIBELLES_POSITION: Record<Position, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  non_votant: 'Non-votant',
  absent: 'Absent (pas de vote publié)',
};

export const LIBELLES_CHAMBRE: Record<Chambre, string> = { AN: 'Députés', SENAT: 'Sénateurs' };

/** « 1 élu hors département (Français établis hors de France) », null s'il n'y en a pas. */
export function texteHorsDepartement(n: number, chambre: Chambre): string | null {
  if (!n) return null;
  const qui = chambre === 'AN' ? pluriel(n, 'député') : pluriel(n, 'sénateur');
  return `${qui} des Français établis hors de France, sans département : pas sur la carte.`;
}
