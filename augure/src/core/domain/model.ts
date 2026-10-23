// Modèle de lecture de l'app : ce que les écrans affichent, indépendant du schéma opendata.
// Les groupes changent dans le temps (renommages, scissions, départs) : tout est daté,
// et un vote est toujours rattaché au groupe du député *au moment du vote*.

export type Position = 'pour' | 'contre' | 'abstention' | 'non_votant' | 'absent';
export type PositionExprimee = 'pour' | 'contre' | 'abstention';
export type Niveau = 'majeure' | 'standard' | 'technique';
/** ensemble / article_unique : vote final sur un texte de loi. */
export type Nature = 'ensemble' | 'article_unique' | 'article' | 'amendement' | 'motion' | 'autre';
export const NATURES_FINALES: readonly Nature[] = ['ensemble', 'article_unique'];

export interface Groupe {
  ref: string;
  abrege: string;
  libelle: string;
  /** Couleur officielle : une donnée (hémicycle, légende), jamais de l'habillage. */
  couleur: string | null;
}

export interface Decompte {
  pour: number;
  contre: number;
  abstention: number;
}

export interface Legislature {
  numero: string;
  debut: string;
  fin: string;
  scrutins: number;
  /** Base de cette législature présente sur l'appareil (sinon téléchargée à la consultation). */
  installee: boolean;
}

export interface ScrutinResume {
  uid: string;
  numero: number;
  legislature: string;
  date: string;
  nature: Nature;
  /** Titre du texte visé (dossier législatif), ou l'intitulé si aucun texte n'est rattaché. */
  titre: string;
  /** Intitulé officiel du scrutin, repris tel quel (« l'amendement n° 15 de M. X… »). */
  intitule: string;
  lecture: string | null;
  sort: string | null;
  niveau: Niveau | null;
  loiId: string | null;
  decompte: Decompte;
}

export interface MembreAssemblee {
  acteur: string;
  prenom: string;
  nom: string;
  groupe: string | null;
  civilite: string | null;
  departement: string | null;
  circonscription: string | null;
  /** Numéro de siège connu (réel en 17e, partiel avant) : affiché, et sert à ordonner. */
  place: number | null;
  position: Position | null;
}

/** Membre de l'hémicycle avec ses indicateurs sur la législature (calculés par opendata). */
export interface MembreHemicycle extends MembreAssemblee {
  /** Votes exprimés / scrutins tenus pendant le mandat (0 à 1). */
  presence: number | null;
  /** Votes exprimés différents de la majorité de son groupe. */
  ecarts: number;
}

export interface GroupeSiegeant extends Groupe {
  sieges: number;
}

export interface Assemblee {
  legislature: string;
  date: string;
  /** De la gauche vers la droite de l'hémicycle, à cette date. */
  groupes: GroupeSiegeant[];
  /** Dans l'ordre des sièges, de la gauche vers la droite. */
  membres: MembreHemicycle[];
  scrutin: ScrutinResume | null;
}

export interface StatsGroupe {
  /** Participation moyenne des membres aux scrutins publics de la législature (0 à 1). */
  presence: number | null;
  /** Part des scrutins où au moins 90 % des votes exprimés du groupe sont identiques (0 à 1). */
  voteUni: number | null;
}

export interface VoteDeGroupe {
  scrutin: ScrutinResume;
  ligne: PositionExprimee | null;
  decompte: Decompte;
  membres: number;
}

export interface Alliance {
  groupe: Groupe;
  /** Part des scrutins où les deux groupes ont eu la même position majoritaire (0 à 1). */
  accord: number;
  scrutins: number;
}

export interface MembreDeGroupe {
  acteur: string;
  prenom: string;
  nom: string;
  departement: string | null;
  circonscription: string | null;
  /** Participation sur la législature (0 à 1), null sans scrutin. */
  presence: number | null;
  ecarts: number;
}

export interface ThemeDeGroupe {
  theme: string;
  /** Position majoritaire du groupe, par scrutin du thème, sur 12 mois. */
  decompte: Decompte;
  /** Scrutins sans ligne commune (égalité) ou sans vote du groupe. */
  sansLigne: number;
  dernier: { scrutin: ScrutinResume; ligne: PositionExprimee } | null;
}

