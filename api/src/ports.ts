// Ports de l'API : ce dont le cœur a besoin, sans dire comment c'est fait. Un port par contexte ;
// deux adaptateurs pour chacun, `infra/pg/*` (schémas `canon` et `lecture` de Postgres) et
// `infra/memoire/*` (fixtures du contrat, augure/src/infra/fixtures), choisis par la racine de
// composition (SOURCE_DONNEES=postgres|memoire) et vérifiés par la même suite de tests de contrat.
//
// Les méthodes renvoient déjà des morceaux de DTO du contrat (@contrat/domain/model) : le cœur ne
// fait qu'assembler, paginer et remplir les synthèses. Garanties communes à TOUS les adaptateurs,
// non répétées méthode par méthode :
//   G1. Seules les données de `canon` et de `lecture` sont exposées (100 % fiables). Une
//       correspondance ou un lien n'est suivi que s'il est VERIFIED ; ce qui est en revue
//       (`analytique.cas_revue`, NEEDS_REVIEW, PROPOSED) n'apparaît jamais comme un fait, au mieux
//       comme un `Lien` « a_verifier » là où le type le prévoit.
//   G2. Les entités retirées de la source (`canon.entite.retiree_de_la_source_le IS NOT NULL`) ou
//       fusionnées (`fusionnee_dans IS NOT NULL`) sont ignorées : ni rendues, ni comptées.
//   G3. Chaque fait porte sa `Provenance` : `canon.correspondance` (VERIFIED, système d'origine) et
//       `canon.provenance` (pointeur, url). Aucune URL n'est inventée : null si aucune n'existe.
//   G4. Les champs `Synthese` sont rendus à null : seul le cœur les remplit, par le `Synthetiseur`.
//   G5. Un identifiant inconnu donne null (fiche) ou une liste vide, jamais une exception.
//   G6. 17e législature seulement pour l'instant ; les dates sont « AAAA-MM-JJ ».
//
// « Tables » : ce qui sert la méthode dans le schéma à jour (copie d'intégration opendata,
// migrations 0001 à 0020 et projections 10 à 65). « En base au 24/10/2026 » : état de la base réelle
// quand il diffère (table vide, projection pas encore chargée) — l'adaptateur rend alors vide ou null.

import type { DemandeGroupes, Nommes } from '@contrat/domain/explorer';
import type {
  AccuseSignalement,
  CompteRecherche,
  DeclinaisonRecherche,
  NumeroOfficiel,
  ResultatFamille,
  Chambre,
  DepartementRef,
  ValeurCirconscription,
  FicheDepartement,
  VotesDepartement,
  CleFiltre,
  Fait,
  FiltresFaits,
  GroupeFaits,
  ScrutinFiltre,
  SuggestionFiltre,
  TypeFait,
  ActeSurLeDossier,
  AttenteHorsParlement,
  EvenementSuivi,
  Origine,
  SituationTexte,
  TexteEnAttente,
  AmendementResume,
  Annuaire,
  ArticleResume,
  CaseCompacte,
  CibleInterventions,
  Chiffre,
  Classement,
  CleCase,
  DeclarationHatvp,
  DeclarationResume,
  DemandeClassement,
  DemandeRecherche,
  DossierRef,
  DossierResume,
  ChangementDepuisLeDepot,
  EnteteDossier,
  EntetePersonne,
  EtapeResume,
  FicheAmendement,
  FicheArticle,
  FicheRepresentant,
  FicheScrutin,
  FiltreAnnuaire,
  FiltreDossiers,
  FonctionDatee,
  GroupeActeurs,
  Institution,
  Intervenant,
  Intervention,
  InterventionExtrait,
  LienInteret,
  ListeDossiers,
  Page,
  Parcours,
  Provenance,
  QuestionResume,
  ResultatRecherche,
  RoleDansLesDossiers,
  ChoixTheme,
  Indicateur,
  ScrutinResume,
  Signalement,
  SortAmendement,
  StatAmendementsEtape,
  Synthese,
  VoteIndividuel,
  ExplicationVote,
  FicheEtape,
} from '@contrat/domain/model';

// ---------- Stockage SQL (infrastructure des adaptateurs pg) ----------

export type SqlValue = string | number | boolean | null | string[];
export type SqlParams = Record<string, SqlValue>;

export interface SqlDatabase {
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

/** Pagination demandée, bornée par le cœur (page ≥ 1, 1 ≤ taille ≤ 100). */
export interface Pagination {
  page: number;
  taille: number;
}

// ---------- Dossiers ----------

export interface DossiersRepository {
  /**
   * Dossiers à suivre de l'Accueil : ceux qui ont une échéance à venir (la plus proche d'abord),
   * puis ceux dont l'étape courante a commencé le plus récemment. `barre` et `prochaineEcheance`
   * remplis ; titres en clair à null (G4).
   * Tables : lecture.parcours_dossier_synthese (prochaine_echeance*, etape_courante*),
   * lecture.parcours_dossier (barre), canon.dossier.
   * En base au 24/10/2026 : projections parcours_* pas encore chargées (dans projections/55).
   */
  aSuivre(limite: number): Promise<DossierResume[]>;

