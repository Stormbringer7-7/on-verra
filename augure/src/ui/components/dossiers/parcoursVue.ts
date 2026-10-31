// Présentation de la fiche Dossier (maquette v3 : planches « Dossier », « DossierTypes »,
// « DossierTexte », « DossierAmendements », « SousDossier »), sans React (testée sous Node) :
// icône de chaque lieu, étape, événement et type ; nœuds du rail (« Seulement les décisions ») ;
// ce que chaque modèle de parcours montre (sections, chiffres clés, bloc) ; statut « depuis le … » ;
// étiquettes (49.3, censure) ; chronologie des amendements ; votes clés ; effet d'un sous-dossier.
// Règles de fond : une valeur absente est une marque visible (« [n] », « [jj/mm] »), jamais une
// valeur inventée ; une étape sans objet n'est jamais un échec.

import type {
  AmendementResume,
  CaseParcours,
  Chiffre,
  CleCase,
  DeviationParcours,
  DossierLie,
  EtapeResume,
  FamilleParcours,
  FicheDossier,
  ModeleParcours,
  NatureEtape,
  Parcours,
  ScrutinResume,
  SortAmendement,
  StatAmendementsEtape,
  VoteRattache,
} from '@/core';
import { date, dateCourte, jourMois, nombre } from '../../format';
import type { NomIcone } from '../Icone';
import { joursEntre, quandEtape } from '../commun/statuts';
import { etatDossier } from './presentation';

// ---------- Marques de donnée absente ----------

export const INCONNU = '[n]';
export const DATE_INCONNUE = '[jj/mm]';
export const A_CALCULER = '[à calculer]';

// ---------- Icônes ----------

/** Icône du lieu ou de l'étape (planche « Icônes ») : le cercle du nœud la porte. */
export function iconeEtape(c: Pick<CaseParcours, 'cle' | 'lieu'>, modele: string | null = null): NomIcone {
  const k = c.cle;
  if (k === 'depot') return 'depot';
  if (k.startsWith('transmission')) return 'transmission';
  if (k === 'commission_ae') return 'europe';
  if (k.startsWith('commission')) return 'commission';
  if (k === 'cmp' || k === 'conclusions_cmp') return 'cmp';
  if (k === 'cc') return 'cc';
  if (k === 'promulgation' || k === 'promulgation_jo' || k === 'jo') return 'jo';
  if (k === 'congres') return 'congres';
  if (k === 'referendum') return 'urne';
  if (k === 'recueil') return 'soutiens';
  if (k === 'haute_cour') return 'hautecour';
  if (k === 'declaration') return 'declaration';
  if (k === 'motion') return 'censure';
  if (k === 'vote') return 'urne';
  if (k === 'creation') return modele === 'mission_information' ? 'mission' : 'enquete';
  if (k === 'nomination') return 'membres';
  if (k === 'rapport') return 'rapport';
  if (k === 'allocution') return 'micro';
  switch (c.lieu) {
    case 'AN':
      return 'an';
    case 'SENAT':
      return 'senat';
    case 'CMP':
      return 'cmp';
    case 'CC':
      return 'cc';
    case 'PR':
    case 'JO':
      return 'jo';
    case 'GOUVERNEMENT':
      return 'declaration';
    default:
      // Étape des deux chambres (nouvelle lecture, lectures suivantes, examen) : la navette.
      return 'navette';
  }
}

const ICONES_DEVIATION: Record<string, NomIcone> = {
  engagement_responsabilite: 'e493',
  motion_censure: 'censure',
  motion_referendaire: 'mref',
  procedure_acceleree: 'accel',
  motion_procedure: 'proc',
  irrecevabilite: 'irrec',
  retrait: 'retrait',
  retrait_ordre_du_jour: 'odj',
  caducite: 'caduc',
  fusion: 'fusion',
};

/** Icône d'un événement du parcours ; à défaut, celle de son effet. */
export const iconeDeviation = (d: Pick<DeviationParcours, 'cle' | 'effet'>): NomIcone => ICONES_DEVIATION[d.cle] ?? d.effet;

/** Libellé court d'un événement sur le rail (« 49.3 »), son libellé sinon. */
export const libelleCourtDeviation = (d: Pick<DeviationParcours, 'cle' | 'libelle'>) =>
  d.cle === 'engagement_responsabilite' ? '49.3' : d.libelle;

// ---------- Modèles de parcours (planche « DossierTypes ») ----------

/** Sections d'une fiche Dossier, selon son modèle. */
export type SectionDossier =
  | 'parcours'
  | 'texte'
  | 'amendements'
  | 'scrutins'
  | 'acteurs'
  | 'accord'
  | 'soutiens'
  | 'acte_europeen'
  | 'membres'
  | 'auditions'
  | 'rapport'
  | 'discours'
  | 'interventions';

export const LIBELLE_SECTION: Record<SectionDossier, string> = {
  parcours: 'Parcours',
  texte: 'Texte',
  amendements: 'Amendements',
  scrutins: 'Scrutins clés',
  acteurs: 'Acteurs',
  accord: 'L’accord',
  soutiens: 'Soutiens',
  acte_europeen: 'Acte européen',
  membres: 'Membres',
  auditions: 'Auditions',
  rapport: 'Rapport',
  discours: 'Discours',
  interventions: 'Interventions',
};

export const ICONE_SECTION: Record<SectionDossier, NomIcone> = {
  parcours: 'navette',
  texte: 'depot',
  amendements: 'reglement',
  scrutins: 'urne',
  acteurs: 'membres',
  accord: 'traite',
  soutiens: 'soutiens',
  acte_europeen: 'europe',
  membres: 'membres',
  auditions: 'micro',
  rapport: 'rapport',
  discours: 'micro',
  interventions: 'declaration',
};

/**
 * Sections qui ont une donnée dans le contrat (`FicheDossier`). Les autres (soutiens, auditions,
 * acte européen…) s'affichent avec la marque « Non publié ».
 */
export const SECTIONS_PUBLIEES: readonly SectionDossier[] = ['parcours', 'texte', 'amendements', 'scrutins', 'acteurs', 'membres'];

