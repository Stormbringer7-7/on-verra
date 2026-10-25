// Onglet Guide (canevas v4, « Guide ») : comment se servir de l'app et comment elle fonctionne.
// Texte du canevas adapté à nos règles d'aujourd'hui : aucune IA n'est branchée, aucun compte, les
// mêmes règles pour tous les élus, chaque fait avec sa source. Méthode et sources du pied de page.

import { StyleSheet, View } from 'react-native';

import { useAller } from '../../navigation';
import { Action, Carte, T, TitreEcran, TitreSection } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Ecran } from '../components/Ecran';
import { useLarge } from '../hooks/miseEnPage';
import { space } from '../theme/tokens';

const PARCOURS = [
  'Dépôt du texte à l’Assemblée nationale ou au Sénat.',
  'Examen en commission, puis en séance publique, dans la première chambre.',
  'Même chose dans l’autre chambre ; si elle modifie le texte, il fait la navette.',
  'Si les deux chambres ne s’accordent pas, une commission mixte paritaire (CMP) cherche un compromis ; en cas d’échec, l’Assemblée peut avoir le dernier mot.',
  'Le Conseil constitutionnel peut être saisi.',
  'Le Président de la République promulgue la loi, publiée ensuite au Journal officiel.',
];

const RUBRIQUES: { titre: string; texte: string }[] = [
  {
    titre: 'D’où viennent les données',
    texte:
      'Uniquement des données publiques : Assemblée nationale, Sénat, Légifrance et Journal officiel, Conseil constitutionnel, HATVP (déclarations et répertoire des représentants d’intérêts), Répertoire national des élus. Mise à jour chaque nuit. Chaque fiche cite ses sources. Licence Ouverte.',
  },
  {
    titre: 'Lire nos chiffres',
    texte:
      'Un chiffre est toujours donné en phrase, avec ce sur quoi il porte (« 88 votes sur 100 ») et par rapport à quoi on le lit. Chaque indicateur dit aussi ce que la donnée ne dit pas : une absence peut être justifiée, un vote à main levée n’a pas de résultat individuel, le travail en commission compte peu dans les votes.',
  },
  {
    titre: 'Établi ou à vérifier',
    texte:
      'Un rapprochement entre deux faits (une action de lobbying et un texte, par exemple) dit toujours s’il est établi par une source ou seulement à vérifier. Ce qui est à vérifier n’est jamais présenté comme un fait. Un délai dépassé d’après nos données reste à vérifier : l’acte attendu peut manquer dans nos sources.',
  },
  {
    titre: 'Les mêmes règles pour tous',
    texte: 'Mêmes indicateurs, même présentation et mêmes critères pour tous les élus et tous les groupes. Aucun adjectif, aucun score moral.',
  },
  {
    titre: 'L’IA dans l’app',
    texte:
      'Aucune IA n’est utilisée aujourd’hui : les résumés « en clair » ne sont pas encore rédigés, l’app le dit à leur place. Quand ils le seront, chacun sera relu par une personne et marqué ✦.',
  },
  {
    titre: 'Vos données',
    texte: 'Pas de compte, pas d’e-mail. Vos réglages restent sur votre appareil.',
  },
];

export function Guide() {
  const aller = useAller();
  const large = useLarge();
  return (
    <Ecran largeur="lecture">
      <View style={styles.entete}>
        <TitreEcran>Guide</TitreEcran>
        <T ton="inkSoft">Comment se servir de l’app, et comment elle fonctionne.</T>
      </View>

      <View style={styles.section}>
        <TitreSection>Prise en main</TitreSection>
        <T>
          Cinq entrées, en bas de l’écran (en haut sur un grand écran) : l’Actualité de la semaine, les Chiffres, la Carte, la Recherche et ce Guide. Chaque
          fiche ouverte s’empile ; le retour, ou le fil en haut de l’écran, ramène d’où l’on vient.
        </T>
        <Action onPress={() => aller.onglet('Recherche')}>Chercher un texte, une personne, un numéro →</Action>
      </View>

      <View style={styles.section}>
        <TitreSection>Comprendre la loi</TitreSection>
        <T ton="inkSoft">Le parcours d’un texte, de son dépôt au Journal officiel :</T>
        <View style={styles.liste}>
          {PARCOURS.map((etape, i) => (
            <View key={etape} style={styles.etape}>
              <T variant="data" ton="inkMuted" style={styles.numero}>
                {i + 1}
              </T>
              <T style={styles.etapeTexte}>{etape}</T>
            </View>
          ))}
        </View>
        <Action onPress={() => aller.onglet('Chiffres')}>Où en sont les textes aujourd’hui →</Action>
      </View>

      <View style={[styles.grille, large && styles.grilleLarge]}>
        {RUBRIQUES.map((r) => (
          <Carte key={r.titre} style={large ? styles.carteLarge : undefined}>
            <T variant="card" accessibilityRole="header">
              {r.titre}
            </T>
            <T ton="inkSoft">{r.texte}</T>
          </Carte>
        ))}
      </View>

      <Signaler cible={{ type: 'autre', id: null }} ecran="Guide" />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  section: { gap: space[3] },
  liste: { gap: space[2] },
  etape: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  numero: { width: 20, paddingTop: 4 },
  etapeTexte: { flex: 1 },
  grille: { gap: space[4] },
  grilleLarge: { flexDirection: 'row', flexWrap: 'wrap' },
  carteLarge: { flexBasis: 360, flexGrow: 1 },
});
