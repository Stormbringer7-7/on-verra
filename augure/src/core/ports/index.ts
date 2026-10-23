// Ports : ce dont le cœur a besoin, sans dire comment c'est fait.
// Les adapters (src/infra) les implémentent pour Expo, le web ou Node (tests).

import type { FichierPublie, IndexPublication, Manifeste, PartitionPubliee } from '../domain/publication';
import type {
  Alliance,
  DeputeTrouve,
  EnClair,
  FicheGroupe,
  Groupe,
  MembreAssemblee,
  Nature,
  PeriodeGroupe,
  PositionDeGroupe,
  ScrutinResume,
  VoteDepute,
} from '../domain/model';

// ---------- Stockage SQL ----------

export type SqlValue = string | number | null;
export type SqlParams = Record<string, SqlValue>;

export interface SqlDatabase {
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
  /** Exécute les instructions dans une transaction : tout ou rien. */
  transaction(statements: string[]): Promise<void>;
  close(): Promise<void>;
}

/**
 * Bases locales, une par législature (la clé de partition de on-verra).
 * Sur mobile, des fichiers : un correctif appliqué est enregistré. Sur le web, la mémoire.
 */
export interface LocalDatabases {
  /** Législatures dont une copie locale existe. */
  installees(): Promise<string[]>;
  ouvrir(legislature: string): Promise<SqlDatabase | null>;
  /** Remplace la copie locale par cette base (fichier .db compressé en gzip) et l'ouvre. */
  installer(legislature: string, gzip: Uint8Array): Promise<SqlDatabase>;
}

// ---------- Publication on-verra (fichiers statiques, sans API) ----------

export interface PublicationSource {
  readonly configured: boolean;
  index(): Promise<IndexPublication>;
  manifeste(partition: PartitionPubliee): Promise<Manifeste>;
  /** Fichier vérifié (taille, SHA-256) puis décompressé : pour les correctifs, petits. */
  telecharger(partition: PartitionPubliee, f: FichierPublie): Promise<Uint8Array>;
  /** Fichier vérifié, encore compressé : pour les bases, décompressées par LocalDatabases. */
  telechargerCompresse(partition: PartitionPubliee, f: FichierPublie): Promise<Uint8Array>;
}

// ---------- Lecture des données parlementaires ----------

export interface MetaBase {
  version: number;
  date: string;
  schema: string;
}

export interface FiltreScrutins {
  natures?: readonly Nature[];
  niveau?: string;
  resultat?: 'adopte' | 'rejete';
  limite: number;
}

/**
 * Accès aux données parlementaires d'une législature (une partition on-verra).
 * L'adapter actuel lit le schéma on-verra ; quand il évoluera, seul l'adapter change.
 */
export interface ParlementRepository {
  meta(): Promise<MetaBase>;
  dernierScrutin(): Promise<ScrutinResume | null>;
  scrutin(uid: string): Promise<ScrutinResume | null>;
  scrutins(filtre: FiltreScrutins): Promise<ScrutinResume[]>;
  /** Députés en fonction à la date, avec leur groupe du jour. */
  membres(date: string): Promise<MembreAssemblee[]>;
  groupes(refs: string[]): Promise<Groupe[]>;
  positionsDuScrutin(uid: string): Promise<Map<string, { position: MembreAssemblee['position']; groupe: string | null }>>;
  positionsDesGroupes(uid: string): Promise<PositionDeGroupe[]>;
  sansVote(uid: string): Promise<string[]>;
  /** `fin` : dernier jour d'existence d'un groupe dissous ou renommé, null s'il existe encore. */
  groupe(ref: string): Promise<(Groupe & { fin: string | null }) | null>;
  derniersVotesDuGroupe(ref: string, limite: number): Promise<FicheGroupe['derniersVotes']>;
  presence(acteurs: string[]): Promise<number | null>;
  voteUni(ref: string): Promise<number | null>;
  depute(acteur: string): Promise<{
    acteur: string;
    civilite: string | null;
    prenom: string;
    nom: string;
    departement: string | null;
    circonscription: string | null;
  } | null>;
  /** Scrutins où il était en fonction, entre deux dates, sans le thème (ajouté par le cœur). */
  votesDuDepute(acteur: string, debut: string, fin: string): Promise<Omit<VoteDepute, 'theme' | 'ecart'>[]>;
  parcours(acteur: string): Promise<PeriodeGroupe[]>;
  dernierVoteDuDepute(acteur: string): Promise<string | null>;
  /** Tous les députés de la législature, avec leur dernier groupe. */
  deputes(): Promise<DeputeTrouve[]>;

  // Groupe
  alliances(ref: string): Promise<Alliance[]>;
  /** Participation du groupe par mois (« 2026-03 »), du plus récent au plus ancien. */
  presenceMensuelle(ref: string, mois: number): Promise<{ mois: string; presence: number }[]>;
  /** Motions de censure votées par au moins `seuil` membres du groupe. */
  motionsSoutenues(ref: string, seuil: number): Promise<{ soutenues: number; total: number }>;
  /** Participation et écarts par député sur la législature (calculés par on-verra). */
  indicateurs(acteurs: string[]): Promise<Map<string, IndicateursDepute>>;
  mouvements(ref: string): Promise<{ arrivees: number; departs: number }>;
  votesDuGroupe(ref: string, debut: string, fin: string): Promise<FicheGroupe['derniersVotes']>;

  // Recherche et Champions
  /** Nombre de scrutins par titre de texte (ou intitulé), pour les thèmes. */
  titres(): Promise<{ titre: string; scrutins: number }[]>;
  /** Votes agrégés par député et par texte visé (`cle`), entre deux dates. */
  activite(debut: string, fin: string): Promise<ActiviteBrute[]>;
  /** Scrutins entre deux dates : date et texte visé, pour compter ceux tenus pendant un mandat. */
  scrutinsEntre(debut: string, fin: string): Promise<{ date: string; cle: string; titre: string }[]>;
  mandats(): Promise<{ acteur: string; debut: string; fin: string | null }[]>;
  /** Tous les scrutins, du plus récent au plus ancien, de quoi les filtrer en mémoire (recherche). */
  entreesRecherche(): Promise<EntreeRecherche[]>;
  /** Scrutins demandés, dans l'ordre des identifiants donnés. */
  scrutinsParUid(uids: string[]): Promise<ScrutinResume[]>;
}

export interface EntreeRecherche {
  uid: string;
  date: string;
  nature: Nature;
  sort: string | null;
  niveau: string | null;
  /** Titre du texte visé, ou l'intitulé du scrutin sans texte. */
  titre: string;
  intitule: string;
}

export interface IndicateursDepute {
  scrutins: number;
  empeches: number;
  exprimes: number;
  exprimesEnGroupe: number;
  dissidences: number;
}

export interface ActiviteBrute {
  acteur: string;
  cle: string;
  titre: string;
  /** Lignes de vote (exprimés et non-votants). */
  votes: number;
  exprimes: number;
  pour: number;
  ecarts: number;
}

// ---------- Enrichissements remplaçables ----------

/** Thème d'un texte à partir de son titre. */
export interface ThemeClassifier {
  readonly themes: readonly string[];
  classer(titre: string): string;
}

/** Résumé « En clair » neutre et relu ; null tant qu'aucun n'est rédigé. */
export interface EnClairProvider {
  pour(scrutin: ScrutinResume): Promise<EnClair | null>;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
}
