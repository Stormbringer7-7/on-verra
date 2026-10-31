// Feuille Événement (planche « Événement », les 8 déviations des modèles de parcours : procédure
// accélérée, 49.3, motion de procédure, irrecevabilité, retrait, retrait de l'ordre du jour,
// caducité, fusion), ouverte depuis le rail du dossier ou l'écran Étape : feuille qui monte du bas
// sur un voile en portrait, panneau latéral en paysage. Icône, où et quand, effet sur le parcours
// (schéma et libellé `EFFET_DEVIATION`) et effet conditionnel : celui du modèle de parcours quand la
// fiche le publie (`effetSi`), sinon une règle générale dite comme telle ; conclusion publiée telle
// quelle, dossier où il a lieu, fondement juridique, dossier rattaché quand l'événement est publié
// comme un dossier (un 49.3) et ses motions, action et source. Aucun lien de cause calculé avec un moment.
// Fusion : aucune déviation « fusion » n'est publiée dans la projection (canon.fusion ne relie que
// deux fiches d'un même dossier), le dossier absorbant n'est donc jamais nommé.

import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CaseParcours, DeviationParcours, DossierLie, DossierRef } from '@/core';
import { date } from '../../format';
import { useLarge } from '../../hooks/miseEnPage';
import { usePalette, useStyles } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, Label, T } from '../base';
import { resumeRattache } from '../dossiers/parcoursVue';
import { actionDeviation, effetSiDe, iconeDeviation } from '../etape/regles';
import { Icone } from '../Icone';
import { Appui, Montee } from '../mouvement';
import { LIEU } from '../dossiers/presentation';
import { Source } from './Source';
import { EFFET_DEVIATION } from './statuts';

type Props = {
  deviation: DeviationParcours | null;
  /** Étape où elle a lieu (libellé), et le dossier rattaché à cette étape s'il y en a un. */
  etape: CaseParcours | null;
  rattache: DossierLie | null;
  /** Dossier où l'événement a lieu (titre rappelé dans la feuille), null ou absent sinon. */
  dossier?: DossierRef | null;
  onFermer(): void;
  onEtape(): void;
  onDossier(id: string): void;
};

export function FeuilleDeviation({ deviation: d, etape, rattache, dossier, onFermer, onEtape, onDossier }: Props) {
  const s = useStyles();
  const p = usePalette();
  const large = useLarge();
  if (!d) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onFermer}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onFermer} style={s.voile} />
      <Montee style={large ? [styles.panneau, { backgroundColor: p.surfaceRaised, borderColor: p.lineFaint }] : [s.feuille, styles.feuille]}>
        <ScrollView contentContainerStyle={styles.contenu} accessibilityViewIsModal>
          {!large && <View style={s.poignee} />}
          <FicheDeviation deviation={d} etape={etape} rattache={rattache} dossier={dossier} onFermer={onFermer} onEtape={onEtape} onDossier={onDossier} />
        </ScrollView>
      </Montee>
    </Modal>
  );
}

/** « Assemblée nationale · Séance AN · 12/02/2026 » : ce qui est publié, la date marquée sinon. */
export function ouDeviation(d: DeviationParcours, etape: CaseParcours | null): string {
  return [etape?.lieu ? LIEU[etape.lieu] : null, etape?.libelle ?? 'Étape non publiée', d.debut ? date(d.debut) : 'date non publiée']
    .filter(Boolean)
    .join(' · ');
}

