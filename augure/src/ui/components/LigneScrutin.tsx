// Ligne d'un scrutin public (Accueil, votes d'un dossier) : chambre, ce qui est voté, date et
// résultat publiés (« 15/10 · ADOPTÉ 330 – 190 »). Ouvre la fiche du scrutin.

import { StyleSheet, View } from 'react-native';

import type { ScrutinResume } from '@/core';
import { useAller } from '../../navigation';
import { dateCourte, libelleChambre, resultatScrutin, titreScrutin } from '../format';
import { NATURES } from '../natures';
import { Ligne, PastilleChambre, T } from './base';

export function LigneScrutin({ scrutin, onPress }: { scrutin: ScrutinResume; onPress?: () => void }) {
  const aller = useAller();
  const titre = titreScrutin(scrutin);
  const meta = `${dateCourte(scrutin.date)} · ${NATURES[scrutin.nature].libelle} · ${resultatScrutin(scrutin)}`;
  return (
    <Ligne
      onPress={onPress ?? (() => aller.scrutin(scrutin.id))}
      accessibilityLabel={`${libelleChambre(scrutin.chambre)}, scrutin n° ${scrutin.numero} : ${titre}. ${meta}`}
    >
      <PastilleChambre libelle={libelleChambre(scrutin.chambre)} />
      <View style={styles.texte}>
        <T variant="text" style={styles.titre}>
          {titre}
        </T>
        <T variant="meta" ton="inkMuted">
          {meta}
        </T>
      </View>
    </Ligne>
  );
}

const styles = StyleSheet.create({
  texte: { flex: 1, minWidth: 0, gap: 2 },
  titre: { lineHeight: 20 },
});
