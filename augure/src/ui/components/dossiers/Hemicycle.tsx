// Hémicycle d'un scrutin : un point par parlementaire en mandat, coloré par sa position (pour,
// contre, abstention, non-votant, absent), de la gauche vers la droite (groupe `rang`, puis siège
// publié), zoomable et cliquable (HemicycleZoom). Un siège touché montre la personne et mène à sa
// fiche. Sans votes nominatifs (décomptes seuls), un siège met son groupe en avant. La place d'un
// point suit l'ordre des sièges publiés, pas le plan exact de la salle.

import { memo, useMemo } from 'react';

import type { Position, PositionDeGroupe, VoteNominatif } from '@/core';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { HemicycleZoom, type SiegeHemicycle } from '../hemicycle/HemicycleZoom';
import { partLigne, POSITION, siegesScrutin } from './presentation';

/** Ce que dit le siège d'un vote : position, délégation, mise au point publiée. */
export function detailVote(v: VoteNominatif): string {
  return [POSITION[v.position], v.parDelegation ? 'par délégation' : null, v.miseAuPoint].filter(Boolean).join(' · ');
}

export const Hemicycle = memo(function Hemicycle({
  groupes,
  votes = [],
  onPersonne,
  largeurMax = 560,
}: {
  groupes: PositionDeGroupe[];
  votes?: VoteNominatif[];
  onPersonne?: (id: string) => void;
  largeurMax?: number;
}) {
  const p = usePalette();
  const { sieges, positions } = useMemo(() => {
    const couleur = (pos: Position) => (pos === 'absent' ? p.line : pos === 'non_votant' ? p.lineStrong : couleurVote(p, pos));
    if (votes.length)
      return {
        positions: votes.map((v) => v.position),
        sieges: votes.map(
          (v): SiegeHemicycle => ({
            couleur: couleur(v.position),
            groupe: v.personne.groupe,
            personne: { id: v.personne.id, nom: v.personne.nom },
            detail: detailVote(v),
          }),
        ),
      };
    const parGroupe = siegesScrutin(groupes);
    return {
      positions: parGroupe.map((s) => s.position),
      sieges: parGroupe.map((s): SiegeHemicycle => ({ couleur: couleur(s.position), groupe: s.groupe, detail: POSITION[s.position] })),
    };
  }, [groupes, votes, p]);

  const total = (pos: Position) => positions.filter((x) => x === pos).length;
  const libelle = `Hémicycle : ${total('pour')} pour, ${total('contre')} contre, ${total('abstention')} abstentions, ${total('non_votant')} non-votants, ${total('absent')} absents`;
  const parId = useMemo(() => new Map(groupes.map((g) => [g.groupe.id, g])), [groupes]);
  const infoGroupe = (id: string) => {
    const g = parId.get(id);
    if (!g) return '';
    const part = partLigne(g);
    const ligne = g.ligne ? `${POSITION[g.ligne]} à ${part} %` : 'pas de ligne majoritaire';
    return `${ligne} · + ${g.decompte.pour} · − ${g.decompte.contre} · Ø ${g.decompte.abstention}${g.nonVotants ? ` · ${g.nonVotants} non-votants` : ''} · ${g.absents} absents sur ${g.membres} membres`;
  };

  return <HemicycleZoom sieges={sieges} largeurMax={largeurMax} libelle={libelle} infoGroupe={(g) => infoGroupe(g.id)} onPersonne={onPersonne} />;
});