  /**
   * Dossiers filtrés, du dernier acte le plus récent au plus ancien, et facettes (nombres par état,
   * origine, thème) calculées sur la législature sans les autres filtres.
   * État : canon.dossier.statut quand il est renseigné, sinon déduit du parcours (case
   * promulgation/jo faite → promulgue ; conclusions CMP ou lecture définitive adoptées → adopte ;
   * rejet publié → rejete ; acte retrait → retire ; sinon en_cours si une case est en cours, null
   * si la donnée ne permet pas de conclure). Thème : aucun dans canon → `theme` null, facette
   * vide, filtre `theme` sans résultat.
   * Tables : canon.dossier (initiative, type_procedure, legislature, statut), lecture.parcours_dossier,
   * lecture.parcours_dossier_synthese, lecture.parcours_acte (dernier événement).
   * En base au 24/10/2026 : canon.dossier.statut toujours null ; initiative renseignée pour 3 054
   * dossiers AN sur 14 880 (null pour les dossiers Sénat seuls).
   */
  lister(filtre: FiltreDossiers, pagination: Pagination): Promise<Pick<ListeDossiers, 'facettes' | 'dossiers'>>;

  /**
   * En-tête du dossier. Auteur : canon.lien nature 'auteur' ou 'initiateur' (personne, ou
   * Gouvernement avec le ministre s'il est publié) ; cosignataires : nombre de liens 'cosignataire'.
   * Tables : canon.dossier, canon.lien, canon.personne, canon.fonction (fonction affichée), canon.organisation.
   */
  entete(id: string): Promise<EnteteDossier | null>;

  /**
   * Barre complète (toutes les cases du gabarit, `sans_objet` compris) et prochaine échéance.
   * null hors du périmètre de la projection (résolution, loi constitutionnelle, sans 1re lecture).
   * Provenance de chaque case : les entite_id de `parcours_dossier.provenance` → canon.correspondance.
   * Tables : lecture.parcours_dossier, lecture.parcours_dossier_synthese.
   */
  parcours(id: string): Promise<Parcours | null>;

  /** Barre compacte, pour les sous-écrans du dossier. Tables : lecture.parcours_dossier. */
  barre(id: string): Promise<{ dossier: DossierRef; cases: CaseCompacte[] } | null>;

  /**
   * Une ligne par case affichée (hors `sans_objet`), avec son organe et son résumé chiffré
   * (amendements déposés et adoptés de l'étape, scrutins publics).
   * Tables : lecture.parcours_dossier, lecture.parcours_acte (etape_id par case), canon.etape
   * (organe_id), canon.amendement (etape_id, sort), canon.scrutin (etape_id).
   */
  etapes(id: string): Promise<EtapeResume[]>;

  /**
   * Articles suivis, dans l'ordre de la dernière version, avec leur nombre de modifications et leur
   * état depuis le dépôt. `versionsDuTexte` : nombre de versions chargées.
   * Tables : canon.article_suivi, canon.version_article (empreinte, statut, mention), canon.version_texte.
   * En base au 24/10/2026 : 31 409 versions d'article (textes AN examinés, Sénat depuis 2024).
   */
  articles(id: string): Promise<{ articles: ArticleResume[]; versionsDuTexte: number }>;

  /**
   * Articles modifiés depuis le dépôt (empreinte du texte déposé ≠ dernière version), `resume` null.
   * Tables : canon.version_article, canon.version_texte (nature depose / dernière).
   */
  ceQuiAChange(id: string): Promise<ChangementDepuisLeDepot[]>;

  /**
   * Amendements déposés et adoptés par case du parcours, et une page d'amendements (adoptés d'abord,
   * puis par date de sort), filtrable par sort.
   * Tables : canon.amendement (etape_id → lecture.parcours_acte.cle, sort, division, article_suivi_id),
   * canon.lien (auteur, cosignataire), canon.personne.
   */
  amendements(
    id: string,
    filtre: { sort?: SortAmendement },
    pagination: Pagination,
  ): Promise<{ parEtape: StatAmendementsEtape[]; liste: Page<AmendementResume> }>;

  /**
   * Acteurs par rôle : auteur, Gouvernement (ministre qui porte le texte), rapporteurs, membres de
   * la CMP, auteurs d'amendements les plus actifs, saisissants du Conseil, personnes auditionnées.
   * Une personne auditionnée n'est une `personne` que si `canon.audition.personne_id` est posé
   * (certain) ; sinon `nom_publie`.
   * Tables : canon.lien (auteur, initiateur, rapporteur), canon.fonction (membre_cmp, membre_gouvernement),
   * canon.amendement + canon.lien (auteurs actifs), canon.intervention (nombre d'interventions),
   * canon.audition, canon.etape (saisine_cc) + canon.lien.
   * En base au 24/10/2026 : canon.audition vide (0 ligne).
   */
  acteurs(id: string): Promise<GroupeActeurs[]>;

