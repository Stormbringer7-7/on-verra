// Pages de l'app et façons d'y aller. Déclaré en code : pas de routage par fichiers.

import { StackActions, useNavigation, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';

export type Onglets = {
  Assemblee: undefined;
  Scrutins: undefined;
  Champions: undefined;
  Recherche: undefined;
};

export type Pages = {
  Onglets: NavigatorScreenParams<Onglets>;
  Groupe: { ref: string; legislature: string };
  Depute: { acteur: string; legislature: string };
  Scrutin: { uid: string; depute?: string };
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends Pages {}
  }
}

/** Adresses web et liens profonds (`augure://depute/17/PA607619`). */
export const liens: LinkingOptions<Pages> = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: {
      Onglets: { screens: { Assemblee: '', Scrutins: 'scrutins', Champions: 'champions', Recherche: 'recherche' } },
      Groupe: 'groupe/:legislature/:ref',
      Depute: 'depute/:legislature/:acteur',
      Scrutin: 'scrutin/:uid',
    },
  },
};

/**
 * Aller vers une fiche. Chaque fiche s'empile (député → scrutin → autre député…),
 * le retour remonte ce chemin.
 */
export function useAller() {
  const navigation = useNavigation();
  return useMemo(
    () => ({
      groupe: (ref: string, legislature: string) => navigation.dispatch(StackActions.push('Groupe', { ref, legislature })),
      depute: (acteur: string, legislature: string) =>
        navigation.dispatch(StackActions.push('Depute', { acteur, legislature })),
      scrutin: (uid: string, depute?: string) =>
        navigation.dispatch(StackActions.push('Scrutin', depute ? { uid, depute } : { uid })),
      onglet: (screen: keyof Onglets) => navigation.navigate('Onglets', { screen }),
      retour: () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Onglets', { screen: 'Assemblee' })),
    }),
    [navigation],
  );
}