/** Chiffre clé d'un modèle : lu dans la fiche, calculé, fixé par la règle, ou à lire en base. */
export type ChiffreCle =
  | { cle: 'amendements_deposes' | 'amendements_adoptes' | 'votes_publics' | 'jours' | 'cosignataires' | 'articles'; libelle?: string }
  /** Seuil fixé par la Constitution (« 3/5 au Congrès ») : une règle, pas une donnée. */
  | { cle: 'regle'; valeur: string; libelle: string }
  /** Donnée que le contrat ne fournit pas : `[n]`, suivi d'un plafond éventuel (« [n] / 40 »). */
  | { cle: 'a_lire'; sur?: string; libelle: string }
  /** Donnée qu'aucune source chargée ne publie (soutiens d'un RIP) : `[n]`, dit « absent des sources ». */
  | { cle: 'absent'; sur?: string; libelle: string }
  /** Membres publiés de l'organe (chiffre « Membres » de la fiche), `[n]` sinon. */
  | { cle: 'membres'; libelle?: string }
  /**
   * Jours de la 1re lecture dans une chambre, lus dans les dates des cases : du dépôt (chambre de
   * dépôt) ou de la transmission (l'autre) à la fin de la séance, sinon à la transmission suivante,
   * sinon au jour de référence si elle est en cours. `sur` : délai de la Constitution (art. 47, 47-1).
   */
  | { cle: 'jours_chambre'; chambre: 'AN' | 'SENAT'; sur?: string; libelle: string }
  /** Jours du dépôt à la dernière étape faite au Parlement (hors Conseil constitutionnel, promulgation, JO), ou à aujourd'hui. */
  | { cle: 'jours_parlement'; sur?: string; libelle: string };

export interface TypeDossier {
  icone: NomIcone;
  sections: SectionDossier[];
  chiffres: ChiffreCle[];
  /** Bloc sous les chiffres : une règle du modèle, ou une donnée que l'écran n'a pas (`publie: false`). */
  bloc?: { titre: string; texte: string; publie: boolean };
}

const LEG: SectionDossier[] = ['parcours', 'texte', 'amendements', 'scrutins', 'acteurs'];
const CHIFFRES_LOI: ChiffreCle[] = [{ cle: 'amendements_deposes' }, { cle: 'amendements_adoptes' }, { cle: 'votes_publics' }, { cle: 'jours' }];

/** Les 20 modèles de `opendata/parcours`, par clé de modèle. */
export const TYPES_DOSSIER: Record<string, TypeDossier> = {
  loi_ordinaire: { icone: 'depot', sections: LEG, chiffres: CHIFFRES_LOI },
  loi_organique: {
    icone: 'organique',
    sections: LEG,
    chiffres: [
      { cle: 'amendements_deposes' },
      { cle: 'votes_publics' },
      { cle: 'regle', valeur: '289', libelle: 'voix requises au dernier mot (majorité absolue)' },
      { cle: 'jours' },
    ],
  },
  loi_finances: {
    icone: 'budget',
    sections: LEG,
    chiffres: [
      { cle: 'jours_chambre', chambre: 'AN', sur: '40', libelle: 'jours à l’Assemblée' },
      { cle: 'jours_chambre', chambre: 'SENAT', sur: '15', libelle: 'jours au Sénat' },
      { cle: 'jours_parlement', sur: '70', libelle: 'jours au total' },
      { cle: 'amendements_deposes' },
    ],
  },
  loi_financement_securite_sociale: {
    icone: 'sante',
    sections: LEG,
    chiffres: [
      { cle: 'jours_chambre', chambre: 'AN', sur: '20', libelle: 'jours à l’Assemblée' },
      { cle: 'jours_chambre', chambre: 'SENAT', sur: '15', libelle: 'jours au Sénat' },
      { cle: 'jours_parlement', sur: '50', libelle: 'jours au total' },
      { cle: 'amendements_deposes' },
    ],
  },
  revision_constitutionnelle: {
    icone: 'congres',
    sections: LEG,
    chiffres: [{ cle: 'a_lire', libelle: 'lectures' }, { cle: 'regle', valeur: '3/5', libelle: 'au Congrès' }, { cle: 'amendements_deposes' }, { cle: 'jours' }],
  },
  traite: {
    icone: 'traite',
    sections: ['parcours', 'accord', 'scrutins', 'acteurs'],
    chiffres: [{ cle: 'regle', valeur: '1', libelle: 'article unique' }, { cle: 'votes_publics' }],
    bloc: { titre: 'L’accord ratifié', texte: 'Texte de l’accord, parties, date de signature', publie: false },
  },
  referendum_initiative_partagee: {
    icone: 'urne',
    sections: ['parcours', 'texte', 'soutiens', 'acteurs'],
    chiffres: [
      { cle: 'a_lire', sur: '185', libelle: 'parlementaires (1/5)' },
      { cle: 'absent', libelle: 'soutiens d’électeurs, 1/10 requis' },
      { cle: 'a_lire', libelle: 'jours restants sur 9 mois' },
    ],
    bloc: {
      titre: 'Soutiens recueillis',
      texte: 'Décompte publié par le ministère de l’Intérieur : absent des sources chargées',
      publie: true,
    },
  },
  resolution: { icone: 'resolution', sections: ['parcours', 'texte', 'scrutins', 'acteurs'], chiffres: [{ cle: 'cosignataires' }, { cle: 'votes_publics' }] },
  resolution_34_1: {
    icone: 'resolution',
    sections: ['parcours', 'texte', 'scrutins'],
    chiffres: [{ cle: 'cosignataires' }, { cle: 'a_lire', libelle: 'pour' }, { cle: 'a_lire', libelle: 'contre' }],
  },
  resolution_europeenne: {
    icone: 'europe',
    sections: ['parcours', 'texte', 'acte_europeen', 'scrutins'],
    chiffres: [{ cle: 'cosignataires' }, { cle: 'votes_publics' }],
    bloc: { titre: 'L’acte européen visé', texte: 'Référence COM et intitulé', publie: false },
  },
  resolution_reglement: {
    icone: 'reglement',
    sections: LEG,
    chiffres: [{ cle: 'a_lire', libelle: 'articles du règlement modifiés' }, { cle: 'amendements_deposes', libelle: 'amendements' }],
  },
  motion_referendaire: {
    icone: 'urne',
    sections: ['parcours', 'scrutins', 'acteurs'],
    chiffres: [{ cle: 'cosignataires', libelle: 'signataires' }, { cle: 'votes_publics' }],
  },
  haute_cour: {
    icone: 'hautecour',
    sections: ['parcours', 'texte', 'scrutins', 'acteurs'],
    chiffres: [{ cle: 'regle', valeur: '2/3', libelle: 'requis dans chaque chambre' }, { cle: 'a_lire', sur: '15', libelle: 'jours pour l’autre chambre' }],
  },
  commission_enquete: {
    icone: 'enquete',
    sections: ['parcours', 'membres', 'auditions', 'rapport'],
    chiffres: [{ cle: 'membres' }, { cle: 'a_lire', libelle: 'auditions' }, { cle: 'a_lire', sur: '6', libelle: 'mois écoulés' }],
  },
  prerogatives_enquete: { icone: 'enquete', sections: ['parcours', 'scrutins'], chiffres: [{ cle: 'a_lire', libelle: 'mois accordés' }] },
  mission_information: {
    icone: 'mission',
    sections: ['parcours', 'membres', 'auditions', 'rapport'],
    chiffres: [{ cle: 'membres' }, { cle: 'a_lire', libelle: 'auditions' }],
  },
  rapport_information: {
    icone: 'rapport',
    sections: ['parcours', 'rapport', 'acteurs'],
    chiffres: [{ cle: 'a_lire', libelle: 'pages' }, { cle: 'a_lire', libelle: 'auditions' }],
    bloc: { titre: 'Une seule étape', texte: 'Le rapport est l’acte : pas de parcours au-delà.', publie: true },
  },
  petition: { icone: 'petition', sections: ['parcours', 'texte', 'rapport'], chiffres: [{ cle: 'a_lire', libelle: 'signatures' }, { cle: 'jours' }] },
  responsabilite_gouvernement: {
    icone: 'censure',
    sections: ['parcours', 'scrutins', 'interventions'],
    chiffres: [{ cle: 'a_lire', sur: '58', libelle: 'signataires requis' }, { cle: 'a_lire', sur: '289', libelle: 'voix pour la censure' }],
    bloc: {
      titre: 'Trois cas, un modèle',
      texte: '49.1 déclaration de politique générale · 49.2 motion spontanée · 49.3 rattaché au texte (sous-dossier)',
      publie: true,
    },
  },
  allocution: {
    icone: 'micro',
    sections: ['parcours', 'discours'],
    chiffres: [{ cle: 'a_lire', libelle: 'minutes' }, { cle: 'a_lire', libelle: 'mots' }],
    bloc: { titre: 'Discours, verbatim', texte: 'Compte rendu de la séance', publie: false },
  },
};