  /**
   * Chiffres clés : étapes franchies, amendements déposés et adoptés, scrutins publics,
   * interventions en séance, durée d'examen (dépôt → dernière case faite).
   * Tables : lecture.parcours_dossier_synthese, canon.amendement, canon.scrutin, canon.intervention.
   */
  chiffres(id: string): Promise<Chiffre[]>;

  /**
   * Sources officielles du dossier : une provenance par système (AN, Sénat, Légifrance, CONSTIT).
   * Tables : canon.correspondance (entite_id du dossier, de canon.texte_publie, de canon.decision_cc).
   */
  sources(id: string): Promise<Provenance[]>;

  /**
   * Étape (une case du parcours) : tout sauf la barre (`barre`), « Qui intervient »
   * (DiscussionsRepository) et les votes (ScrutinsRepository). Changements article ← amendement : origine « amendement » vérifiée
   * si `modification_article.statut` = VERIFIED, à vérifier si NEEDS_REVIEW, REJECTED ignorée ;
   * « non_etablie » sinon. Documents : rapports, textes adoptés, étude d'impact, avis du CE,
   * comptes rendus, saisine, décision.
   * Tables : lecture.parcours_dossier, lecture.parcours_acte, canon.etape (organe_id),
   * canon.document (etape_id, type, numero, url), canon.amendement (chiffres), canon.reunion via
   * canon.lien nature 'reunion' (réunions), canon.version_article + canon.modification_article.
   * En base au 24/10/2026 : canon.modification_article vide → changements toujours « non_etablie »
   * ou vides.
   */
  etape(
    dossier: string,
    cle: CleCase,
  ): Promise<Omit<FicheEtape, 'barre' | 'votes' | 'quiIntervient'> | null>;

  /**
   * Article suivi : versions successives (texte déposé → dernière), version affichée et son diff
   * (calculé par l'adaptateur depuis les deux textes quand `modification_article.diff` est vide),
   * origine du changement (cf. `etape`), extrait de l'exposé des motifs de l'amendement d'origine.
   * Tables : canon.article_suivi, canon.version_article, canon.version_texte (etape_id, chambre, date),
   * canon.modification_article, canon.amendement (expose), lecture.parcours_acte (case de l'étape).
   */
  article(
    id: string,
    version: string | null,
    comparaison: 'precedente' | 'depose',
  ): Promise<Omit<FicheArticle, 'barre'> & { dossier: string } | null>;

  /**
   * Amendement : tout sauf discussions (DiscussionsRepository), intérêts (TransparenceRepository)
   * et le scrutin public éventuel (ScrutinsRepository). Avis : canon.avis_amendement ;
   * `publies` false pour l'AN (non publiés en données structurées). Mode de vote : `main_levee` si
   * adopté ou rejeté sans scrutin public, `sans_vote` sinon (le cœur remplace par `scrutin_public`).
   * Tables : canon.amendement, canon.lien (auteur, cosignataire, groupe_auteur), canon.personne,
   * canon.organisation, canon.avis_amendement, canon.version_article (diff du dispositif).
   */
  amendement(id: string): Promise<Omit<FicheAmendement, 'barre' | 'discussions' | 'interets'> & { dossier: string | null } | null>;

  /**
   * Projets de loi déposés par le gouvernement en fonction à cette date (Institutions).
   * Tables : canon.dossier (initiative 'gouvernement', date_depot), lecture.parcours_dossier.
   */
  deposesParLeGouvernement(depuis: string, limite: number): Promise<{ total: number; dossiers: DossierResume[] }>;

  /**
   * Où en est chaque texte non abouti de la législature (Où en sont les textes) ; null hors
   * projection. Non abouti : ni JO (ou promulgation et JO) fait, ni retiré, ni rejeté en 1re
   * lecture de la chambre de dépôt ou en lecture définitive. Position : la case active (faite ou
   * en cours) de plus haut rang ; `en_examen` si elle est en cours avec un acte d'examen
   * (réunion, rapport, débat, décision, saisine du Conseil : un dépôt, un renvoi en commission ou
   * une nomination de rapporteur seuls ne suffisent pas), depuis son début ; sinon `en_attente`,
   * depuis son début si elle est en cours, depuis sa fin (à défaut son début) si elle est faite.
   * Hors Parlement, d'après les cases suivantes
   * qui ne sont pas `sans_objet` (le Conseil constitutionnel à venir, facultatif, est sauté) :
   * case `cc` en cours → decision_cc ; suite promulgation ou promulgation_jo → promulgation ;
   * promulgation faite, suite jo → publication_jo. Un texte sans case active est indéterminé.
   * Tables : lecture.parcours_dossier, lecture.parcours_dossier_synthese (date_reference, retire_le),
   * canon.dossier (legislature, initiative).
   */
  positions(legislature: string): Promise<{ dateReference: string; indetermines: number; positions: PositionTexte[] } | null>;

