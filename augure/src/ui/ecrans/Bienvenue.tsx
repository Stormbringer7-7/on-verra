// Bienvenue (canevas v4, « Bienvenue »), au premier lancement seulement. Le canevas demande aussi
// des thèmes et un code postal : ni l'un ni l'autre ne sert encore (aucun thème attribué aux textes,
// pas de recherche des élus par code postal), donc ils ne sont pas demandés.

import { Pressable, StyleSheet, View } from 'react-native';

import { useAller } from '../../navigation';
import { Action, Carte, Label, T, TitreEcran } from '../components/base';
import { Ecran } from '../components/Ecran';
import { useReglages } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

const POINTS: [string, string][] = [
  ['Suivre une loi', 'du dépôt au Journal officiel.'],
  ['Voir les votes', 'de chaque élu, et ses écarts avec son groupe.'],
  ['Vérifier', 'chaque fait a sa source publique.'],
];

export function Bienvenue() {
  const { modifier } = useReglages();
  const aller = useAller();
  const p = usePalette();
  const fermer = () => {
    modifier({ bienvenueVue: true });
    aller.retour();
  };
  return (
    <Ecran titre="Bienvenue" largeur="lecture">
      <TitreEcran>Voir ce que font vos élus, simplement.</TitreEcran>
      <View style={styles.points}>
        {POINTS.map(([titre, suite]) => (
          <T key={titre}>
            <T variant="heading">{titre}</T> {suite}
          </T>
        ))}
      </View>
      <Carte>
        <T variant="card" accessibilityRole="header">
          Neutre, sans compte, sans publicité
        </T>
        <T ton="inkSoft">Les mêmes règles pour tous les élus et tous les partis. Vos réglages restent sur votre appareil.</T>
        <Action
          onPress={() => {
            modifier({ bienvenueVue: true });
            aller.retour();
            aller.methode();
          }}
        >
          Notre méthode →
        </Action>
      </Carte>
      <Pressable accessibilityRole="button" onPress={fermer} style={[styles.bouton, { backgroundColor: p.ink }]}>
        <Label couleur={p.surface}>Voir l’actualité</Label>
      </Pressable>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  points: { gap: space[3] },
  bouton: { minHeight: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