const PAR_FAMILLE: Record<FamilleParcours, string> = {
  legislatif: 'loi_ordinaire',
  resolution: 'resolution',
  controle: 'rapport_information',
  gouvernement: 'responsabilite_gouvernement',
  autre: 'allocution',
};

/** Ce que montre la fiche d'un dossier selon son modèle (sa famille à défaut, une loi sans parcours). */
export function typeDossier(modele: ModeleParcours | null | undefined): TypeDossier {
  if (!modele) return TYPES_DOSSIER.loi_ordinaire;
  return TYPES_DOSSIER[modele.cle] ?? TYPES_DOSSIER[PAR_FAMILLE[modele.famille]];
}

/** Icône du type (en-tête) : celle du modèle ; sans parcours, d'après le libellé publié. */
export function iconeType(modele: ModeleParcours | null | undefined, libelle: string): NomIcone {
  if (modele) return typeDossier(modele).icone;
  if (/financement de la s[ée]curit[ée] sociale/i.test(libelle)) return 'sante';
  if (/finances/i.test(libelle)) return 'budget';
  if (/organique/i.test(libelle)) return 'organique';
  if (/constitutionnelle/i.test(libelle)) return 'congres';
  if (/r[ée]solution/i.test(libelle)) return 'resolution';
  return 'depot';
}

// ---------- Chiffres clés ----------

const chercher = (chiffres: Chiffre[], motif: RegExp) => chiffres.find((c) => motif.test(c.libelle));
const valeur = (v: number | string) => (typeof v === 'number' ? nombre(v) : v);

/** Date de promulgation (case faite), si le parcours la donne. */
function datePromulgation(p: Parcours | null): string | null {
  const c = p?.cases.find((x) => ['promulgation', 'promulgation_jo', 'jo'].includes(x.cle) && x.etat === 'faite');
  return c ? (c.fin ?? c.debut) : null;
}

/** Valeur et libellé d'un chiffre clé : lu dans la fiche, calculé, ou la marque `[n]`. */
export function chiffreCle(k: ChiffreCle, f: FicheDossier): { valeur: string; libelle: string } {
  switch (k.cle) {
    case 'regle':
      return { valeur: k.valeur, libelle: k.libelle };
    case 'a_lire':
      return { valeur: k.sur ? `${INCONNU} / ${k.sur}` : INCONNU, libelle: k.libelle };
    case 'absent':
      return { valeur: k.sur ? `${INCONNU} / ${k.sur}` : INCONNU, libelle: `${k.libelle} · absent des sources` };
    case 'membres': {
      const c = chercher(f.chiffres, /^membres$/i);
      return { valeur: c ? valeur(c.valeur) : INCONNU, libelle: k.libelle ?? 'membres' };
    }
    case 'jours_chambre':
    case 'jours_parlement': {
      const n = k.cle === 'jours_chambre' ? joursChambre(f.parcours, k.chambre) : joursParlement(f.parcours);
      const v = n === null ? INCONNU : nombre(n);
      return { valeur: k.sur ? `${v} / ${k.sur}` : v, libelle: k.libelle };
    }
    case 'amendements_deposes': {
      const c = chercher(f.chiffres, /amendements d[ée]pos[ée]s/i);
      const somme = f.amendements.parEtape.length ? f.amendements.parEtape.reduce((s, e) => s + e.deposes, 0) : null;
      return { valeur: c ? valeur(c.valeur) : somme !== null ? nombre(somme) : INCONNU, libelle: k.libelle ?? 'amendements déposés' };
    }
    case 'amendements_adoptes': {
      const c = chercher(f.chiffres, /amendements adopt[ée]s/i);
      const somme = f.amendements.parEtape.length ? f.amendements.parEtape.reduce((s, e) => s + e.adoptes, 0) : null;
      return { valeur: c ? valeur(c.valeur) : somme !== null ? nombre(somme) : INCONNU, libelle: k.libelle ?? 'amendements adoptés' };
    }
    case 'votes_publics':
      // La fiche liste tous les scrutins publics du dossier, dans les deux chambres.
      return { valeur: nombre(f.scrutins.length), libelle: k.libelle ?? 'votes publics' };
    case 'cosignataires':
      return { valeur: nombre(f.entete.cosignataires), libelle: k.libelle ?? 'cosignataires' };
    case 'articles':
      return { valeur: f.articles.length ? nombre(f.articles.length) : INCONNU, libelle: k.libelle ?? 'articles' };
    case 'jours': {
      const depot = f.entete.dateDepot;
      const loi = datePromulgation(f.parcours);
      const jour = loi ?? f.parcours?.dateReference ?? null;
      const libelle = loi ? 'jours du dépôt à la loi' : 'jours depuis le dépôt';
      return { valeur: depot && jour ? nombre(Math.max(0, joursEntre(depot, jour))) : INCONNU, libelle: k.libelle ?? libelle };
    }
  }
}

