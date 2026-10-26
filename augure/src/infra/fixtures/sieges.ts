// Fixtures : chaque parlementaire de l'hémicycle (Institutions, Scrutin). Les personnes du canevas
// d'abord, puis des parlementaires fictifs numérotés par groupe (« Député A-12 (fictif) »), assez
// pour remplir les sièges de chaque groupe. Sièges AN : numérotés de la droite (1) vers la gauche
// (577), comme l'Assemblée ; Sénat : sans siège (placement par groupe).

import type { GroupeRef, PersonneRef, Position, Siegeant, VoteNominatif } from '../../core/domain/model';
import { G, P } from './entites';

/** Personnes du canevas, par groupe. */
const CONNUS: Record<string, PersonneRef[]> = {
  [G.A.id]: [P.camille, P.louis],
  [G.B.id]: [P.hugo, P.paulM],
  [G.C.id]: [P.ines, P.karim],
  [G.F.id]: [P.lea],
  [G.S1.id]: [P.pierre],
  [G.S2.id]: [P.paul],
};

/** Les n membres d'un groupe : les personnes connues, puis des membres fictifs. */
export function membresDuGroupe(groupe: GroupeRef, n: number): PersonneRef[] {
  const connus = (CONNUS[groupe.id] ?? []).slice(0, n);
  const titre = groupe.chambre === 'AN' ? 'Député' : 'Sénateur';
  const fictifs = Array.from({ length: n - connus.length }, (_, i): PersonneRef => ({
    id: `${groupe.chambre === 'AN' ? 'depute' : 'senateur'}-${groupe.abrege.toLowerCase()}-${i + 1}`,
    nom: `${titre} ${groupe.abrege}-${i + 1} (fictif)`,
    fonction: `${titre} · ${groupe.libelle}`,
    groupe,
  }));
  return [...connus, ...fictifs];
}

/** Chambre : groupes de la gauche vers la droite ; sièges AN de 577 (gauche) à 1 (droite). */
export function siegeants(groupes: [GroupeRef, number][]): Siegeant[] {
  const total = groupes.reduce((a, [, n]) => a + n, 0);
  let i = 0;
  return groupes.flatMap(([groupe, n]) =>
    membresDuGroupe(groupe, n).map((personne) => ({ personne, siege: groupe.chambre === 'AN' ? total - i++ : null })),
  );
}

/**
 * Votes d'un scrutin : par groupe, les positions imposées (personnes du canevas) puis le reste du
 * décompte, dans l'ordre pour, contre, abstention, non-votant, absent. Sièges : ceux de `sieges`.
 */
export function votesNominatifs(
  lignes: { groupe: GroupeRef; pour: number; contre: number; abstention: number; nonVotants: number; absents: number }[],
  imposees: Record<string, Position>,
  sieges: Map<string, number | null>,
): VoteNominatif[] {
  return lignes.flatMap((l) => {
    const reste: Record<Position, number> = { pour: l.pour, contre: l.contre, abstention: l.abstention, non_votant: l.nonVotants, absent: l.absents };
    const membres = membresDuGroupe(l.groupe, l.pour + l.contre + l.abstention + l.nonVotants + l.absents);
    for (const m of membres) if (imposees[m.id]) reste[imposees[m.id]]--;
    const suivante = (): Position => (['pour', 'contre', 'abstention', 'non_votant', 'absent'] as const).find((p) => reste[p] > 0)!;
    return membres.map((personne) => {
      const position = imposees[personne.id] ?? suivante();
      if (!imposees[personne.id]) reste[position]--;
      return { personne, position, parDelegation: false, miseAuPoint: null, siege: sieges.get(personne.id) ?? null };
    });
  });
}

/** Composition des chambres, de la gauche vers la droite. */
export const COMPOSITION_AN: [GroupeRef, number][] = [[G.A, 152], [G.B, 118], [G.C, 98], [G.D, 71], [G.E, 59], [G.F, 50], [G.NI, 29]];
export const COMPOSITION_SENAT: [GroupeRef, number][] = [[G.S1, 145], [G.S2, 92], [G.S3, 64], [G.S4, 33], [G.NIS, 14]];
export const SIEGEANTS_AN = siegeants(COMPOSITION_AN);
export const SIEGEANTS_SENAT = siegeants(COMPOSITION_SENAT);
