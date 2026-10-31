// Accessibilité et réglages (canevas v4, « Réglages ») : taille du texte, thème de couleurs
// (Themes.ts), contraste renforcé, animations réduites, et vos données (exporter, tout effacer). Tout
// reste sur l'appareil. Pas de « lecture facile » : elle dépend d'une IA qui n'est pas branchée.

import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { useAller } from '../../navigation';
import { Action, BoutonSecondaire, Carte, Segmente, T, TitreEcran, TitreSection } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { RACINES } from '../ariane';
import { Ecran } from '../components/Ecran';
import { Interrupteur } from '../components/fondations';
import { useReglages, type TailleTexte } from '../hooks/reglages';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/Themes';
import { radius, space } from '../theme/tokens';

const TAILLES: { cle: TailleTexte; libelle: string }[] = [
  { cle: 'normale', libelle: 'Normale' },
  { cle: 'grande', libelle: 'Grande' },
  { cle: 'tres_grande', libelle: 'Très grande' },
];


/** « Exporter mes données » : un fichier JSON sur le web, la feuille de partage ailleurs. */
export async function exporterDonnees(json: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `nos-politiques-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: json, title: 'Mes données' });
}

export function Reglages() {
  const { reglages, modifier, toutEffacer, exporter } = useReglages();
  const aller = useAller();
  const p = usePalette();
  const [confirmer, setConfirmer] = useState(false);
  const [efface, setEfface] = useState(false);

  return (
    <Ecran titre="Accessibilité et réglages" largeur="lecture" parents={[RACINES.actualite]}>
      <View style={styles.entete}>
        <TitreEcran>Accessibilité et réglages</TitreEcran>
        <T ton="inkSoft">Enregistrés sur cet appareil uniquement.</T>
      </View>

      <View style={styles.section}>
        <TitreSection>Taille du texte</TitreSection>
        <Segmente label="Taille du texte" options={TAILLES} valeur={reglages.taille} onChange={(taille) => modifier({ taille })} />
        <View style={[styles.apercu, { borderColor: p.line }]}>
          <T variant="label" ton="inkMuted">
            Aperçu
          </T>
          <T>Le texte fixe les objectifs énergétiques de la France pour 2026-2035.</T>
        </View>
      </View>

      <View style={styles.section}>
        <TitreSection>Affichage</TitreSection>
        <ChoixTheme />
        <Interrupteur
          libelle="Contraste renforcé"
          aide="Textes plus blancs, traits plus nets, couleurs plus franches."
          valeur={reglages.contraste}
          onChange={(contraste) => modifier({ contraste })}
        />
        <Interrupteur
          libelle="Réduire les animations"
          aide="Les transitions et les déplacements à l’écran sont désactivés (aussi quand le réglage du système le demande)."
          valeur={reglages.animationsReduites}
          onChange={(animationsReduites) => modifier({ animationsReduites })}
        />
      </View>

      <View style={styles.section}>
        <TitreSection>Vos données</TitreSection>
        <T ton="inkSoft">
          Pas de compte. Vos suivis et vos réglages sont enregistrés sur cet appareil, et nulle part ailleurs. Pour « Mes suivis », l’app envoie les
          identifiants des lois et des élus suivis : notre serveur répond sans les enregistrer.
        </T>
        <View style={styles.actions}>
          <BoutonSecondaire onPress={() => void exporterDonnees(exporter()).catch(() => {})}>Exporter mes données</BoutonSecondaire>
          {!confirmer ? (
            <BoutonSecondaire onPress={() => (setConfirmer(true), setEfface(false))}>Tout effacer</BoutonSecondaire>
          ) : (
            <Carte style={{ borderColor: p.signal, borderWidth: 1 }}>
              <T>Effacer vos suivis et vos réglages de cet appareil ? Impossible à annuler.</T>
              <View style={styles.actions}>
                <BoutonSecondaire onPress={() => void toutEffacer().then(() => (setConfirmer(false), setEfface(true)))}>Oui, tout effacer</BoutonSecondaire>
                <BoutonSecondaire onPress={() => setConfirmer(false)}>Annuler</BoutonSecondaire>
              </View>
            </Carte>
          )}
          {efface && (
            <T ton="inkSoft" accessibilityLiveRegion="polite">
              Tout est effacé de cet appareil.
            </T>
          )}
        </View>
        <Action onPress={() => aller.suivis()}>Gérer mes suivis →</Action>
      </View>

      <Carte>
        <T variant="card" accessibilityRole="header">
          Ce que nous ne savons pas de vous
        </T>
        <T ton="inkSoft">Ni votre nom, ni votre e-mail, ni ce que vous lisez. Aucune mesure d’audience, aucune publicité.</T>
      </Carte>

      <View style={styles.section}>
        <TitreSection>Conçu pour être lu par tous</TitreSection>
        <T ton="inkSoft">Compatible avec les lecteurs d’écran, la navigation au clavier et le zoom du navigateur. Un problème ? Dites-le-nous.</T>
        <Signaler cible={{ type: 'autre', id: null }} ecran="Réglages" />
      </View>
    </Ecran>
  );
}

/** Choix du thème : chaque thème montré dans ses propres couleurs (fond, encre, signal, pour, contre). */
function ChoixTheme() {
  const { theme: actif, themes, choisir } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Thème" style={styles.themes}>
      {themes.map((t) => (
        <ApercuTheme key={t.id} theme={t} choisi={t.id === actif.id} onPress={() => choisir(t.id)} />
      ))}
    </View>
  );
}

function ApercuTheme({ theme, choisi, onPress }: { theme: Theme; choisi: boolean; onPress(): void }) {
  const { reglages } = useReglages();
  const t = reglages.contraste ? theme.contraste : theme.palette;
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisi }}
      accessibilityLabel={`${theme.nom}. ${theme.description}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.theme,
        { backgroundColor: t.surface, borderColor: choisi ? p.signal : p.line, borderWidth: choisi ? 2 : 1 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.themeHaut}>
        <T variant="heading" couleur={t.ink}>
          {theme.nom}
        </T>
        <View aria-hidden style={[styles.radio, { borderColor: choisi ? t.signal : t.lineStrong }]}>
          {choisi && <View style={[styles.radioPlein, { backgroundColor: t.signal }]} />}
        </View>
      </View>
      <T variant="small" couleur={t.inkSoft}>
        {theme.description}
      </T>
      <View aria-hidden style={styles.nuancier}>
        {[t.surfaceRaised, t.ink, t.signal, t.votePour, t.voteContre].map((c, i) => (
          <View key={i} style={[styles.nuance, { backgroundColor: c, borderColor: t.line }]} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  theme: { flexGrow: 1, flexBasis: 150, gap: space[2], padding: space[4], borderRadius: radius.lg },
  themeHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  radio: { width: 20, height: 20, borderRadius: radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioPlein: { width: 10, height: 10, borderRadius: radius.full },
  nuancier: { flexDirection: 'row', gap: space[1] },
  nuance: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 1 },
  entete: { gap: space[2] },
  section: { gap: space[4] },
  apercu: { gap: space[2], padding: space[4], borderWidth: 1, borderRadius: radius.lg },
  actions: { gap: space[3] },
});