const HORS_PARLEMENT = new Set(['cc', 'promulgation', 'promulgation_jo', 'jo']);

/**
 * Jours de la 1re lecture dans une chambre (cf. `ChiffreCle` jours_chambre) ; null si une date
 * manque. Chambre de dépôt : cases `depot` → `seance_1_o` ; l'autre : `transmission_1_s` → `seance_1_s`.
 */
export function joursChambre(p: Parcours | null, chambre: 'AN' | 'SENAT'): number | null {
  if (!p?.origine) return null;
  const cote = p.origine === chambre ? 'o' : 's';
  const par = (cle: string) => p.cases.find((c) => c.cle === cle);
  const debut = (cote === 'o' ? par('depot') : par('transmission_1_s'))?.debut ?? null;
  const seance = par(`seance_1_${cote}`);
  const suite = cote === 'o' ? par('transmission_1_s') : null;
  const fin =
    seance?.etat === 'faite' && seance.fin
      ? seance.fin
      : suite && (suite.etat === 'faite' || suite.etat === 'en_cours') && suite.debut
        ? suite.debut
        : seance && (seance.etat === 'en_cours' || seance.courante)
          ? p.dateReference
          : null;
  return debut && fin ? Math.max(0, joursEntre(debut, fin)) : null;
}

/** Jours du dépôt à la fin de la dernière case faite au Parlement, ou au jour de référence s'il y est encore. */
export function joursParlement(p: Parcours | null): number | null {
  const debut = p?.cases.find((c) => c.cle === 'depot')?.debut ?? null;
  if (!p || !debut) return null;
  const parlement = p.cases.filter((c) => !HORS_PARLEMENT.has(c.cle));
  const enCours = parlement.some((c) => c.courante || c.etat === 'en_cours');
  const fins = parlement.flatMap((c) => (c.etat === 'faite' && c.fin ? [c.fin] : [])).sort();
  const fin = enCours ? p.dateReference : (fins.at(-1) ?? null);
  return fin ? Math.max(0, joursEntre(debut, fin)) : null;
}

export const chiffresCles = (f: FicheDossier) => typeDossier(f.parcours?.modele).chiffres.map((k) => chiffreCle(k, f));

// ---------- En-tête ----------

const ETATS_EN_COURS = new Set([null, 'en_cours']);

/** « Ce qu'elle propose » (une proposition), « Ce qu'il proposait » (un projet terminé). */
export function titreProposition(f: FicheDossier): string {
  const elle = f.entete.nature === 'proposition' || /^proposition/i.test(f.entete.type);
  const passe = !ETATS_EN_COURS.has(f.entete.etat);
  return `Ce qu’${elle ? 'elle' : 'il'} propos${passe ? 'ait' : 'e'}`;
}

/**
 * Statut du dossier et depuis quand : l'étape courante (« Conseil constitutionnel depuis le
 * 17/10/2026 (7 jours) »), sinon la dernière étape faite pour un dossier terminé, sinon le dépôt.
 * Une date absente garde sa place : « depuis le [jj/mm/aaaa] ».
 */
export function statutDossier(f: FicheDossier): { libelle: string; depuis: string } {
  const p = f.parcours;
  const courante = p?.cases.find((c) => c.courante);
  const faites = p ? p.cases.filter((c) => c.etat === 'faite') : [];
  const derniere = faites.at(-1);
  let jour: string | null = f.entete.dateDepot;
  let etape: string | null = null;
  if (courante) {
    jour = courante.debut;
    etape = courante.libelle;
  } else if (derniere && !ETATS_EN_COURS.has(f.entete.etat)) {
    jour = derniere.fin ?? derniere.debut;
  } else if (derniere) {
    jour = derniere.fin ?? derniere.debut;
    etape = p?.cases.find((c) => c.attendue) ? 'En attente de l’étape suivante' : null;
  }
  const reference = p?.dateReference ?? null;
  const duree = jour && reference ? Math.max(0, joursEntre(jour, reference)) : null;
  const depuis = `${etape ? `${etape} ` : ''}depuis le ${jour ? date(jour) : '[jj/mm/aaaa]'} (${duree !== null ? nombre(duree) : INCONNU} jour${duree !== null && duree <= 1 ? '' : 's'})`;
  return { libelle: etatDossier(f.entete.etat), depuis };
}

export interface Etiquette {
  libelle: string;
  /** En signal : un événement qui change le cours du texte (49.3, motion, arrêt). */
  signal: boolean;
}

