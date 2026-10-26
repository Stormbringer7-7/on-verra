// Types transverses du contrat : provenance, rapprochements, indicateurs, synthèses, pagination,
// et les références courtes (personne, groupe, dossier…) que tous les écrans partagent.
//
// Deux règles traversent tout le modèle (canevas « Panoptique v2 ») :
//   - chaque fait porte sa source (`Provenance`) ;
//   - chaque rapprochement porte son statut (`Rapprochement`, `Lien`) : un lien « à vérifier » n'a
//     pas de `cible`, seulement un `candidat`, si bien que l'UI ne peut pas l'afficher comme certain
//     sans avoir lu son statut.
//
// Dates : « AAAA-MM-JJ » ; horodatages : ISO 8601 complet. Identifiants : `entite_id` canon (UUID),
// opaques pour l'UI (les fixtures utilisent des identifiants lisibles).

// ---------- Sources ----------

/** Système d'origine d'un fait, tel que `canon.correspondance.systeme`. */
export type Systeme = 'AN' | 'SENAT' | 'LEGIFRANCE' | 'CONSTIT' | 'HATVP' | 'RNE' | 'INSEE' | 'CIVICTRACE';

/**
 * D'où vient un fait : l'identifiant natif dans sa source et, si possible, la page officielle.
 * Servie par `canon.correspondance` (systeme, type_source, id_source, url, statut VERIFIED) et
 * `canon.provenance` (pointeur, url) → `brut.enregistrement_source`.
 */
export interface Provenance {
  systeme: Systeme;
  /** Type natif (`type_source`) : dossier, amendement, scrutin, acteur, intervention… */
  type: string;
  /** Identifiant natif tel que publié (`id_source`) : « DLR5L17N54085 », « PA720614 ». */
  idNatif: string;
  /**
   * Page officielle de l'objet : publiée par la source, ou déduite de son identifiant (règle de
   * l'adaptateur, ex. page AN d'un dossier). null si aucune n'existe : jamais une URL inventée.
   */
  url: string | null;
}

/** Passage précis d'un document source (compte rendu : paragraphe, ancre). */
export interface Ancre {
  /** URL du document (compte rendu officiel), null si la source n'en publie pas. */
  url: string | null;
  /** Ancre ou pointeur dans le document (`canon.provenance.pointeur`), null si inconnu. */
  ancre: string | null;
  provenance: Provenance;
}

// ---------- Rapprochements ----------

/** Méthodes qui établissent un lien certain (`canon.correspondance.methode`, liens explicites). */
export type MethodeCertaine =
  /** identifiant officiel lu dans la source (OFFICIAL_ID) */
  | 'identifiant_officiel'
  /** une source cite l'identifiant de l'autre objet (EXPLICIT_REFERENCE) */
  | 'reference_explicite'
  /** décision de revue humaine appliquée et tracée (MANUAL) */
  | 'revue_humaine';

/** Indices qui rendent un lien plausible, jamais une preuve (rapprochements analytiques). */
export type MethodeIndice =
  /** nom et dates (NAME_DATE) */
  | 'nom_et_dates'
  /** objet déclaré proche du sujet (lobbying ↔ dossier, amendement, article) */
  | 'meme_sujet'
  /** même sujet, déclaré sur la même période */
  | 'meme_sujet_meme_periode'
  /** attribution d'une modification d'article encore en revue (NEEDS_REVIEW) */
  | 'attribution_en_revue';

export interface RapprochementVerifie {
  statut: 'verifie';
  methode: MethodeCertaine;
  /** Phrase affichable : « l'action cite le texte », « le scrutin cite l'amendement n° 8 ». */
  motif: string;
  /** Ce qui prouve le lien (document qui cite l'autre objet), null si c'est l'identité même. */
  preuve: Provenance | null;
}

export interface RapprochementAVerifier {
  statut: 'a_verifier';
  methode: MethodeIndice;
  /** Phrase affichable : « même sujet, même période ». */
  motif: string;
  /** Ce que le rapprochement n'établit pas, à afficher tel quel (« ni contact, ni influence »). */
  avertissement: string;
}

export type Rapprochement = RapprochementVerifie | RapprochementAVerifier;

/**
 * Lien vers un autre objet, avec son statut. Un lien vérifié a une `cible` ; un lien à vérifier n'a
 * qu'un `candidat` : l'UI doit tester `statut` avant d'accéder à l'objet, et ne peut donc pas
 * présenter un candidat comme un fait.
 */
export type Lien<T> =
  | { statut: 'verifie'; cible: T; rapprochement: RapprochementVerifie }
  | { statut: 'a_verifier'; candidat: T; rapprochement: RapprochementAVerifier };

// ---------- Synthèses et indicateurs ----------

/**
 * Texte « en clair » produit par le port `Synthetiseur` (titre en clair, résumé, sens du vote,
 * synthèse d'une intervention…). Aucun LLM n'est branché : l'adaptateur `SansSynthese` renvoie
 * toujours null, et l'UI affiche « Pas de synthèse disponible ». Une synthèse n'est jamais un fait.
 */