export interface FicheGroupe {
  groupe: Groupe;
  legislature: string;
  /** Date de référence : dernier scrutin où le groupe existait. */
  date: string;
  periode: { debut: string; fin: string };
  sieges: number;
  stats: StatsGroupe & {
    /** Part des votes individuels des membres différents de la ligne du groupe (0 à 1). */
    ecartsInternes: number | null;
    /** Motions de censure votées par au moins la moitié des membres, sur toutes celles de la législature. */
    motions: { soutenues: number; total: number };
  };
  alliances: Alliance[];
  /** Participation du groupe, mois par mois (12 derniers mois d'activité). */
  presenceMensuelle: { mois: string; presence: number }[];
  composition: { femmes: number; hommes: number; arrivees: number; departs: number };
  themes: ThemeDeGroupe[];
  derniersVotes: VoteDeGroupe[];
  membres: MembreDeGroupe[];
}

export interface EnClair {
  resume: string;
  pour: string;
  contre: string;
}

export interface PositionDeGroupe {
  groupe: Groupe;
  ligne: PositionExprimee | null;
  decompte: Decompte;
  membres: number;
}

export interface FicheScrutin {
  scrutin: ScrutinResume;
  absents: number;
  nonVotants: number;
  groupes: PositionDeGroupe[];
  enClair: EnClair | null;
  lienOfficiel: string;
  depute: { acteur: string; prenom: string; nom: string; position: Position; ecart: boolean } | null;
}

export interface VoteDepute {
  scrutin: ScrutinResume;
  position: Position;
  /** Groupe au moment du vote. */
  groupe: Groupe | null;
  ligneGroupe: PositionExprimee | null;
  ecart: boolean;
  theme: string;
}

export interface PeriodeGroupe {
  groupe: Groupe;
  debut: string;
  fin: string | null;
}

export interface Bilan {
  total: number;
  commeGroupe: number;
  ecarts: number;
  absences: number;
}

export interface FicheDepute {
  acteur: string;
  civilite: string | null;
  prenom: string;
  nom: string;
  departement: string | null;
  circonscription: string | null;
  legislature: string;
  /** Groupe à la fin de la période observée. */
  groupe: Groupe | null;
  /** Parcours de groupe pendant la période observée, du plus ancien au plus récent. */
  parcours: PeriodeGroupe[];
  periode: { debut: string; fin: string };
  bilan: Bilan;
  votes: VoteDepute[];
}

export interface DeputeTrouve {
  acteur: string;
  prenom: string;
  nom: string;
  legislature: string;
  groupe: Groupe | null;
  departement: string | null;
  numDepartement: string | null;
  circonscription: string | null;
}

export interface ResultatRecherche {
  deputes: DeputeTrouve[];
  scrutins: ScrutinResume[];
}

/** Tout ce qu'on peut explorer dans une législature, pour la recherche par types. */
export interface Catalogue {
  legislature: string;
  deputes: DeputeTrouve[];
  groupes: GroupeSiegeant[];
  themes: { theme: string; scrutins: number }[];
  territoires: { departement: string; numero: string | null; deputes: number }[];
  scrutins: number;
}

/** Activité d'un député sur un thème, sur la période des Champions. */
export interface ActiviteTheme {
  /** Scrutins du thème pendant son mandat. */
  scrutins: number;
  /** Sans vote enregistré. */
  absences: number;
  exprimes: number;
  pour: number;
  ecarts: number;
}

export interface Champions {
  legislature: string;
  periode: { debut: string; fin: string };
  themes: string[];
  deputes: {
    acteur: string;
    prenom: string;
    nom: string;
    groupe: Groupe | null;
    parTheme: Record<string, ActiviteTheme>;
  }[];
}

/** État de la base d'une législature après ouverture (et mise à jour si possible). */
export interface EtatBase {
  legislature: string;
  version: number;
  date: string;
  schema: string;
  origine: 'locale' | 'correctifs' | 'complete';
  nouveautes: Nouveaute[];
  /** Mise à jour impossible mais une base locale existe : l'app reste utilisable. */
  avertissement: string | null;
}

export interface Nouveaute {
  loi: string | null;
  titre: string | null;
  date: string;
  evenement: string;
  detail: string | null;
}
