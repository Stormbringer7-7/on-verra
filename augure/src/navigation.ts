// Pages de l'app et façons d'y aller. Déclaré en code : pas de routage par fichiers.
// Cinq onglets du design v4, points d'entrée sans état : Actualité (route `Accueil`, adresse `/`),
// Chiffres, Carte, Recherche, Guide. Tout le reste s'empile au-dessus, y compris les anciennes listes
// Dossiers, Personnes et Institutions (mêmes adresses qu'avant), Mes suivis, Réglages, Méthode et
// Bienvenue (premier lancement).

import { StackActions, useNavigation, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';

import type { Chambre, NiveauCarte, CibleInterventions, CleCase, CleFiltre, DemandeFaits, OngletPersonne, Origine, RolePersonne, TypeInstitution } from './core/domain/model';
import { paramsExplorer, type ParamsExplorer } from './ui/explorer';

export type Onglets = {
  Accueil: undefined;
  Chiffres: undefined;
  Carte: ParamsCarte;
  Recherche: { q?: string } | undefined;
  Guide: undefined;
};

/**
 * Carte : un scrutin (`/carte?scrutin=…`, `&niveau=circonscription` pour l'Assemblée député par
 * député), sinon la présence d'une chambre (députés par défaut).
 */
export type ParamsCarte = { scrutin?: string; chambre?: Chambre; niveau?: NiveauCarte } | undefined;

/** Liste des textes d'une file (« Où en sont les textes ») : mêmes filtres que `DemandeAvancement`. */
export type ParamsTextes = { etape?: string; horsParlement?: boolean; origine?: Origine } | undefined;

/** Paramètres plats (liens profonds) : la cible des discussions est aplatie en `type` + identifiants. */
export type ParamsDiscussions =
  | { type: 'etape'; dossier: string; cle: CleCase }
  | { type: 'reunion'; id: string }
  | { type: 'amendement'; id: string }
  | { type: 'personne'; id: string; dossier?: string };

export type Pages = {
  Onglets: NavigatorScreenParams<Onglets>;
  Dossiers: undefined;
  Personnes: { vue?: 'annuaire' | 'classements'; role?: RolePersonne } | undefined;
  Institutions: { institution?: TypeInstitution } | undefined;
  Textes: ParamsTextes;
  /** Explorer : filtres, onglet, regroupement… en paramètres d'adresse (`ui/explorer.ts`). */
  Explorer: ParamsExplorer | undefined;
  Suivis: undefined;
  Reglages: undefined;
  Methode: undefined;
  Bienvenue: undefined;
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
  Departement: { code: string; scrutin?: string };
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
          Chiffres: 'chiffres',
          Carte: 'carte',
          Recherche: 'recherche',
          Guide: 'guide',
        },
      },
      Dossiers: 'dossiers',
      Personnes: 'personnes',
      Institutions: 'institutions',
      Textes: 'chiffres/textes',
      Explorer: 'explorer',
      Suivis: 'suivis',
      Reglages: 'reglages',
      Methode: 'methode',
      Bienvenue: 'bienvenue',
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
      Departement: 'departement/:code',
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
      dossiers: () => empiler('Dossiers', undefined),
      personnes: (params?: Pages['Personnes']) => empiler('Personnes', params),
      institutions: (params?: Pages['Institutions']) => empiler('Institutions', params),
      textes: (params?: ParamsTextes) => empiler('Textes', params),
      /** L'Explorer sur une demande, ou sur un seul filtre (« Voir les faits » d'une fiche). */
      explorer: (demande: DemandeFaits = {}) => empiler('Explorer', paramsExplorer(demande)),
      faits: (cle: CleFiltre, id: string) => empiler('Explorer', paramsExplorer({ filtres: { [cle]: id } })),
      suivis: () => empiler('Suivis', undefined),
      reglages: () => empiler('Reglages', undefined),
      methode: () => empiler('Methode', undefined),
      bienvenue: () => empiler('Bienvenue', undefined),
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
      departement: (code: string, scrutin?: string) => empiler('Departement', scrutin ? { code, scrutin } : { code }),
      onglet: <O extends keyof Onglets>(screen: O, params?: Onglets[O]) =>
        navigation.navigate('Onglets', { screen, params } as NavigatorScreenParams<Onglets>),
      retour: () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Onglets', { screen: 'Accueil' })),
    };
  }, [navigation]);
}
