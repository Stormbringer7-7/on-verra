// Pages de l'app et façons d'y aller. Déclaré en code : pas de routage par fichiers.
// Cinq onglets (Accueil, Dossiers, Personnes, Institutions, Recherche) ; chaque fiche s'empile.

import { StackActions, useNavigation, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';

import type { CibleInterventions, CleCase, OngletPersonne, RolePersonne, TypeInstitution } from './core/domain/model';

export type Onglets = {
  Accueil: undefined;
  Dossiers: undefined;
  Personnes: { vue?: 'annuaire' | 'classements'; role?: RolePersonne } | undefined;
  Institutions: { institution?: TypeInstitution } | undefined;
  Recherche: { q?: string } | undefined;
};

/** Paramètres plats (liens profonds) : la cible des discussions est aplatie en `type` + identifiants. */
export type ParamsDiscussions =
  | { type: 'etape'; dossier: string; cle: CleCase }
  | { type: 'reunion'; id: string }
  | { type: 'amendement'; id: string }
  | { type: 'personne'; id: string; dossier?: string };

export type Pages = {
  Onglets: NavigatorScreenParams<Onglets>;
  Dossier: { id: string };
  Etape: { dossier: string; cle: CleCase };
  Discussions: ParamsDiscussions;
  Article: { article: string; version?: string; comparaison?: 'precedente' | 'depose' };
  Amendement: { id: string };
  Scrutin: { id: string };
  PourquoiVote: { scrutin: string; personne: string };
  Personne: { id: string; onglet?: OngletPersonne };
  Institution: { institution: TypeInstitution };
  Representant: { id: string };
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends Pages {}
  }
}

/** La cible du contrat (`ListerInterventions`) depuis les paramètres de la page. */
export const cibleDiscussions = (p: ParamsDiscussions): CibleInterventions => p;

/** Adresses web et liens profonds (`augure://dossier/DLR5L17N54085`). */
export const liens: LinkingOptions<Pages> = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: {
      Onglets: {
        screens: {
          Accueil: '',
          Dossiers: 'dossiers',
          Personnes: 'personnes',
          Institutions: 'institutions',
          Recherche: 'recherche',
        },
      },
      Dossier: 'dossier/:id',
      Etape: 'dossier/:dossier/etape/:cle',
      Discussions: 'discussions/:type',
      Article: 'article/:article',
      Amendement: 'amendement/:id',
      Scrutin: 'scrutin/:id',
      PourquoiVote: 'scrutin/:scrutin/pourquoi/:personne',
      Personne: 'personne/:id',
      Institution: 'institution/:institution',
      Representant: 'representant/:id',
    },
  },
};

/**
 * Aller vers une fiche. Chaque fiche s'empile (dossier → étape → amendement → personne…), le
 * retour remonte ce chemin.
 */
export function useAller() {
  const navigation = useNavigation();
  return useMemo(() => {
    const empiler = <P extends Exclude<keyof Pages, 'Onglets'>>(page: P, params: Pages[P]) =>
      navigation.dispatch(StackActions.push(page, params));
    return {
      dossier: (id: string) => empiler('Dossier', { id }),
      etape: (dossier: string, cle: CleCase) => empiler('Etape', { dossier, cle }),
      discussions: (cible: CibleInterventions) => empiler('Discussions', cible),
      article: (article: string, options: { version?: string; comparaison?: 'precedente' | 'depose' } = {}) =>
        empiler('Article', { article, ...options }),
      amendement: (id: string) => empiler('Amendement', { id }),
      scrutin: (id: string) => empiler('Scrutin', { id }),
      pourquoiVote: (scrutin: string, personne: string) => empiler('PourquoiVote', { scrutin, personne }),
      personne: (id: string, onglet?: OngletPersonne) => empiler('Personne', onglet ? { id, onglet } : { id }),
      institution: (institution: TypeInstitution) => empiler('Institution', { institution }),
      representant: (id: string) => empiler('Representant', { id }),
      onglet: <O extends keyof Onglets>(screen: O, params?: Onglets[O]) =>
        navigation.navigate('Onglets', { screen, params } as NavigatorScreenParams<Onglets>),
      retour: () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Onglets', { screen: 'Accueil' })),
    };
  }, [navigation]);
}