/** Événements marquants en tête de fiche : « 49.3 utilisé 3 fois », procédure accélérée, décision du Conseil. */
export function etiquettesDossier(f: FicheDossier): Etiquette[] {
  const p = f.parcours;
  const etiquettes: Etiquette[] = [];
  const parCle = new Map<string, DeviationParcours[]>();
  for (const d of p?.deviations ?? []) parCle.set(d.cle, [...(parCle.get(d.cle) ?? []), d]);
  for (const [cle, liste] of parCle) {
    const n = liste.length;
    const libelle =
      cle === 'engagement_responsabilite' ? `49.3 utilisé${n > 1 ? ` ${n} fois` : ''}` : `${liste[0].libelle}${n > 1 ? ` ×${n}` : ''}`;
    etiquettes.push({ libelle, signal: cle === 'engagement_responsabilite' || cle === 'motion_censure' || liste[0].effet !== 'rejoint' });
  }
  if (f.entete.procedure === 'acceleree' && !parCle.has('procedure_acceleree')) etiquettes.push({ libelle: 'Procédure accélérée', signal: false });
  const cc = p?.cases.find((c) => c.cle === 'cc' && c.etat === 'faite' && c.conclusion);
  if (cc) etiquettes.push({ libelle: `Conseil constitutionnel : ${cc.conclusion}`, signal: false });
  return etiquettes;
}

// ---------- Rail du parcours ----------

/** Rendu du cercle d'un nœud (planche « Dossier ») : fait, actuel (halo), terminal, attendu, à venir, inconnu. */
export type RenduNoeud = 'fait' | 'actuel' | 'terminal' | 'attendu' | 'a_venir' | 'inconnu';

export interface EvenementNoeud {
  cle: string;
  /** « 49.3 ×2 ». */
  libelle: string;
  icone: NomIcone;
  /** Première occurrence : celle que la feuille de l'événement ouvre. */
  deviation: DeviationParcours;
}

export interface NoeudRail {
  cas: CaseParcours;
  icone: NomIcone;
  rendu: RenduNoeud;
  /** Bordure du cercle d'une étape à venir : prévue (plein), si… (tirets), facultative (points). */
  nature: NatureEtape;
  /** Réunion ou séance intermédiaire, pliée quand on ne garde que les décisions. */
  intermediaire: boolean;
  /** Date courte à droite, la marque `[jj/mm]` pour une étape faite sans date, vide pour l'avenir. */
  date: string;
  /** Lignes sous le titre : conclusion publiée, quand, chiffres, branche prise. */
  lignes: string[];
  evenements: EvenementNoeud[];
  /** Un événement de la case change le cours du texte (cercle en signal). */
  devie: boolean;
  enfants: DossierLie[];
  /** Trait vers le nœud suivant : plein (fait), pointillé (à venir), aucun (dernier, ou arrêt). */
  trait: 'plein' | 'pointille' | 'aucun';
}

const chiffreLisible = (c: Chiffre) => `${c.libelle} : ${valeur(c.valeur)}`;

/**
 * Nœuds du rail, de haut en bas : chaque étape du modèle qui a eu lieu ou peut encore avoir lieu
 * (les sans objet sont masquées). Une étape faite sans conclusion publiée, suivie d'une autre étape
 * du même lieu (commission avant la séance, transmission avant la commission), est intermédiaire :
 * elle se plie sous « Seulement les décisions ». Un événement qui termine arrête le rail.
 */
export function noeudsRail(parcours: Parcours, etapes: EtapeResume[] = []): NoeudRail[] {
  const visibles = parcours.cases.filter((c) => c.etat !== 'sans_objet');
  const jour = parcours.dateReference;
  const parCle = new Map(etapes.map((e) => [e.cle, e]));
  const derniereFaite = [...parcours.cases].reverse().find((c) => c.etat === 'faite');
  const depuis = derniereFaite ? (derniereFaite.fin ?? derniereFaite.debut) : null;
  const termine = !visibles.some((c) => c.courante || c.attendue || c.etat === 'en_cours' || c.etat === 'a_venir');
  const terminal = termine ? [...visibles].reverse().find((c) => c.etat === 'faite') : undefined;

  return visibles.map((c, i) => {
    const suivante = visibles[i + 1];
    const deviations = parcours.deviations.filter((d) => d.etape === c.cle);
    const branches = parcours.branches.filter((b) => b.de === c.cle);
    const enfants = parcours.enfants.filter((e) => e.etape === c.cle);
    const arret = deviations.some((d) => d.effet === 'termine');
    const evenements: EvenementNoeud[] = [];
    for (const d of deviations) {
      const deja = evenements.find((e) => e.cle === d.cle);
      if (deja) continue;
      const n = deviations.filter((x) => x.cle === d.cle).length;
      evenements.push({ cle: d.cle, libelle: `${libelleCourtDeviation(d)}${n > 1 ? ` ×${n}` : ''}`, icone: iconeDeviation(d), deviation: d });
    }
    const rendu: RenduNoeud =
      c.courante || c.etat === 'en_cours'
        ? 'actuel'
        : c === terminal
          ? 'terminal'
          : c.attendue
            ? 'attendu'
            : c.etat === 'faite'
              ? 'fait'
              : c.etat === 'inconnu'
                ? 'inconnu'
                : 'a_venir';
    const intermediaire =
      i > 0 &&
      (c.etat === 'faite' || c.etat === 'inconnu') &&
      !c.conclusion &&
      !c.courante &&
      !!suivante &&
      c.lieu !== null &&
      suivante.lieu === c.lieu &&
      !deviations.length &&
      !branches.length &&
      !enfants.length;
    const le = c.etat === 'en_cours' ? c.debut : (c.fin ?? c.debut);
    const dateNoeud = le ? dateCourte(le) : c.programmeeLe ? dateCourte(c.programmeeLe) : c.etat === 'faite' || c.etat === 'en_cours' ? DATE_INCONNUE : '';
    const lignes = [
      c.conclusion,
      rendu === 'actuel' || rendu === 'attendu' || c.programmeeLe || c.etat === 'inconnu' ? quandEtape(c, jour, depuis) : null,
      ...(parCle.get(c.cle)?.chiffres.map(chiffreLisible) ?? []),
      ...branches.map((b) => `Branche prise : ${b.libelle}`),
    ].filter((l): l is string => !!l);
    const versSuivante = !suivante || arret ? 'aucun' : ['faite', 'en_cours', 'inconnu'].includes(suivante.etat) ? 'plein' : 'pointille';
    return {
      cas: c,
      icone: iconeEtape(c, parcours.modele.cle),
      rendu,
      nature: c.nature,
      intermediaire,
      date: dateNoeud,
      lignes,
      evenements,
      devie: deviations.some((d) => d.effet !== 'rejoint' || d.cle === 'engagement_responsabilite' || d.cle === 'motion_censure'),
      enfants,
      trait: versSuivante,
    };
  });
}

