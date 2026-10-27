// Méthode et sources (canevas v4, « Méthode ») : ce que nous montrons, d'où ça vient, et ce que
// nous ne pouvons pas savoir. Texte du canevas adapté à nos règles réelles : données publiques
// seulement, « Établi / À vérifier », revue humaine des rapprochements, aucune IA aujourd'hui.

import { StyleSheet, View } from 'react-native';

import { Carte, T, TitreEcran } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { RACINES } from '../ariane';
import { Ecran } from '../components/Ecran';
import { PastilleStatut } from '../components/fondations';
import { useLarge } from '../hooks/miseEnPage';
import { space } from '../theme/tokens';

export const RUBRIQUES_METHODE: { titre: string; paragraphes: string[] }[] = [
  {
    titre: 'D’où viennent les données',
    paragraphes: [
      'Uniquement des sources publiques : Assemblée nationale, Sénat, Légifrance et Journal officiel, Conseil constitutionnel, HATVP (déclarations et répertoire des représentants d’intérêts), Répertoire national des élus. Licence Ouverte.',
      'Chaque fait renvoie à sa source. Les données sont rechargées chaque nuit ; un fichier qui n’a pas changé à la source n’est pas relu.',
    ],
  },
  {
    titre: 'Comment lire un indicateur',
    paragraphes: [
      'Un chiffre est toujours donné en phrase, avec ce sur quoi il porte (« 88 votes sur 100 ») et ce à quoi on le compare.',
      'Les mêmes calculs s’appliquent à tous les élus, quel que soit leur groupe. Chaque indicateur dit aussi ce que la donnée ne dit pas.',
    ],
  },
  {
    titre: 'Les rapprochements',
    paragraphes: [
      'Relier deux faits (une action de lobbying et un texte, une personne et un mandat local) n’est montré comme établi que si une source le dit : identifiant officiel, ou un document qui cite l’autre.',
      'Tout le reste est « à vérifier » et le dit, avec ce que le rapprochement n’établit pas. Les cas incertains attendent une décision humaine : le code ne tranche jamais à leur place.',
    ],
  },
  {
    titre: 'L’IA',
    paragraphes: ['Aucune IA n’est utilisée aujourd’hui. Les résumés « en clair » ne sont pas rédigés : l’app le dit à leur place.'],
  },
  {
    titre: 'Ce que nous ne savons pas',
    paragraphes: [
      'Les votes à main levée ne disent pas qui a voté quoi : seuls les scrutins publics sont nominatifs.',
      'Une absence peut être justifiée (commission, mission, maladie) : nous ne le savons pas toujours.',
      'Le travail en commission, en circonscription ou en coulisses n’apparaît presque pas dans les chiffres.',
      'Un délai dépassé d’après nos données reste à vérifier : l’acte attendu peut manquer dans nos sources.',
    ],
  },
  {
    titre: 'Les mêmes règles pour tous',
    paragraphes: [
      'Mêmes règles, mêmes indicateurs et même présentation pour tous les élus et tous les groupes. Les couleurs de groupe sont des repères, pas des jugements : officielles quand la chambre en publie, sinon reprises d’un groupe du même parti à l’Assemblée, sinon choisies par la position dans l’hémicycle ou au hasard, mais toujours les mêmes.',
    ],
  },
  {
    titre: 'Vos données',
    paragraphes: ['Pas de compte. Les textes et les élus suivis et vos réglages sont gardés sur votre appareil uniquement.'],
  },
];

export function Methode() {
  const large = useLarge();
  return (
    <Ecran titre="Méthode et sources" largeur="lecture" parents={[RACINES.actualite]}>
      <View style={styles.entete}>
        <TitreEcran>Méthode et sources</TitreEcran>
        <T ton="inkSoft">Ce que nous montrons, d’où ça vient, et ce que nous ne pouvons pas savoir.</T>
      </View>
      <View style={styles.statuts}>
        <PastilleStatut statut="etabli" libelle="Établi : une source le dit" />
        <PastilleStatut statut="a_verifier" libelle="À vérifier : un indice, pas une preuve" />
      </View>
      <View style={[styles.grille, large && styles.grilleLarge]}>
        {RUBRIQUES_METHODE.map((r) => (
          <Carte key={r.titre} style={large ? styles.carteLarge : undefined}>
            <T variant="card" accessibilityRole="header">
              {r.titre}
            </T>
            {r.paragraphes.map((x) => (
              <T key={x} ton="inkSoft">
                {x}
              </T>
            ))}
          </Carte>
        ))}
      </View>
      <View style={styles.entete}>
        <T variant="card" accessibilityRole="header">
          Signaler une erreur
        </T>
        <T ton="inkSoft">Une donnée fausse, une source manquante ? Chaque signalement est lu.</T>
        <Signaler cible={{ type: 'autre', id: null }} ecran="Méthode" />
      </View>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  statuts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  grille: { gap: space[4] },
  grilleLarge: { flexDirection: 'row', flexWrap: 'wrap' },
  carteLarge: { flexBasis: 360, flexGrow: 1 },
});
