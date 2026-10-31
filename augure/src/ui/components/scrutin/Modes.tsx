// Modes de couleur d'un scrutin (planche « Scrutin ») : les mêmes pour l'hémicycle et la carte des
// circonscriptions.
//   - Pour et contre : la position de chacun (couleurs de vote du thème) ;
//   - Représentation : la couleur de son groupe, qu'il ait voté ou non ;
//   - Participation : la couleur de son groupe s'il a pris part au vote, le neutre « absent » sinon.
// Couleurs de groupe : celles des données (officielles, ou leur repli publié), jamais une couleur propre.

import { StyleSheet, View } from 'react-native';

import type { GroupeRef, Position } from '@/core';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/tokens';
import { radius, space } from '../../theme/tokens';
import { Puce, T } from '../base';

export type ModeCouleur = 'pour_contre' | 'representation' | 'participation';

export const MODES: { cle: ModeCouleur; libelle: string }[] = [
  { cle: 'participation', libelle: 'Participation' },
  { cle: 'representation', libelle: 'Représentation' },
  { cle: 'pour_contre', libelle: 'Pour et contre' },
];

/** Couleur d'un siège (ou d'une circonscription) selon le mode. `position` null : siège vacant. */
export function couleurSelonMode(p: Palette, mode: ModeCouleur, groupe: GroupeRef | null, position: Position | null): string {
  if (position === null) return p.surfaceSunken;
  if (mode === 'pour_contre') return position === 'absent' ? p.line : position === 'non_votant' ? p.lineStrong : couleurVote(p, position);
  if (mode === 'participation' && position === 'absent') return p.line;
  return groupe?.couleur ?? p.lineStrong;
}

/** Choix du mode : puces cernées (planche : « Participation / Représentation / Pour et contre »). */
export function ChoixMode({ mode, choisir }: { mode: ModeCouleur; choisir(m: ModeCouleur): void }) {
  return (
    <View style={styles.choix} accessibilityRole="radiogroup" accessibilityLabel="Mode de couleur">
      {MODES.map((m) => (
        <Puce key={m.cle} actif={m.cle === mode} variante="contour" onPress={() => choisir(m.cle)}>
          {m.libelle}
        </Puce>
      ))}
    </View>
  );
}

const POSITIONS_LEGENDE: Position[] = ['pour', 'contre', 'abstention', 'non_votant', 'absent'];
const LIBELLE: Record<Position, string> = { pour: 'Pour', contre: 'Contre', abstention: 'Abstention', non_votant: 'Non-votant', absent: 'Absent' };

/** Légende du mode : positions, ou groupes (de la gauche vers la droite) et « Absent ». */
export function LegendeMode({ mode, groupes, comptes }: { mode: ModeCouleur; groupes: GroupeRef[]; comptes?: Partial<Record<Position, number>> }) {
  const p = usePalette();
  const items =
    mode === 'pour_contre'
      ? POSITIONS_LEGENDE.filter((x) => !comptes || comptes[x]).map((x) => ({
          cle: x,
          libelle: `${LIBELLE[x]}${comptes?.[x] !== undefined ? ` ${comptes[x]}` : ''}`,
          couleur: couleurSelonMode(p, mode, null, x),
          neutre: x === 'absent',
        }))
      : [
          ...groupes.map((g) => ({ cle: g.id, libelle: g.abrege, couleur: g.couleur, neutre: false })),
          ...(mode === 'participation' ? [{ cle: 'absent', libelle: 'Absent', couleur: p.line, neutre: true }] : []),
        ];
  return (
    <View style={styles.legende} accessibilityLabel={`Légende : ${items.map((i) => i.libelle).join(', ')}`}>
      {items.map((i) => (
        <View key={i.cle} style={styles.item}>
          <View style={[styles.pastille, { backgroundColor: i.couleur }, i.neutre && { borderWidth: 1, borderColor: p.lineStrong }]} />
          <T variant="small" ton="inkSoft">
            {i.libelle}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  legende: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[1] },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pastille: { width: 9, height: 9, borderRadius: radius.full },
});