  /**
   * Les textes de ces positions, dans le même ordre : titre, dernier acte publié, prochaine
   * échéance. Une position dont le dossier est inconnu ou retiré est omise.
   * Tables : canon.dossier, lecture.parcours_acte, lecture.parcours_dossier_synthese.
   */
  textesEnAttente(positions: PositionTexte[]): Promise<TexteEnAttente[]>;

  /**
   * Résumés de ces dossiers (Mes suivis), dans l'ordre des identifiants ; inconnus, retirés ou
   * fusionnés omis (G2, G5). Mêmes champs que `lister`.
   */
  resumesDe(ids: string[]): Promise<DossierResume[]>;

  /**
   * Actes publiés et datés du parcours de ces dossiers à partir du jour `depuis`, du plus récent au
   * plus ancien, au plus `limite` ; libellé « case · conclusion ou libellé de l'acte », tel que publié.
   * Tables : lecture.parcours_acte (accompli, categorie 'case'), lecture.parcours_dossier (libellé),
   * canon.dossier, canon.correspondance (provenance de l'étape).
   */
  actesDepuis(ids: string[], depuis: string, limite: number): Promise<ActeSuivi[]>;
}

/** Un acte du parcours d'un dossier suivi (Mes suivis). */
export type ActeSuivi = Extract<EvenementSuivi, { type: 'acte' }>;

/** Position d'un texte non abouti, telle que la lit le dépôt : le cœur la range en files. */
export interface PositionTexte {
  dossier: string;
  origine: Origine | null;
  etape: TexteEnAttente['etape'];
  situation: SituationTexte;
  depuis: string | null;
  jours: number | null;
  /** Ce que le texte attend hors du Parlement, d'après son parcours ; null sinon. */
  horsParlement: AttenteHorsParlement | null;
}

// ---------- Discussions ----------

export interface DiscussionsRepository {
  /**
   * « Qui intervient » sur une case : orateurs des réunions de l'étape sur ce dossier, du plus
   * actif au moins actif, présidence de séance exclue, avec un extrait de leur première intervention.
   * Orateur `personne` seulement si `canon.intervention.orateur_id` est posé ; sinon le nom publié
   * (commissions AN : toujours le nom publié).
   * Tables : lecture.parcours_acte (etape_id) → canon.lien nature 'reunion' → canon.reunion,
   * canon.intervention (reunion_id, dossier_id, orateur_id, orateur_libelle, qualite, groupe_id),
   * canon.provenance (pointeur = ancre), canon.document (compte rendu, url).
   */
  intervenants(dossier: string, cle: CleCase, limite: number): Promise<{ intervenants: Intervenant[]; total: number }>;

  /**
   * Interventions d'une cible, dans l'ordre (réunion, ordre), texte intégral identique à la source,
   * `synthese` null. Cible personne : par orateur_id, éventuellement restreinte à un dossier.
   * Tables : canon.intervention, canon.reunion, canon.organisation (organe), canon.point_odj,
   * canon.amendement (sujet), canon.provenance + canon.document (compte rendu).
   */
  interventions(cible: CibleInterventions, pagination: Pagination): Promise<{ libelle: string; interventions: Page<Intervention> } | null>;

  /**
   * Interventions reliées à un amendement (`canon.intervention.amendement_id`), commission
   * d'abord, en extraits.
   * Tables : canon.intervention, canon.reunion.
   */
  surAmendement(amendement: string, limite: number): Promise<{ extraits: InterventionExtrait[]; total: number }>;

  /**
   * Interventions de la personne sur l'amendement ou le dossier voté, le jour du vote ou avant.
   * Tables : lecture.dit_et_vote (avant_le_vote, intervention_ids), canon.intervention.
   */
  avantLeVote(scrutin: string, personne: string, limite: number): Promise<InterventionExtrait[]>;
}

// ---------- Scrutins ----------

export interface ScrutinsRepository {
  /**
   * Scrutins publics des deux chambres entre deux dates, du plus récent au plus ancien.
   * Tables : canon.scrutin (chambre, numero, date, titre, nature, sort, pour, contre, abstentions,
   * dossier_id, etape_id), lecture.parcours_acte (case de l'étape).
   * En base au 24/10/2026 : Sénat depuis 2024 (724 scrutins), AN 9 097.
   */
  entre(debut: string, fin: string, limite: number): Promise<ScrutinResume[]>;

