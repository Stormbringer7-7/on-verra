// Un rapprochement avec son statut (canevas, « Intérêts » et représentant d'intérêts) :
//   vérifié      « Vérifié · l’action cite le texte », puis la cible, rendue comme un fait ;
//   à vérifier   encadré pointillé : « À vérifier · même sujet, même période », la mention
//                « Rapprochement possible, non établi », le candidat en retrait, puis l'avertissement.
// La cible d'un lien à vérifier n'est jamais rendue hors de cet encadré.

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Lien } from '@/core';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { Source } from './Source';
import { MENTION_CANDIDAT, presentationLien } from './statuts';

export function LienStatut<T>(props: { lien: Lien<T>; rendu: (cible: T) => ReactNode; libelle?: string }) {
  const { lien, rendu, libelle } = props;
  const p = usePalette();
  const vue = presentationLien(lien, libelle);

  if (vue.statut === 'verifie') {
    return (
      <View style={styles.bloc}>
        <Label ton="ink">{vue.entete}</Label>
        {rendu(vue.fait)}
        {vue.preuve && <Source provenance={vue.preuve} compact />}
      </View>
    );
  }

  return (
    <View
      style={[styles.bloc, styles.aVerifier, { borderColor: p.lineStrong }]}
      accessibilityLabel={`${vue.entete}. ${MENTION_CANDIDAT}. ${vue.avertissement}`}
    >
      <Label>{vue.entete}</Label>
      <T variant="caption" ton="inkMuted">
        {MENTION_CANDIDAT} :
      </T>
      <View style={[styles.candidat, { borderLeftColor: p.lineStrong }]}>{rendu(vue.candidat)}</View>
      <View style={styles.avertissement}>
        <T variant="small" ton="inkMuted" aria-hidden>
          ⚠
        </T>
        <T variant="small" ton="inkMuted" style={styles.avertissementTexte}>
          {vue.avertissement}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[2] },
  aVerifier: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: 10 },
  // Retrait et opacité : le candidat se lit comme une hypothèse, pas comme un fait.
  candidat: { borderLeftWidth: 2, paddingLeft: space[3], opacity: 0.85 },
  avertissement: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  avertissementTexte: { flex: 1 },
});
