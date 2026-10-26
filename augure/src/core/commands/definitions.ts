// Catalogue des commandes de l'app : le seul contrat entre l'UI et le cœur (une query par écran,
// plus une commande d'écriture). Le transport (ApiBus) envoie chaque commande en POST sur son type :
// ce fichier n'exporte que des définitions.

import type {
  Accueil,
  AccuseSignalement,
  Annuaire,
  AvancementDesTextes,
  Carte,
  DemandeAvancement,
  DemandeFamilles,
  DemandeCarte,
  DemandeDepartement,
  FicheDepartement,
  CibleInterventions,
  Classement,
  CleCase,
  DemandeClassement,
  DemandeFaits,
  DemandePage,
  DemandeRecherche,
  ExplicationVote,
  ExplorationFaits,
  FicheAmendement,
  FicheArticle,
  FicheDossier,
  FicheEtape,
  FichePersonne,
  FicheRepresentant,
  FicheScrutin,
  FiltreAnnuaire,
  FiltreDossiers,
  Institution,
  ListeDossiers,
  ListeInterventions,
  OngletPersonne,
  ResultatFamilles,
  ResultatRecherche,
  Signalement,
  SortAmendement,
  Suivis,
  DemandeSuivis,
  TypeInstitution,
} from '../domain/model';
import { defineCommand, defineQuery } from './bus';

type Vide = Record<string, never>;

/** Dossiers à suivre et votes de la semaine dans les deux chambres. */
export const ConsulterAccueil = defineQuery<Vide, Accueil>('accueil/consulter');

/** Dossiers de la législature (17e par défaut), filtrés par état, origine et thème. */
export const ListerDossiers = defineQuery<FiltreDossiers, ListeDossiers>('dossiers/lister');

/**
 * Où en sont les textes non aboutis : une file par case du parcours (en examen, en attente,
 * attente médiane) et les attentes hors du Parlement ; liste filtrable par file, paginée.
 */
export const ConsulterAvancement = defineQuery<DemandeAvancement, AvancementDesTextes>('textes/avancement');

/**
 * Tout le dossier (parcours, texte, votes, acteurs, intérêts, chiffres, sources) ; la liste des
 * amendements est paginée et filtrable par sort.
 */
export const ConsulterDossier = defineQuery<
  { id: string; amendements?: DemandePage & { sort?: SortAmendement } },
  FicheDossier
>('dossier/consulter');

/** Une case du parcours : chiffres, changements article ← amendement, votes, « Qui intervient », documents. */
export const ConsulterEtape = defineQuery<{ dossier: string; cle: CleCase }, FicheEtape>('etape/consulter');

/** Prises de parole d'une étape, d'une réunion, sur un amendement ou d'une personne, texte intégral. */
export const ListerInterventions = defineQuery<{ cible: CibleInterventions } & DemandePage, ListeInterventions>(
  'interventions/lister',
);

/**
 * Versions d'un article suivi. `version` : identifiant de la version affichée (la plus récente par
 * défaut) ; `comparaison` : à la version précédente (défaut) ou au texte déposé.
 */
export const ConsulterArticle = defineQuery<
  { article: string; version?: string; comparaison?: 'precedente' | 'depose' },
  FicheArticle
>('article/consulter');

export const ConsulterAmendement = defineQuery<{ id: string }, FicheAmendement>('amendement/consulter');

/** Scrutin public de l'AN ou du Sénat. */
export const ConsulterScrutin = defineQuery<{ id: string }, FicheScrutin>('scrutin/consulter');

/** « Pourquoi ce vote » : ce qui est public autour du vote d'une personne sur un scrutin. */
export const ExpliquerVote = defineQuery<{ scrutin: string; personne: string }, ExplicationVote>('vote/expliquer');

/** Annuaire : députés, sénateurs, Gouvernement, élus locaux, avec leur fonction actuelle. */
export const ListerPersonnes = defineQuery<FiltreAnnuaire, Annuaire>('personnes/lister');

/** Classements par chambre (écarts, absences, positions), sur les thèmes choisis. */
export const ClasserPersonnes = defineQuery<DemandeClassement, Classement>('personnes/classer');

/** Fiche personne : en-tête et contenu de l'onglet demandé (« parcours » par défaut). */
export const ConsulterPersonne = defineQuery<{ id: string; onglet?: OngletPersonne }, FichePersonne>(
  'personne/consulter',
);

export const ConsulterInstitution = defineQuery<{ institution: TypeInstitution }, Institution>('institution/consulter');

export const ConsulterRepresentant = defineQuery<{ id: string } & DemandePage, FicheRepresentant>(
  'representant/consulter',
);

/**
 * Faits filtrés (Explorer) : filtres → compteurs par type de fait, faits de l'onglet regroupés et
 * paginés, filtres suivants avec leur nombre, élargissements, comparaison de deux groupes.
 */
export const ExplorerFaits = defineQuery<DemandeFaits, ExplorationFaits>('faits/explorer');

/**
 * Mes suivis : ce qui a bougé depuis une date sur les lois et les élus suivis (gardés sur
 * l'appareil, jamais côté serveur).
 */
export const ConsulterSuivis = defineQuery<DemandeSuivis, Suivis>('suivis/consulter');

/**
 * Recherche par familles (design v4) : comptes par famille et déclinaison, aperçu ou liste paginée
 * de chaque déclinaison, numéro officiel exact ou ambigu ; sans requête, on parcourt.
 */
export const ChercherParFamilles = defineQuery<DemandeFamilles, ResultatFamilles>('recherche/familles');

/**
 * Carte des départements : un scrutin (votes des élus de chaque département) ou la présence d'une
 * chambre (participation des élus actuels sur l'année en cours, comparée à leurs groupes).
 */
export const ConsulterCarte = defineQuery<DemandeCarte, Carte>('carte/consulter');

/** Un département : ses élus en fonction, leur participation comparée, et leurs votes sur un scrutin. */
export const ConsulterDepartement = defineQuery<DemandeDepartement, FicheDepartement>('departement/consulter');

/** Dossiers, personnes, amendements, scrutins et organisations. */
export const Rechercher = defineQuery<DemandeRecherche, ResultatRecherche>('recherche');

/** « Signaler une erreur ou une source manquante » : file de corrections (analytique.signalement). */
export const SignalerErreur = defineCommand<Signalement, AccuseSignalement>('signalement/envoyer');