export type Synthese = string | null;

/** Nombre publié ou compté dans `canon` (amendements déposés, réunions…) : un fait, pas une mesure. */
export interface Chiffre {
  libelle: string;
  /** Nombre, ou valeur textuelle publiée (« Accord », « [TRANCHE] »). */
  valeur: number | string;
  /** Précision affichable (« sur 18 articles »), null sinon. */
  detail?: string | null;
}

/**
 * Mesure comparée : jamais un chiffre sans « par rapport à quoi » (opendata/docs/indicateurs.md). Valeur, dénominateur, référence de comparaison et ce que la donnée ne dit pas.
 */
export interface Indicateur {
  /** « Écarts au groupe », « Participation aux scrutins publics ». */
  libelle: string;
  valeur: number;
  /** pourcentage : 0 à 100 ; points : écart en points de pourcentage. */
  unite: 'nombre' | 'pourcentage' | 'points';
  /** Sur combien : « 21 votes en groupe ». Toujours présent pour un taux. */
  denominateur: { valeur: number; libelle: string } | null;
  /**
   * Par rapport à quoi : « son groupe sur les mêmes scrutins » (62,5 %). `valeur` null quand la
   * référence est nommée mais pas encore calculée (le libellé le dit).
   */
  reference: { libelle: string; valeur: number | null };
  /** Ce que la donnée ne dit pas (déports, main levée, présence en commission…). */
  ceQueLaDonneeNeDitPas: string[];
  periode: Periode | null;
  /** Projection qui le calcule (« lecture.indicateur_ecarts »). */
  calcul: string;
}

export interface Periode {
  debut: string;
  /** null : en cours. */
  fin: string | null;
}

// ---------- Pagination ----------

export interface DemandePage {
  /** À partir de 1. */
  page?: number;
  /** 20 par défaut, 100 au plus (l'API borne). */
  taille?: number;
}

export interface Page<T> {
  elements: T[];
  page: number;
  taille: number;
  /** null quand le compte exact coûterait trop cher (recherche plein texte). */
  total: number | null;
  /** Numéro de la page suivante, null en fin de liste. */
  suivante: number | null;
}

// ---------- Références courtes ----------

export type Chambre = 'AN' | 'SENAT';

/** Lieu d'une étape, d'un vote ou d'un acte : les chambres et les autres acteurs du parcours. */
export type Lieu = Chambre | 'CMP' | 'CC' | 'PR' | 'JO' | 'GOUVERNEMENT';

export interface GroupeRef {
  id: string;
  abrege: string;
  libelle: string;
  /** Toujours remplie (`lecture.couleur_groupe`) ; d'où elle vient : `sourceCouleur`. */
  couleur: string;
  sourceCouleur: SourceCouleur;
  chambre: Chambre;
}

/**
 * officielle : publiée par la chambre ; famille : celle du groupe de l'Assemblée du même parti
 * (table relue, cas sûrs seulement : le Sénat n'en publie aucune) ; gauche_droite : tirée de la
 * position du groupe dans l'hémicycle (sièges publiés), du rouge (gauche) au bleu (droite) ;
 * arbitraire : couleur de secours, stable pour un même groupe. Seule l'officielle est une donnée
 * de la source.
 */
export type SourceCouleur = 'officielle' | 'famille' | 'gauche_droite' | 'arbitraire';

export interface PersonneRef {
  id: string;
  /** Nom affiché (`canon.personne.nom_affiche`). */
  nom: string;
  /** Fonction utile au contexte (« Députée · Groupe C · rapporteure »), null si aucune. */
  fonction: string | null;
  /** Groupe à la date du contexte (vote, intervention), sinon le groupe actuel. */
  groupe: GroupeRef | null;
}

/**
 * Qui parle : une personne reliée de façon certaine, ou seulement le nom publié (commission AN,
 * personne auditionnée) — jamais un rapprochement par le nom.
 */
export type Orateur =
  | { type: 'personne'; personne: PersonneRef; qualite: string | null }
  | { type: 'nom_publie'; nom: string; qualite: string | null };

export interface DossierRef {
  id: string;
  /** Titre court officiel (`titre_court`), sinon le titre. */
  titre: string;
}

export interface AmendementRef {
  id: string;
  /** Numéro tel que publié : « CE123 », « 1876 », « COM-56 ». */
  numero: string;
  chambre: Chambre;
}

/** Article suivi à travers les versions (`canon.article_suivi`). */
export interface ArticleRef {
  id: string;
  /** Numéro dans la version la plus récente : « 3 », « 14 bis », « 1er ». */
  numero: string;
}

export interface OrganisationRef {
  id: string;
  nom: string;
}

/** Ce que l'on peut signaler (« Signaler une erreur ou une source manquante »). */
export type TypeCible =
  | 'dossier'
  | 'etape'
  | 'article'
  | 'amendement'
  | 'scrutin'
  | 'intervention'
  | 'personne'
  | 'institution'
  | 'representant'
  | 'autre';