/** Groupes successifs de nœuds : une décision seule, ou une suite d'étapes intermédiaires (un pli). */
export type GroupeRail = { type: 'noeud'; noeud: NoeudRail } | { type: 'pli'; noeuds: NoeudRail[] };

export function groupesRail(noeuds: NoeudRail[]): GroupeRail[] {
  const groupes: GroupeRail[] = [];
  for (const n of noeuds) {
    const dernier = groupes.at(-1);
    if (n.intermediaire && dernier?.type === 'pli') dernier.noeuds.push(n);
    else if (n.intermediaire) groupes.push({ type: 'pli', noeuds: [n] });
    else groupes.push({ type: 'noeud', noeud: n });
  }
  return groupes;
}

/** Sous-titre de l'interrupteur « Seulement les décisions ». */
export function sousTitreDecisions(noeuds: NoeudRail[], decisions: boolean): string {
  const n = noeuds.filter((x) => x.intermediaire).length;
  if (!decisions) return 'Toutes les étapes, réunions et séances comprises';
  return `${n} étape${n > 1 ? 's' : ''} intermédiaire${n > 1 ? 's' : ''} masquée${n > 1 ? 's' : ''}`;
}

// ---------- Texte (planche « DossierTexte ») ----------

/** Les deux versions comparées : le texte déposé et l'étape en cours (ou la dernière étape faite). */
export function versionsComparees(f: FicheDossier): { depose: string; etape: { titre: string; detail: string } } {
  const p = f.parcours;
  const courante = p?.cases.find((c) => c.courante);
  const derniere = p ? [...p.cases].reverse().find((c) => c.etat === 'faite') : undefined;
  const c = courante ?? derniere;
  const le = c ? (courante ? c.debut : (c.fin ?? c.debut)) : null;
  return {
    depose: f.entete.dateDepot ? date(f.entete.dateDepot) : '[jj/mm/aaaa]',
    etape: {
      titre: courante ? 'Étape en cours' : 'Dernière étape',
      detail: c ? `${c.libelle} · ${le ? dateCourte(le) : DATE_INCONNUE}` : `[étape] · ${DATE_INCONNUE}`,
    },
  };
}

/** Comptes des articles depuis le dépôt (états publiés de `ArticleResume`) ; aucun article : à calculer. */
export function comptesArticles(f: FicheDossier): { ajoutes: string; supprimes: string; modifies: string; total: string } {
  const a = f.articles;
  if (!a.length) return { ajoutes: A_CALCULER, supprimes: A_CALCULER, modifies: A_CALCULER, total: INCONNU };
  const n = (etat: string) => nombre(a.filter((x) => x.etat === etat).length);
  return { ajoutes: n('ajoute'), supprimes: n('supprime'), modifies: n('modifie'), total: nombre(a.length) };
}

// ---------- Amendements (planche « DossierAmendements ») ----------

/** Statut d'un amendement dans son cycle de vie (déposé → issue), en clair. */
export const CYCLE_AMENDEMENT: Record<SortAmendement, string> = {
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré par son auteur',
  tombe: 'Tombé',
  non_soutenu: 'Non soutenu',
  irrecevable: 'Irrecevable',
  en_attente: 'En attente d’examen',
};

/** Ce qui s'est passé à l'issue, sur la ligne de vie (« sans objet après l'adoption d'un autre »). */
export const ISSUE_AMENDEMENT: Record<SortAmendement, string> = {
  adopte: 'adopté',
  rejete: 'rejeté',
  retire: 'retiré par son auteur',
  tombe: 'tombé, devenu sans objet',
  non_soutenu: 'non soutenu, non défendu',
  irrecevable: 'déclaré irrecevable',
  en_attente: 'pas encore examiné',
};

export const cycleAmendement = (s: SortAmendement | null) => (s ? CYCLE_AMENDEMENT[s] : 'Sort non publié');
export const issueAmendement = (s: SortAmendement | null) => (s ? ISSUE_AMENDEMENT[s] : 'sort non publié');

export interface EtapeChronologie {
  cas: CaseParcours;
  /** Comptes publiés de l'étape (déposés, adoptés), null si l'étape n'en a pas. */
  stat: StatAmendementsEtape | null;
  amendements: AmendementResume[];
  evenements: DeviationParcours[];
  /** Le parcours s'arrête ici : les amendements restants ne seront pas débattus. */
  arret: boolean;
}

/**
 * Chronologie depuis le dépôt : chaque étape qui a eu lieu (ou en cours, à venir), dans l'ordre,
 * avec ses comptes, ses amendements (page chargée) et ses événements ; puis les étapes qui
 * n'auront pas lieu (sans objet après la dernière étape active, ou après un arrêt).
 */
export function chronologieAmendements(f: FicheDossier): { etapes: EtapeChronologie[]; nAurontPasLieu: string[]; sansEtape: AmendementResume[] } {
  const liste = f.amendements.liste.elements;
  const stats = new Map(f.amendements.parEtape.map((s) => [s.cle, s]));
  const p = f.parcours;
  if (!p) {
    // Sans parcours : les étapes des comptes publiés, dans leur ordre.
    const etapes = f.amendements.parEtape.map((s) => ({
      cas: { cle: s.cle, libelle: s.libelle } as CaseParcours,
      stat: s,
      amendements: liste.filter((a) => a.etape?.cle === s.cle),
      evenements: [],
      arret: false,
    }));
    return { etapes, nAurontPasLieu: [], sansEtape: liste.filter((a) => !a.etape || !stats.has(a.etape.cle)) };
  }
  const derniereActive = p.cases.map((c) => c.etat !== 'sans_objet').lastIndexOf(true);
  const etapes: EtapeChronologie[] = [];
  let arrete = false;
  p.cases.forEach((c, i) => {
    if (c.etat === 'sans_objet' || arrete || i > derniereActive) return;
    const evenements = p.deviations.filter((d) => d.etape === c.cle);
    const arret = evenements.some((d) => d.effet === 'termine');
    etapes.push({ cas: c, stat: stats.get(c.cle) ?? null, amendements: liste.filter((a) => a.etape?.cle === c.cle), evenements, arret });
    if (arret) arrete = true;
  });
  const index = etapes.length ? p.cases.indexOf(etapes.at(-1)!.cas) : -1;
  const nAurontPasLieu = p.cases.slice(index + 1).filter((c) => c.etat === 'sans_objet').map((c) => c.libelle);
  const montrees = new Set(etapes.map((e) => e.cas.cle));
  return { etapes, nAurontPasLieu, sansEtape: liste.filter((a) => !a.etape || !montrees.has(a.etape.cle)) };
}

