// Hémicycle d'un scrutin : un point par parlementaire en mandat, coloré par sa position (pour,
// contre, abstention, non-votant, absent), groupes de la gauche vers la droite (`rang`).
// Géométrie de `disposition.ts` (11 rangs, la même que l'ancien `HemicycleZoom`). Le contrat ne
// donne que les décomptes par groupe : la place d'un point n'est pas le siège réel d'une personne.

import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { Position, PositionDeGroupe } from '@/core';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { disposerSieges, RAPPORT, tracesParCouleur } from '../disposition';
import { siegesScrutin } from './presentation';

export const Hemicycle = memo(function Hemicycle({ groupes, largeurMax = 560 }: { groupes: PositionDeGroupe[]; largeurMax?: number }) {
  const p = usePalette();
  const [largeur, setLargeur] = useState(0);
  const sieges = useMemo(() => siegesScrutin(groupes), [groupes]);
  const base = Math.min(largeur, largeurMax);
  const { sieges: points, rayonPoint } = useMemo(() => disposerSieges(sieges.length, Math.max(1, base)), [sieges.length, base]);

  const total = (pos: Position) => sieges.filter((s) => s.position === pos).length;
  const libelle = `Hémicycle : ${total('pour')} pour, ${total('contre')} contre, ${total('abstention')} abstentions, ${total('non_votant')} non-votants, ${total('absent')} absents`;
  const traces = useMemo(() => {
    const couleur = (pos: Position) => (pos === 'absent' ? p.line : pos === 'non_votant' ? p.lineStrong : couleurVote(p, pos));
    return tracesParCouleur(points, sieges.map((s) => couleur(s.position)), rayonPoint);
  }, [p, points, sieges, rayonPoint]);

  return (
    <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
      {base > 0 && (
        <Svg width={base} height={base * RAPPORT} role="img" aria-label={libelle} accessibilityLabel={libelle}>
          {traces.map((t) => (
            <Path key={t.couleur} d={t.d} fill={t.couleur} />
          ))}
        </Svg>
      )}
    </View>
  );
});