  /** Scrutins d'un dossier, ou d'une case de son parcours. Tables : canon.scrutin, lecture.parcours_acte. */
  duDossier(dossier: string, cle?: CleCase): Promise<ScrutinResume[]>;

  /** Scrutin public qui met un amendement aux voix. Tables : canon.scrutin.amendement_id. */
  surAmendement(amendement: string): Promise<ScrutinResume | null>;

  /**
   * Fiche du scrutin : objet (amendement, article, texte), positions de groupe de la gauche vers la
   * droite (rang : siège moyen des membres quand il est publié, sinon ordre stable), absents par
   * groupe, votes différents de la ligne (groupe à majorité nette), compte rendu. `sens` à null.
   * Tables : canon.scrutin, canon.position_groupe (ligne recalculée depuis le décompte),
   * lecture.participation_groupe_scrutin (membres en mandat, participants), lecture.vote_et_groupe
   * (ecart), canon.vote, canon.organisation (couleur, abrégé), canon.amendement, canon.article_suivi.
   */
  fiche(id: string): Promise<Omit<FicheScrutin, 'barre'> | null>;

  /**
   * Vote d'une personne sur un scrutin, et son groupe ce jour-là (ligne, part de la ligne, même
   * position). Absent : en mandat sans vote publié (lecture.participation_scrutin). Mise au point :
   * canon.lien nature 'mise_au_point'.
   * Tables : canon.vote, lecture.participation_scrutin, lecture.vote_et_groupe, canon.position_groupe.
   * En base au 24/10/2026 : aucune mise au point chargée en canon.lien (doc : 3 452) → null.
   */
  vote(scrutin: string, personne: string): Promise<{ vote: VoteIndividuel; groupe: ExplicationVote['groupe'] } | null>;

  /** Derniers votes de la personne à l'inverse de son groupe. Tables : lecture.vote_et_groupe, canon.scrutin. */
  derniersEcarts(personne: string, limite: number): Promise<ScrutinResume[]>;
}

// ---------- Personnes ----------

export interface PersonnesRepository {
  /**
   * Annuaire filtré par rôle et par nom (sans casse ni accents), fonction en cours, groupe actuel ;
   * effectifs en fonction aujourd'hui. Élus locaux : une fiche RNE par mandat (`identite` 'fiche_rne')
   * sauf si la revue l'a reliée à une personne (alors la personne, une seule fois).
   * Tables : canon.personne, canon.fonction (depute, senateur, membre_gouvernement, fin null ou
   * future), lecture.appartenance_groupe, canon.organisation, canon.mandat_rne (personne_id posé
   * par revue seulement).
   * En base au 24/10/2026 : canon.mandat_rne vide (rôle elu_local sans résultat).
   */
  annuaire(filtre: FiltreAnnuaire, pagination: Pagination): Promise<Pick<Annuaire, 'effectifs' | 'personnes'>>;

  /**
   * Classement par chambre et critère, sur les 12 derniers mois : écarts (écarts / votes en groupe,
   * référence : la moyenne de la chambre), absences (participation comparée à l'attendu du groupe),
   * positions (part de « pour » parmi les exprimés). Chaque ligne porte un `Indicateur` complet.
   * Thèmes : aucun attribué → ignorés, `themesAppliques` vide.
   * Tables : lecture.indicateur_ecarts, lecture.indicateur_participation, lecture.vote_et_groupe,
   * lecture.mandat_parlementaire, lecture.appartenance_groupe.
   */
  classement(demande: DemandeClassement): Promise<Omit<Classement, 'demande'>>;

  /**
   * En-tête : personne canon ou fiche RNE seule (id d'un canon.mandat_rne sans personne_id).
   * Tables : canon.personne, canon.fonction (en cours), lecture.appartenance_groupe, canon.mandat_rne,
   * canon.correspondance (provenance AN, Sénat, HATVP).
   */
  entete(id: string): Promise<EntetePersonne | null>;

  /**
   * Frise : fonctions AN, Sénat, Gouvernement (canon.fonction) et mandats RNE rattachés par la
   * revue (canon.mandat_rne.personne_id, `rattachement` revue_humaine), de la plus ancienne à la
   * plus récente. Aucune date de naissance, aucune adresse.
   * Tables : canon.fonction, canon.organisation, canon.mandat_rne, analytique.cas_revue (motif de
   * la décision appliquée, type elu_local), canon.correspondance.
   */
  fonctions(id: string): Promise<FonctionDatee[]>;

  /**
   * Bilan des 12 derniers mois de mandat (participation comparée à l'attendu du groupe, écarts sur
   * votes en groupe) ; choix par thème vides tant qu'aucun thème n'est attribué. `note` : membre du
   * Gouvernement sans mandat parlementaire en cours, ou mandats terminés.
   * Tables : lecture.indicateur_participation, lecture.indicateur_ecarts, lecture.mandat_parlementaire,
   * canon.fonction.
   */
  choix(id: string): Promise<{ indicateurs: Indicateur[]; note: string | null; themes: ChoixTheme[] }>;

