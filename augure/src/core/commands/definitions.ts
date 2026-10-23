// Catalogue des commandes de l'app : le seul contrat entre l'UI et le cœur.

import type {
  Assemblee,
  Catalogue,
  Champions,
  EtatBase,
  FicheDepute,
  FicheGroupe,
  FicheScrutin,
  Legislature,
  Nature,
  Niveau,
  ResultatRecherche,
  ScrutinResume,
} from '../domain/model';
import { defineCommand, defineQuery } from './bus';

type Vide = Record<string, never>;

/** Lit l'index publié, ouvre la législature en cours et la met à jour depuis la publication opendata. */
export const Synchroniser = defineCommand<Vide, EtatBase>('base/synchroniser');

/** Législatures publiées ; une législature non installée est téléchargée à sa première consultation. */
export const ListerLegislatures = defineQuery<Vide, Legislature[]>('legislatures/lister');

/** Hémicycle à la date du dernier scrutin de la législature (la plus récente par défaut). */
export const ConsulterAssemblee = defineQuery<{ legislature?: string }, Assemblee>('assemblee/consulter');

export const ConsulterGroupe = defineQuery<{ ref: string; legislature: string }, FicheGroupe>('groupe/consulter');

/** Choix d'un député sur les 12 derniers mois de son mandat. */
export const ConsulterDepute = defineQuery<{ acteur: string; legislature: string }, FicheDepute>('depute/consulter');

/** `depute` : député depuis lequel on consulte, pour rappeler son vote. */
export const ConsulterScrutin = defineQuery<{ uid: string; depute?: string }, FicheScrutin>('scrutin/consulter');

/** Par défaut : votes finaux de la législature en cours, du plus récent au plus ancien. */
export const ListerScrutins = defineQuery<
  {
    legislature?: string;
    natures?: readonly Nature[];
    niveau?: Niveau;
    texte?: string;
    resultat?: 'adopte' | 'rejete';
    /** Thème du texte visé (classement par ThemeClassifier). */
    theme?: string;
    limite?: number;
  },
  ScrutinResume[]
>('scrutins/lister');

/** Députés et scrutins (toutes natures) d'une législature, la plus récente par défaut. */
export const Rechercher = defineQuery<{ texte: string; legislature?: string }, ResultatRecherche>('recherche');

/** Députés, groupes, thèmes et territoires d'une législature, pour la recherche par types. */
export const Explorer = defineQuery<{ legislature?: string }, Catalogue>('recherche/explorer');

/** Activité de chaque député en fonction, par thème, sur les 12 derniers mois. */
export const ConsulterChampions = defineQuery<{ legislature?: string }, Champions>('champions/consulter');
