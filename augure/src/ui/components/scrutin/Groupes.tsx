// « Par groupe » (planche « Scrutin ») : une case par groupe, de la gauche vers la droite : sa
// couleur, son sigle, sa position (la ligne majoritaire recalculée par le contrat), la barre pour /
// contre / abstention / non-votants qui pousse sur le fond des absents, et « n votants sur m ».
// Toucher une case filtre la liste nominative sur ce groupe.

import { StyleSheet, View } from 'react-native';

import type { PositionDeGroupe } from '@/core';
import { useLarge } from '../../hooks/miseEnPage';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Pastille, T } from '../base';
import { Appui, Apparition, BarreQuiPousse } from '../mouvement';

const LIGNE = { pour: '+ pour', contre: '− contre', abstention: 'Ø abst.' } as const;

/** Ce que dit la case : ligne du groupe, ou pourquoi il n'en a pas. */
export function positionDuGroupe(g: PositionDeGroupe): { texte: string; couleur: 'ligne' | 'neutre' } {
  const votants = g.decompte.pour + g.decompte.contre + g.decompte.abstention + g.nonVotants;
  if (votants === 0) return { texte: 'n’a pas voté', couleur: 'neutre' };
  if (!g.ligne) return { texte: 'sans majorité', couleur: 'neutre' };
  return { texte: LIGNE[g.ligne], couleur: 'ligne' };
}

export function GrilleGroupes({ groupes, choisirGroupe }: { groupes: PositionDeGroupe[]; choisirGroupe?(id: string): void }) {
  const p = usePalette();
  const large = useLarge();
  const tries = [...groupes].sort((a, b) => a.rang - b.rang);
  return (
    <View style={styles.grille}>
      {tries.map((g, i) => {
        const d = g.decompte;
        const votants = d.pour + d.contre + d.abstention + g.nonVotants;
        const base = Math.max(g.membres, votants, 1);
        const pos = positionDuGroupe(g);
        return (
          <Apparition key={g.groupe.id} rang={Math.min(i, 8)} style={[styles.case, { flexBasis: large ? '23%' : '46%' }]}>
            <Appui
              accessibilityRole={choisirGroupe ? 'button' : undefined}
              accessibilityLabel={`${g.groupe.libelle} : ${pos.texte}, ${d.pour} pour, ${d.contre} contre, ${d.abstention} abstentions, ${votants} votants sur ${g.membres}`}
              onPress={choisirGroupe ? () => choisirGroupe(g.groupe.id) : undefined}
              style={[styles.carte, { backgroundColor: p.surfaceRaised }]}
            >
              <View style={styles.tete}>
                <Pastille couleur={g.groupe.couleur} taille={8} />
                <T variant="label" numberOfLines={1} style={styles.sigle}>
                  {g.groupe.abrege}
                </T>
                <T variant="data" couleur={pos.couleur === 'ligne' && g.ligne ? couleurVote(p, g.ligne) : p.inkMuted}>
                  {pos.texte}
                </T>
              </View>
              <View style={[styles.barre, { backgroundColor: p.surfaceSunken }]} aria-hidden>
                <BarreQuiPousse fraction={d.pour / base} couleur={p.votePour} />
                <BarreQuiPousse fraction={d.contre / base} couleur={p.voteContre} />
                <BarreQuiPousse fraction={d.abstention / base} couleur={p.voteAbstention} />
                <BarreQuiPousse fraction={g.nonVotants / base} couleur={p.lineStrong} />
              </View>
              <T variant="data" ton="inkMuted">{`${votants} votants sur ${g.membres}`}</T>
            </Appui>
          </Apparition>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  case: { flexGrow: 1 },
  carte: { gap: 6, padding: 10, borderRadius: radius.md, minHeight: 44 },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sigle: { flex: 1 },
  barre: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
});