  /**
   * Rôles dans les dossiers : rapporteur, textes déposés ou portés, amendements (déposés,
   * adoptés), interventions, questions, avis du Gouvernement rendus (ministre, Sénat), auditions.
   * Tables : canon.lien (rapporteur, auteur, initiateur, cosignataire), canon.amendement,
   * canon.intervention (orateur_id), canon.question (auteur_id), canon.avis_amendement
   * (emetteur gouvernement, via la fonction de ministre à la date), canon.audition (personne_id).
   * En base au 24/10/2026 : canon.question vide (migration 0014 pas encore chargée), canon.audition vide.
   */
  roles(id: string): Promise<RoleDansLesDossiers[]>;

  /** Questions posées, de la plus récente à la plus ancienne. Tables : canon.question (auteur_id). */
  questions(id: string, pagination: Pagination): Promise<Page<QuestionResume>>;

  /**
   * Ses actes sur un dossier (« Ce qu'elle a fait sur ce dossier ») : rapporteure, amendements
   * déposés (nombre et un exemple), votes sur l'ensemble.
   * Tables : canon.lien (rapporteur, auteur), canon.amendement, canon.vote + canon.scrutin (nature ensemble).
   */
  actesSurLeDossier(personne: string, dossier: string): Promise<ActeSurLeDossier[]>;
}

// ---------- Institutions ----------

export interface InstitutionsRepository {
  /**
   * Composition d'une chambre à une date : sièges par groupe, de la gauche vers la droite, et
   * sièges sans groupe.
   * Tables : lecture.mandat_parlementaire, lecture.appartenance_groupe, canon.organisation
   * (groupe_politique : abrege, couleur).
   */
  chambre(chambre: 'an' | 'senat', date: string): Promise<Extract<Institution, { type: 'an' | 'senat' }>>;

  /**
   * Gouvernement en fonction à la date et ses membres, gouvernements de la législature. Les textes
   * déposés viennent de DossiersRepository.
   * Tables : canon.organisation (type gouvernement, debut, fin), canon.fonction
   * (membre_gouvernement), canon.personne, canon.fonction (ancien mandat parlementaire).
   */
  gouvernement(date: string): Promise<Omit<Extract<Institution, { type: 'gouvernement' }>, 'textesDeposes'>>;

  /**
   * Décisions récentes (DC, QPC) reliées au dossier quand l'AN les cite, saisines sans décision.
   * Tables : canon.decision_cc (numero, type, date, solution, dossier_id, url), canon.etape
   * (type saisine_cc, chambre CC), lecture.parcours_dossier (case cc en cours).
   */
  conseilConstitutionnel(limite: number): Promise<Extract<Institution, { type: 'cc' }>>;
}

// ---------- Transparence (HATVP) ----------

export interface TransparenceRepository {
  /** Déclarations publiées d'une personne (`personne_id` posé seulement si certain), rubriques comprises. Tables : canon.declaration, canon.rubrique_declaree. */
  declarations(personne: string): Promise<DeclarationHatvp[]>;

  /** Version courte, pour « Pourquoi ce vote ». Tables : canon.declaration. */
  declarationsResumees(personne: string): Promise<DeclarationResume[]>;

  /**
   * Fiche du représentant, dernier exercice publié, actions paginées (plus récentes d'abord) et
   * rapprochements (cf. `interetsDe`). `personnesDeclarees` null (non chargé).
   * Tables : canon.representant_interets, canon.exercice_representation, canon.action_representation.
   */
  representant(id: string, pagination: Pagination): Promise<Omit<FicheRepresentant, 'rapprochements'> | null>;

  /**
   * Rapprochements lobbying d'un dossier, d'un amendement, d'un article, d'un représentant, ou ceux
   * qui visent la catégorie de responsables d'une personne sur le sujet d'un scrutin. Vérifié
   * seulement si l'action cite le texte (`decisions_concernees` cite son numéro ou son titre
   * officiel exact) ; sinon « a_verifier » avec avertissement.
   * Tables : canon.action_representation, canon.representant_interets ; analytique.affirmation
   * pour les rapprochements produits par une règle (à venir).
   * En base au 24/10/2026 : aucun rapprochement produit (analytique.affirmation vide) → [].
   */
  interetsDe(
    cible:
      | { type: 'dossier'; id: string }
      | { type: 'amendement'; id: string }
      | { type: 'article'; id: string }
      | { type: 'representant'; id: string }
      | { type: 'vote'; scrutin: string; personne: string },
  ): Promise<LienInteret[]>;
}

// ---------- Recherche ----------

export interface RechercheRepository {
  /**
   * Recherche plein texte (Postgres FTS, `french`) : dossiers (titre, titre court), personnes (nom
   * affiché), amendements (numéro, division, dispositif), scrutins (titre), organisations
   * (représentants d'intérêts, groupes). Sans type : une section par type, `taille` premières
   * réponses chacune ; `total` peut être null.
   * Tables : canon.dossier, canon.personne, canon.amendement, canon.scrutin, canon.representant_interets,
   * canon.organisation.
   */
  rechercher(demande: DemandeRecherche, pagination: Pagination): Promise<ResultatRecherche>;

