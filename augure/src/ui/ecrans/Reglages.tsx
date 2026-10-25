// Accessibilité et réglages (canevas v4, « Réglages ») : taille du texte, thème, contraste
// renforcé, animations réduites, et vos données (exporter, tout effacer). Tout reste sur l'appareil.
// Pas de « lecture facile » ni de thèmes : la première dépend d'une IA qui n'est pas branchée, les
// seconds d'un classement par thème que les données n'ont pas encore (aucun élément affiché).

import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { useAller } from '../../navigation';
import { Action, BoutonSecondaire, Carte, Segmente, T, TitreEcran, TitreSection } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Ecran } from '../components/Ecran';
import { Interrupteur } from '../components/fondations';
import { useReglages, type TailleTexte, type Theme } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

const TAILLES: { cle: TailleTexte; libelle: string }[] = [
  { cle: 'normale', libelle: 'Normale' },
  { cle: 'grande', libelle: 'Grande' },
  { cle: 'tres_grande', libelle: 'Très grande' },
];

const THEMES: { cle: Theme; libelle: string }[] = [
  { cle: 'sombre', libelle: 'Sombre' },
  { cle: 'clair', libelle: 'Clair' },
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
    <Ecran titre="Accessibilité et réglages" largeur="lecture">
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
        <Segmente label="Thème" options={THEMES} valeur={reglages.theme} onChange={(theme) => modifier({ theme })} />
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

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  section: { gap: space[4] },
  apercu: { gap: space[2], padding: space[4], borderWidth: 1, borderRadius: radius.lg },
  actions: { gap: space[3] },
});