/** Déviations qui arrêtent le texte avant tout examen restant : un amendement en attente n'y sera jamais débattu. */
const ARRETS_SANS_DEBAT = new Set(['retrait', 'caducite']);

/**
 * Libellé des amendements « en attente » d'une étape : « non débattus » seulement quand c'est sûr
 * (dossier retiré ou caduc, ou retrait, caducité à cette étape) ; « sans sort publié » sur une étape
 * faite (le sort peut ne pas être publié) ; « en attente » sinon.
 */
export function libelleEnAttente(e: Pick<EtapeChronologie, 'cas' | 'evenements'>, etatDossier: FicheDossier['entete']['etat']): string {
  const arrete = etatDossier === 'retire' || etatDossier === 'caduc' || e.evenements.some((d) => d.effet === 'termine' && ARRETS_SANS_DEBAT.has(d.cle));
  if (arrete) return 'non débattus';
  return e.cas.etat === 'faite' ? 'sans sort publié' : 'en attente';
}

const COMPTES_SORT: [SortAmendement, string][] = [
  ['rejete', 'rejetés'],
  ['retire', 'retirés'],
  ['tombe', 'tombés'],
  ['irrecevable', 'irrecevables'],
  ['non_soutenu', 'non soutenus'],
];

/**
 * Comptes d'une étape de la chronologie : déposés, adoptés, puis chaque sort publié ; les « en
 * attente » (libellé selon `libelleEnAttente`) et ceux sans sort du tout. Sans comptes par sort : la marque.
 */
export function comptesEtape(e: EtapeChronologie, etatDossier: FicheDossier['entete']['etat']): { n: string; libelle: string }[] {
  if (!e.stat) return [];
  const base = [
    { n: nombre(e.stat.deposes), libelle: 'déposés' },
    { n: nombre(e.stat.adoptes), libelle: 'adoptés' },
  ];
  const ps = e.stat.parSort;
  if (!ps) return [...base, ...COMPTES_SORT.slice(0, 2).map(([, libelle]) => ({ n: INCONNU, libelle })), { n: INCONNU, libelle: 'irrecevables' }];
  const sansSort = e.stat.deposes - Object.values(ps).reduce((x, y) => x + y, 0);
  return [
    ...base,
    ...COMPTES_SORT.filter(([s]) => ps[s] > 0).map(([s, libelle]) => ({ n: nombre(ps[s]), libelle })),
    ...(ps.en_attente > 0 ? [{ n: nombre(ps.en_attente), libelle: libelleEnAttente(e, etatDossier) }] : []),
    ...(sansSort > 0 ? [{ n: nombre(sansSort), libelle: 'sans sort publié' }] : []),
  ];
}

/** Compte d'un filtre de sort (« Rejetés 1 728 ») : celui du dossier entier s'il est fourni, la marque sinon. */
export function compteSort(f: FicheDossier, s: SortAmendement): string {
  const n = f.amendements.parSort?.[s];
  return n === undefined ? INCONNU : nombre(n);
}

/** Dates de la ligne de vie d'un amendement : « déposé 28/04 », « tombé 06/05 » ; la marque si non publiée. */
export function datesAmendement(a: Pick<AmendementResume, 'dateDepot' | 'dateSort' | 'sort'>): { depot: string; sort: string } {
  const depot = `déposé ${a.dateDepot ? jourMois(a.dateDepot) : DATE_INCONNUE}`;
  const issue = issueAmendement(a.sort);
  if (!a.sort || a.sort === 'en_attente') return { depot, sort: issue };
  return { depot, sort: `${issue} ${a.dateSort ? jourMois(a.dateSort) : DATE_INCONNUE}` };
}

/** Dates d'une étape de la chronologie : « 09/02 → 12/02/26 », une seule date, ou `[jj/mm]`. */
export function datesEtape(c: Pick<CaseParcours, 'debut' | 'fin' | 'etat'>): string {
  if (c.debut && c.fin && c.debut !== c.fin) return `${dateCourte(c.debut).slice(0, 5)} → ${dateCourte(c.fin)}`;
  const le = c.fin ?? c.debut;
  if (le) return dateCourte(le);
  return c.etat === 'a_venir' ? 'à venir' : DATE_INCONNUE;
}

// ---------- Scrutins clés ----------

/** Un vote clé conclut seul son étape : ensemble du texte, article unique, motion de censure. */
export const estVoteCle = (s: ScrutinResume) => s.nature === 'ensemble' || s.nature === 'article_unique' || s.nature === 'motion_censure';

/** Majorité absolue des membres composant l'Assemblée (art. 49 et 50) : seuls les « pour » comptent. */
export const MAJORITE_CENSURE = 289;
export const SIEGES_AN = 577;

/** Sort d'un scrutin, tel que publié ; sinon déduit du booléen publié ; sinon la marque. */
export const sortScrutin = (s: ScrutinResume) => s.sort ?? (s.adopte === null ? 'Sort non publié' : s.adopte ? 'Adopté' : 'Rejeté');

// ---------- Sous-dossier (planche « SousDossier ») ----------

export interface EffetSousDossier {
  /** Branche prise (d'après le vote ou la conclusion publiée), null si rien ne permet de conclure. */
  pris: string | null;
  /** L'autre issue possible (ou les deux, si rien n'est conclu). */
  autres: string[];
}