  /**
   * Recherche par familles : nombre de résultats de chaque déclinaison pour la requête (q null :
   * tous les objets de la législature), plafonné à PLAFOND_COMPTE. Mêmes règles de correspondance
   * que `chercherDeclinaison`.
   */
  compterFamilles(q: string | null, declinaisons: DeclinaisonRecherche[]): Promise<Partial<Record<DeclinaisonRecherche, CompteRecherche>>>;

  /**
   * Une page des résultats d'une déclinaison, les plus pertinents d'abord (q null : les plus
   * récents). Chaque résultat dit sa fiche et ses filtres d'Explorer. `total` : le compte exact
   * jusqu'au plafond, null au-delà.
   * Tables : canon.dossier, canon.article_suivi, canon.organisation (groupe_politique, commission,
   * commission_enquete, assemblee, departement), canon.personne, canon.fonction, canon.scrutin,
   * canon.amendement, canon.intervention (texte_recherche), canon.question,
   * canon.representant_interets, canon.action_representation, canon.declaration, canon.correspondance (INSEE).
   */
  chercherDeclinaison(q: string | null, declinaison: DeclinaisonRecherche, pagination: Pagination): Promise<Page<ResultatFamille>>;

  /**
   * Objets qui portent exactement ce numéro officiel (forme comparable, `numeroComparable`) :
   * amendements (numéro publié), scrutins (numéro, chaque chambre), questions ; au plus `limite`.
   * Le contexte de chacun dit son dossier et sa chambre, pour distinguer des homonymes.
   */
  candidatsNumero(numero: NumeroOfficiel, limite: number): Promise<ResultatFamille[]>;
}

// ---------- Signalements ----------

export interface SignalementsRepository {
  /**
   * Enregistre un signalement (statut NOUVEAU). Seule écriture de l'API.
   * Tables : analytique.signalement (cible_type, cible_id, message, contact) : l'utilisateur
   * Postgres de l'API a besoin du droit INSERT sur cette seule table.
   */
  enregistrer(signalement: Signalement): Promise<AccuseSignalement>;
}

// ---------- Enrichissements remplaçables ----------

/** Ce dont on demande une synthèse « en clair ». */
export type SujetSynthese =
  | { type: 'titre_dossier'; dossier: string }
  | { type: 'resume_dossier'; dossier: string }
  | { type: 'changement_article'; article: string; version: string }
  | { type: 'resume_etape'; dossier: string; cle: CleCase }
  | { type: 'objet_amendement'; amendement: string }
  | { type: 'expose_amendement'; amendement: string }
  | { type: 'scrutin'; scrutin: string }
  | { type: 'sens_du_vote'; scrutin: string; position: 'pour' | 'contre' }
  | { type: 'intervention'; intervention: string }
  | { type: 'choix_theme'; personne: string; theme: string }
  | { type: 'declarations_au_theme'; personne: string; theme: string };

/**
 * « En clair » : titres, résumés, sens du vote, synthèse d'une intervention. Aucun LLM n'est
 * branché : seul adaptateur `SansSynthese`, qui rend toujours null (« Pas de synthèse disponible »).
 * Un futur adaptateur ne rendra que des affirmations relues (analytique.affirmation, verification
 * RELU), jamais des faits.
 */
export interface Synthetiseur {
  synthese(sujet: SujetSynthese): Promise<Synthese>;
}

/** Jour de référence (« semaine du… », 12 derniers mois) : fixé dans les tests de contrat. */
export interface Horloge {
  aujourdhui(): string;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
}

/** Ce que la racine de composition donne au cœur. */
// ---------- Faits filtrés (Explorer) ----------

/**
 * Les lectures de l'Explorer (`@contrat/domain/explorer`), une méthode par type de lecture. Un
 * fait n'est retenu par un filtre que par un lien publié (colonne ou `canon.lien`), jamais par
 * ressemblance ; les filtres se cumulent. Règles par type de fait :
 *   interventions : hors présidence de séance, avec un orateur ; dossier (colonne ou lien),
 *     étape (réunion citée par un acte de la case), article (amendement discuté), groupe (celui
 *     de l'orateur ce jour-là), personne (orateur certain), chambre et organe (réunion),
 *     amendement (discuté) ; aucune sous un filtre scrutin ;
 *   amendements : dossier, étape (acte de la case), article, groupe (lien groupe_auteur),
 *     personne (lien auteur), chambre, organe d'examen ; aucun sous un filtre scrutin ;
 *   votes : scrutins publics de la législature ; groupe (position de groupe publiée), personne
 *     (vote publié), amendement mis aux voix ; aucun sous un filtre organe. Sous un filtre
 *     amendement adopté ou rejeté sans scrutin public : un vote à main levée ;
 *   contrôle : questions au Gouvernement (auteur, groupe de l'auteur, chambre) ; aucune sous un
 *     filtre de loi, d'organe ou d'action législative ;
 *   transparence : rapprochements de lobbying d'un dossier ou d'un amendement filtré (seuls, avec
 *     leur statut), déclarations HATVP d'une personne ou des membres d'un groupe ;
 *   personnes : orateurs certains et auteurs des faits retenus, plus les votants du scrutin filtré.
 * Tables : canon.intervention, canon.reunion, canon.amendement, canon.lien, canon.scrutin,
 * canon.vote, canon.position_groupe, canon.question, canon.declaration, lecture.parcours_acte,
 * lecture.parcours_dossier, lecture.appartenance_groupe ; analytique.affirmation (rapprochements).
 */
export interface FaitsRepository {
  /** Nom, pastille et fiche de chaque filtre posé ; null si un identifiant est inconnu ou retiré. */
  nommer(filtres: FiltresFaits): Promise<Nommes>;
  compter(filtres: FiltresFaits): Promise<Record<TypeFait, number>>;
  /** Groupes de l'onglet, paginés, chacun avec ses premiers faits (`APERCU_GROUPE`). */
  groupes(demande: DemandeGroupes): Promise<Page<GroupeFaits>>;
  /** Faits d'un groupe (`GroupeFaits.cle`), paginés ; clé inconnue : page vide. */
  deplier(demande: DemandeGroupes, cle: string): Promise<Page<Fait>>;
  /** Valeurs du niveau suivant avec leur nombre d'interventions, amendements et votes, non nulles. */
  suggerer(filtres: FiltresFaits, cle: CleFiltre, limite: number): Promise<SuggestionFiltre[]>;
  /** Répartition par groupe du scrutin, et votes des membres du groupe ; null si inconnu. */
  scrutin(scrutin: string, groupe: string | null): Promise<ScrutinFiltre | null>;
}

// ---------- Territoires ----------

/**
 * Département des élus (lien `territoire` mandat → département du COG, publié par la chambre) et ce
 * qu'ils font, département par département. Élus sans département (Français établis hors de France)
 * : comptés à part. Départements rendus par code croissant.
 * Tables : lecture.departement, lecture.elu_departement, lecture.carte_scrutin,
 * lecture.presence_departement, lecture.presence_elu, lecture.participation_scrutin, canon.vote,
 * canon.personne. Projections absentes : listes vides, null pour une fiche.
 */
export interface TerritoiresRepository {
  /** Votes des élus de chaque département sur un scrutin ; null si le scrutin est inconnu (G5). */
  carteScrutin(scrutin: string): Promise<{
    scrutin: ScrutinResume;
    departements: { departement: DepartementRef; votes: VotesDepartement }[];
    horsDepartement: number;
  } | null>;

