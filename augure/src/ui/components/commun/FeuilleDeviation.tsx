// Fiche d'une déviation (canevas « 12 · Déviations et branches », fiche ouverte depuis le rail) :
// feuille du bas en portrait, panneau latéral en paysage. Libellé, fondement juridique, date,
// étape où elle a lieu, effet sur le parcours en clair, conclusions publiées telles quelles, actes
// sources ; le dossier rattaché quand l'événement est publié comme un dossier (un 49.3).
// Aucun lien de cause calculé avec un moment.

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CaseParcours, DeviationParcours, DossierLie } from '@/core';
import { date } from '../../format';
import { useLarge } from '../../hooks/miseEnPage';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, BoutonSecondaire, IconeDeviation, Label, T } from '../base';
import { Source } from './Source';
import { EFFET_DEVIATION } from './statuts';

type Props = {
  deviation: DeviationParcours | null;
  /** Étape où elle a lieu (libellé), et le dossier rattaché à cette étape s'il y en a un. */
  etape: CaseParcours | null;
  rattache: DossierLie | null;
  onFermer(): void;
  onEtape(): void;
  onDossier(id: string): void;
};

export function FeuilleDeviation({ deviation: d, etape, rattache, onFermer, onEtape, onDossier }: Props) {
  const p = usePalette();
  const large = useLarge();
  if (!d) return null;
  const faits: [string, string][] = [
    ['Date', d.debut ? date(d.debut) : 'Date non publiée'],
    ['Étape', etape?.libelle ?? 'Étape non publiée'],
    ['Effet sur le parcours', EFFET_DEVIATION[d.effet]],
    ['Conclusion publiée', d.conclusion ?? 'Aucune conclusion publiée'],
  ];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFermer}>
      <Pressable accessibilityLabel="Fermer" onPress={onFermer} style={[styles.fond, { backgroundColor: p.surfaceSunken }]} />
      <View
        accessibilityViewIsModal
        style={[large ? styles.panneau : styles.feuille, { backgroundColor: p.surface, borderColor: p.lineFaint }]}
      >
        <ScrollView contentContainerStyle={styles.contenu}>
          <View style={styles.entete}>
            <View style={styles.titre}>
              <IconeDeviation couleur={p.ink} taille={18} />
              <Label>Déviation</Label>
            </View>
            <Action onPress={onFermer}>Fermer</Action>
          </View>
          <T variant="title" accessibilityRole="header">
            {d.libelle}
          </T>
          <T ton="inkSoft">{d.fondement}</T>
          <View style={[styles.faits, { borderColor: p.line }]}>
            {faits.map(([k, v]) => (
              <View key={k} style={styles.fait}>
                <Label>{k}</Label>
                <T variant="small">{v}</T>
              </View>
            ))}
          </View>
          {d.provenance.length > 0 && (
            <View style={{ gap: space[1] }}>
              <Label>Actes sources</Label>
              {d.provenance.map((s) => (
                <Source key={`${s.systeme}-${s.idNatif}`} provenance={s} />
              ))}
            </View>
          )}
          <View style={styles.actions}>
            {etape && <BoutonSecondaire onPress={onEtape}>{`Voir l’étape : ${etape.libelle}`}</BoutonSecondaire>}
            {rattache && (
              <BoutonSecondaire onPress={() => onDossier(rattache.dossier.id)}>{`Dossier rattaché : ${rattache.dossier.titre}`}</BoutonSecondaire>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.7 },
  feuille: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%',
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1,
  },
  panneau: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 440, borderLeftWidth: 1 },
  contenu: { gap: space[4], padding: space[5] },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  titre: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  faits: { gap: space[3], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  fait: { gap: 2 },
  actions: { gap: space[2] },
});