/** Contenu de la feuille (rendu seul dans les tests : la fenêtre modale n'a pas de rendu statique). */
export function FicheDeviation({ deviation: d, etape, rattache, dossier, onFermer, onEtape, onDossier }: Props & { deviation: DeviationParcours }) {
  const p = usePalette();
  const s = useStyles();
  const effet = effetSiDe(d);
  const si = effet ? `${effet.texte} ${effet.source === 'modele' ? '(défini par le modèle de parcours)' : '(règle générale, pas une donnée du dossier)'}` : null;
  const source = d.provenance.find((x) => x.url) ?? null;
  const motions = rattache ? resumeRattache(rattache) : null;
  const faits: [string, string][] = [
    ...(dossier ? ([['Dossier', dossier.titre]] as [string, string][]) : []),
    ['Fondement', d.fondement || 'Fondement non publié'],
    ...(rattache ? ([['Dossier rattaché', rattache.dossier.titre]] as [string, string][]) : []),
    ...(motions ? ([['Motions', motions]] as [string, string][]) : []),
  ];
  const action = rattache
    ? { libelle: actionDeviation(d, true), onPress: () => onDossier(rattache.dossier.id) }
    : etape
      ? { libelle: actionDeviation(d, false), onPress: onEtape }
      : null;
  return (
    <View style={{ gap: space[4] }} accessibilityLabel={`Événement : ${d.libelle}`}>
      <View style={styles.entete}>
        <View style={[styles.icone, { borderColor: p.signal }]}>
          <Icone nom={iconeDeviation(d.cle, d.effet)} couleur={p.signalHover} taille={22} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T variant="title" style={styles.titre} accessibilityRole="header">
            {d.libelle}
          </T>
          <T variant="small" ton="inkMuted">
            {ouDeviation(d, etape)}
          </T>
        </View>
        <Action onPress={onFermer}>Fermer</Action>
      </View>

      <View style={[styles.effet, { backgroundColor: p.surface }]} accessibilityLabel={`Effet sur le parcours : ${EFFET_DEVIATION[d.effet]}${si ? `. ${si}` : ''}`}>
        <Icone nom={d.effet} couleur={p.signal} taille={56} epaisseur={1} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T variant="heading" style={{ fontSize: 15 }}>
            {EFFET_DEVIATION[d.effet]}
          </T>
          {si && (
            <T variant="caption" ton="inkMuted">
              {si}
            </T>
          )}
        </View>
      </View>

      {d.conclusion ? (
        <T style={{ fontSize: 16, lineHeight: 22 }}>{`« ${d.conclusion} »`}</T>
      ) : (
        <T variant="caption" ton="inkMuted">
          Aucune conclusion publiée.
        </T>
      )}

      <View style={styles.faits}>
        {faits.map(([k, v]) => (
          <View key={k} style={styles.fait}>
            <Label style={styles.cle}>{k}</Label>
            <T variant="small" couleur={p.inkQuote} style={{ flex: 1 }}>
              {v}
            </T>
          </View>
        ))}
      </View>

      <View style={styles.boutons}>
        {action && (
          <Appui accessibilityRole="button" onPress={action.onPress} style={[s.bouton, styles.bouton]}>
            <T style={[s.boutonTexte, { fontSize: 15 }]}>{action.libelle}</T>
          </Appui>
        )}
        {source ? (
          <Appui
            accessibilityRole="link"
            accessibilityLabel="Source, ouvrir la page officielle"
            onPress={() => void Linking.openURL(source.url!).catch(() => {})}
            style={[s.boutonSecondaire, styles.bouton]}
          >
            <T variant="heading" style={{ fontSize: 15 }}>
              Source ↗
            </T>
          </Appui>
        ) : (
          <View style={[s.boutonSecondaire, styles.bouton, { borderStyle: 'dashed' }]}>
            <T variant="heading" ton="inkMuted" style={{ fontSize: 15 }}>
              Source sans adresse
            </T>
          </View>
        )}
      </View>

      {d.provenance.length > 0 && (
        <View style={{ gap: space[1] }}>
          <Label>Actes sources</Label>
          {d.provenance.map((x) => (
            <Source key={`${x.systeme}-${x.idNatif}`} provenance={x} compact />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  feuille: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', paddingTop: space[2], paddingHorizontal: 0, paddingBottom: 0 },
  panneau: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 440, borderLeftWidth: 1 },
  contenu: { gap: space[4], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6] },
  entete: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  icone: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titre: { fontSize: 20, lineHeight: 24 },
  effet: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg },
  faits: { gap: space[2] },
  fait: { flexDirection: 'row', gap: space[3] },
  cle: { minWidth: 120 },
  boutons: { flexDirection: 'row', gap: space[2] },
  bouton: { flex: 1 },
});