  /**
   * Un scrutin de l'Assemblée, circonscription par circonscription : chaque circonscription
   * (département du COG + numéro publiés par l'AMO, lien `territoire` du mandat) connue depuis le
   * découpage de 2010 (mandats finissant après le 20/06/2012), le député en mandat le jour du
   * scrutin (le plus récent s'ils se chevauchent) et sa position (« absent » sans vote publié ;
   * personne : vacant). null si le scrutin est inconnu ; liste vide hors projection ou au Sénat.
   */
  circonscriptionsScrutin(scrutin: string): Promise<ValeurCirconscription[] | null>;

  /** Participation des élus actuels de chaque département (année en cours de leur chambre). */
  cartePresence(chambre: Chambre): Promise<{ departements: { departement: DepartementRef; presence: Indicateur }[]; horsDepartement: number }>;

  /** Élus en fonction aujourd'hui (députés puis sénateurs, par circonscription puis nom) et présence par chambre. */
  departement(code: string): Promise<Omit<FicheDepartement, 'scrutin' | 'limites'> | null>;

  /** Votes, sur un scrutin, des élus du département alors en mandat ; null si le scrutin est inconnu. */
  votesDepartement(code: string, scrutin: string): Promise<FicheDepartement['scrutin']>;
}

export interface Depots {
  dossiers: DossiersRepository;
  territoires: TerritoiresRepository;
  faits: FaitsRepository;
  discussions: DiscussionsRepository;
  personnes: PersonnesRepository;
  scrutins: ScrutinsRepository;
  institutions: InstitutionsRepository;
  transparence: TransparenceRepository;
  recherche: RechercheRepository;
  signalements: SignalementsRepository;
}