const ISSUES: Record<string, { oui: string; non: string; adopte: (f: FicheDossier) => boolean | null }> = {
  responsabilite_gouvernement: {
    non: 'Motion rejetée : le texte est considéré comme adopté',
    oui: 'Motion adoptée : texte rejeté, le Gouvernement démissionne',
    adopte: (f) => voteDe(f, ['motion_censure'], 'vote'),
  },
  motion_referendaire: {
    non: 'Rejetée : la discussion du texte reprend',
    oui: 'Adoptée par les deux chambres : le texte va au référendum',
    adopte: (f) => voteDe(f, ['motion', 'motion_censure'], 'seance_s'),
  },
  prerogatives_enquete: {
    non: 'Refusées : la commission reste sans ces pouvoirs',
    oui: 'Accordées : la commission dispose des pouvoirs d’enquête',
    adopte: (f) => voteDe(f, [], 'seance'),
  },
};

/**
 * Issue du vote : les scrutins publiés de la nature attendue (ceux du dossier, puis ceux du
 * rattachement) — un seul adopté suffit, tous rejetés : rejet —, sinon la conclusion de l'étape de vote.
 */
function voteDe(f: FicheDossier, natures: string[], etape: CleCase): boolean | null {
  const publies = [...f.scrutins, ...(f.parcours?.parent?.scrutins ?? [])].filter((x) => natures.includes(x.nature) && x.adopte !== null);
  if (publies.some((x) => x.adopte)) return true;
  if (publies.length) return false;
  const c = f.parcours?.cases.find((x) => x.cle === etape && x.etat === 'faite');
  if (!c?.conclusion) return null;
  if (/rejet/i.test(c.conclusion)) return false;
  if (/adopt|accord/i.test(c.conclusion)) return true;
  return null;
}

/** Effet d'un sous-dossier sur son dossier parent, selon son modèle ; null si le modèle n'en décrit pas. */
export function effetSousDossier(f: FicheDossier): EffetSousDossier | null {
  const regle = f.parcours ? ISSUES[f.parcours.modele.cle] : undefined;
  if (!regle) return null;
  const adopte = regle.adopte(f);
  if (adopte === null) return { pris: null, autres: [regle.non, regle.oui] };
  return adopte ? { pris: regle.oui, autres: [regle.non] } : { pris: regle.non, autres: [regle.oui] };
}

/** Scrutin de la motion (censure ou référendaire), s'il est publié. */
export const scrutinMotion = (f: FicheDossier) => f.scrutins.find((s) => s.nature === 'motion_censure' || s.nature === 'motion') ?? null;

/** Motions du rattachement (scrutins publiés sous l'acte qui lie le sous-dossier à son parent). */
export const motionsRattachees = (f: FicheDossier): VoteRattache[] =>
  (f.parcours?.parent?.scrutins ?? []).filter((s) => s.nature === 'motion_censure' || s.nature === 'motion');

/** Une motion en une ligne : « Motion de censure n° 5154 · rejetée · 269 voix pour, 289 requises (règle) ». */
export function ligneVoteRattache(v: VoteRattache): string {
  const quoi = v.nature === 'motion_censure' ? 'Motion de censure' : v.nature === 'motion' ? 'Motion' : 'Scrutin';
  const sort = v.sort ?? (v.adopte === null ? 'sort non publié' : v.adopte ? 'adoptée' : 'rejetée');
  const voix = v.nature === 'motion_censure' ? `${nombre(v.pour)} voix pour, ${MAJORITE_CENSURE} requises (règle)` : `${nombre(v.pour)} pour, ${nombre(v.contre)} contre`;
  return `${quoi} n° ${v.numero} · ${sort} · ${voix}`;
}

/**
 * Résumé d'un dossier rattaché, sur le rail : nombre de motions ou de scrutins et leur issue
 * (« 2 motions de censure, rejetées : 269 et 142 voix pour, 289 requises (règle) ») ; null sans scrutin publié.
 * La majorité requise (art. 49 : majorité des membres de l'Assemblée) n'est pas publiée dans les
 * données : c'est la règle, sur 577 sièges, qui est rappelée.
 */
export function resumeRattache(k: DossierLie): string | null {
  const v = k.scrutins ?? [];
  if (!v.length) return null;
  const censures = v.filter((x) => x.nature === 'motion_censure');
  if (censures.length === v.length) {
    const n = censures.length;
    const adoptees = censures.filter((x) => x.adopte === true).length;
    const rejetees = censures.filter((x) => x.adopte === false).length;
    const issue =
      adoptees === n ? (n > 1 ? 'adoptées' : 'adoptée') : rejetees === n ? (n > 1 ? 'rejetées' : 'rejetée') : `${adoptees} adoptée${adoptees > 1 ? 's' : ''}, ${rejetees} rejetée${rejetees > 1 ? 's' : ''}`;
    const voix = censures.map((x) => nombre(x.pour));
    const liste = voix.length > 1 ? `${voix.slice(0, -1).join(', ')} et ${voix.at(-1)}` : voix[0];
    return `${n} motion${n > 1 ? 's' : ''} de censure, ${issue} : ${liste} voix pour, ${MAJORITE_CENSURE} requises (règle)`;
  }
  return `${v.length} scrutin${v.length > 1 ? 's' : ''} public${v.length > 1 ? 's' : ''} : ${v.map((x) => `n° ${x.numero} ${x.sort ?? 'sort non publié'}`).join(', ')}`;
}

/** Étapes du mini parcours horizontal : cases qui ont eu lieu ou peuvent avoir lieu, et la date courte. */
export function etapesSousDossier(p: Parcours) {
  const visibles = p.cases.filter((c) => c.etat !== 'sans_objet');
  const derniere = [...visibles].reverse().find((c) => c.courante || c.etat === 'faite');
  return visibles.map((c) => ({
    cas: c,
    icone: iconeEtape(c, p.modele.cle),
    /** Étape décisive (en cours, ou la dernière faite) : cerclée en signal. */
    cle: c === derniere,
    aVenir: c.etat === 'a_venir' || c.etat === 'inconnu',
    date: c.fin ?? c.debut ? dateCourte((c.fin ?? c.debut)!).slice(0, 5) : c.etat === 'a_venir' ? '' : DATE_INCONNUE,
  }));
}
