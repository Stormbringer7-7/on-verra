// Règles de l'écran Étape (planche « Étape », 22 sortes en 6 familles) et de la feuille Événement
// (planche « Événement », 8 déviations), sans React : testées sous Node (tests/etape.test.tsx).
//
// La sorte d'une étape se lit dans sa clé de modèle (opendata/parcours/*.toml : `depot`,
// `commission_1_o`, `cmp`, `recueil`, `haute_cour`, `vote`…) et, à défaut, dans son lieu. Elle
// choisit l'icône et les blocs à montrer ; les valeurs viennent toutes de `FicheEtape`. Ce que le
// contrat ne donne pas (rapporteur, président de CMP, soutiens recueillis…) est dit indisponible,
// jamais rempli. Les notes de règle et les effets conditionnels sont ceux des modèles de parcours
// et de la Constitution, pas des données.

import type { CaseCompacte, CaseParcours, DeviationParcours, EffetDeviation, Lieu, PersonneEtape, RolePersonneEtape, ScrutinResume } from '@/core';
import type { NomIcone } from '../Icone';
import { joursEntre } from '../commun/statuts';

// ---------- Sortes d'étapes ----------

export type FamilleEtape = 'nav' | 'acc' | 'fin' | 'ini' | 'ctl' | 'gouv';

export type SorteEtape =
  | 'depot'
  | 'commission'
  | 'seance'
  | 'transmission'
  | 'lecture'
  | 'definitive'
  | 'cmp'
  | 'conclusions'
  | 'cc'
  | 'promulgation'
  | 'congres'
  | 'referendum'
  | 'recueil'
  | 'examen'
  | 'hautecour'
  | 'creation'
  | 'nomination'
  | 'rapport'
  | 'petition'
  | 'declaration'
  | 'vote'
  | 'allocution';

export const FAMILLE_ETAPE: Record<FamilleEtape, string> = {
  nav: 'Navette',
  acc: 'Accord',
  fin: 'Fin',
  ini: 'Initiative',
  ctl: 'Contrôle',
  gouv: 'Gouvernement',
};

/** Personne attendue par la planche, et les rôles de `FicheEtape.personnes` qui la publient. */
export type PersonneAttendue = { role: string; roles: RolePersonneEtape[] };

export interface DefinitionSorte {
  famille: FamilleEtape;
  icone: NomIcone;
  /** Personnes que la planche montre pour cette sorte (rapporteur, président…). */
  personnes: PersonneAttendue[];
  /** Note de règle (Constitution, règlements), sous les chiffres. */
  note: string | null;
}

/** Rôles publiés (`PersonneEtape.role`) de chaque personne attendue par la planche. */
const ROLES: Record<string, RolePersonneEtape[]> = {
  'Auteur du texte': ['auteur'],
  Rapporteur: ['rapporteur', 'rapporteur_avis'],
  'Président de la commission mixte': ['president'],
  Président: ['president'],
  'Premier ministre': ['premier_ministre'],
  Orateur: [],
};

const d = (famille: FamilleEtape, icone: NomIcone, personnes: string[] = [], note: string | null = null): DefinitionSorte => ({
  famille,
  icone,
  personnes: personnes.map((role) => ({ role, roles: ROLES[role] ?? [] })),
  note,
});

export const SORTES: Record<SorteEtape, DefinitionSorte> = {
  depot: d('nav', 'depot', ['Auteur du texte']),
  commission: d('nav', 'commission', ['Rapporteur']),
  seance: d('nav', 'an'),
  transmission: d('nav', 'transmission'),
  lecture: d('nav', 'navette', [], 'Seuls les articles non adoptés dans les mêmes termes restent en discussion.'),
  definitive: d('nav', 'an', [], 'L’Assemblée statue seule, sur le texte de la CMP ou sur son dernier texte voté.'),
  cmp: d('acc', 'cmp', ['Président de la commission mixte']),
  conclusions: d('acc', 'cmp', [], 'Amendements possibles seulement avec l’accord du Gouvernement.'),
  cc: d('fin', 'cc'),
  promulgation: d('fin', 'jo'),
  congres: d('fin', 'congres', [], 'Le projet de révision est approuvé s’il réunit les trois cinquièmes des suffrages exprimés.'),
  referendum: d('fin', 'urne'),
  recueil: d('ini', 'soutiens', [], 'Soutiens d’un dixième des électeurs inscrits, recueillis pendant neuf mois.'),
  examen: d('ini', 'an', [], 'Non examinée par chaque chambre dans les six mois : le Président de la République la soumet au référendum.'),
  hautecour: d('ini', 'hautecour', [], 'Un mois pour statuer ; vote à bulletins secrets.'),
  creation: d('ctl', 'enquete', [], 'Par résolution votée en séance, ou par droit de tirage d’un groupe.'),
  nomination: d('ctl', 'membres', ['Président', 'Rapporteur']),
  rapport: d('ctl', 'rapport'),
  petition: d('ctl', 'petition'),
  declaration: d('gouv', 'declaration', ['Premier ministre']),
  vote: d('gouv', 'urne', [], 'Seuls les votes « pour » la motion sont comptés.'),
  allocution: d('gouv', 'micro', ['Orateur']),
};

/** Clé de modèle → sorte (préfixes et clés exactes de opendata/parcours). */
const PAR_CLE: [RegExp, SorteEtape][] = [
  [/^depot$|^motion$/, 'depot'],
  [/^commission/, 'commission'],
  [/^seance|^debat$|^lecture_1_/, 'seance'],
  [/^transmission/, 'transmission'],
  [/^lecture_definitive$/, 'definitive'],
  [/^lecture_|^nouvelle_lecture$/, 'lecture'],
  [/^cmp$/, 'cmp'],
  [/^conclusions_cmp$/, 'conclusions'],
  [/^cc$/, 'cc'],
  [/^promulgation|^jo$/, 'promulgation'],
  [/^congres$/, 'congres'],
  [/^referendum$/, 'referendum'],
  [/^recueil$/, 'recueil'],
  [/^examen$/, 'examen'],
  [/^haute_cour$/, 'hautecour'],
  [/^creation$/, 'creation'],
  [/^nomination$/, 'nomination'],
  [/^rapport$/, 'rapport'],
  [/^petition$/, 'petition'],
  [/^declaration$/, 'declaration'],
  [/^vote$/, 'vote'],
  [/^allocution$/, 'allocution'],
];

const PAR_LIEU: Partial<Record<Lieu, SorteEtape>> = { CMP: 'cmp', CC: 'cc', PR: 'promulgation', JO: 'promulgation', GOUVERNEMENT: 'declaration' };

/**
 * Définition de la sorte dans le modèle du dossier (`FicheEtape.modele`) : la création d'une mission
 * d'information n'est pas celle d'une commission d'enquête (ni résolution, ni droit de tirage).
 * Sans modèle : la définition générale.
 */
export function definitionEtape(sorte: SorteEtape, modele: string | null = null): DefinitionSorte {
  const def = SORTES[sorte];
  if (sorte === 'creation' && modele === 'mission_information') return { ...def, icone: 'mission', note: null };
  return def;
}

/**
 * Personnes attendues par la sorte, chacune avec celles que la fiche publie pour ses rôles ; sans
 * `personnes` dans la fiche (non fournies), aucune n'est trouvée : la marque « non publié ».
 */
export function personnesAttendues(def: DefinitionSorte, personnes: PersonneEtape[] | undefined): { role: string; trouvees: PersonneEtape[] }[] {
  return def.personnes.map((a) => ({ role: a.role, trouvees: (personnes ?? []).filter((p) => a.roles.includes(p.role)) }));
}

/** Membres titulaires publiés de l'organe de l'étape (CMP, commission d'enquête). */
export const membresEtape = (personnes: PersonneEtape[] | undefined) => (personnes ?? []).filter((p) => p.role === 'membre');

/** Sorte d'une étape : par sa clé, sinon par son lieu, sinon une séance. */
export function sorteEtape(cle: string, lieu: Lieu | null = null): SorteEtape {
  const trouvee = PAR_CLE.find(([motif]) => motif.test(cle));
  if (trouvee) return trouvee[1];
  return (lieu && PAR_LIEU[lieu]) || 'seance';
}

/** Chambre nommée dans un libellé de case (« Séance Sénat », « Commission AN »), null sinon. */
export function chambreDuLibelle(libelle: string): Lieu | null {
  if (/s[ée]nat/i.test(libelle)) return 'SENAT';
  if (/\bAN\b|assembl/i.test(libelle)) return 'AN';
  return null;
}

/** Icône d'une case : celle de sa sorte ; une séance ou une lecture au Sénat prend l'icône du Sénat. */
export function iconeCase(cle: string, lieu: Lieu | null = null): NomIcone {
  const s = sorteEtape(cle, lieu);
  if ((s === 'seance' || s === 'lecture') && lieu === 'SENAT') return 'senat';
  return SORTES[s].icone;
}

// ---------- Bande du parcours ----------

export type RenduPas = 'faite' | 'ici' | 'a_venir' | 'inconnue';

export interface PasBande {
  cle: string;
  libelle: string;
  icone: NomIcone;
  rendu: RenduPas;
  /** Étape en cours du dossier (halo). */
  courante: boolean;
  /** Trait avant le pas : plein jusqu'à l'étape affichée. */
  traitPlein: boolean;
}

/** Pas de la bande : cases visibles (sans objet masquées), l'étape affichée mise en avant. */
export function bandeParcours(cases: CaseCompacte[], ici: string): PasBande[] {
  const visibles = cases.filter((c) => c.etat !== 'sans_objet');
  const rang = visibles.findIndex((c) => c.cle === ici);
  return visibles.map((c, i) => ({
    cle: c.cle,
    libelle: c.libelle,
    icone: iconeCase(c.cle, chambreDuLibelle(c.libelle)),
    rendu: c.cle === ici ? 'ici' : c.etat === 'inconnu' ? 'inconnue' : c.etat === 'faite' ? 'faite' : 'a_venir',
    courante: c.courante,
    traitPlein: rang >= 0 && i <= rang,
  }));
}

// ---------- Jauges ----------

/** Majorité absolue des membres de l'Assemblée (577 sièges) : seuil d'adoption d'une motion de censure. */
export const MAJORITE_ABSOLUE_AN = 289;
/** Membres du Parlement réuni en Haute Cour (577 + 348) : la destitution demande les deux tiers. */
export const MEMBRES_PARLEMENT = 925;

export interface Jauge {
  libelle: string;
  /** « 260 / 289 », « [n] / 6 mois » : marque visible quand la valeur manque. */
  valeur: string;
  /** Entre 0 et 1 ; null : rien à dessiner (donnée indisponible). */
  fraction: number | null;
  /** Pourquoi la valeur manque, quand on le sait (« absent des sources chargées »). */
  absence?: string;
}

const MOIS = 30.4;
const borne = (x: number) => Math.max(0, Math.min(1, x));

/** Délai écoulé sur `mois` mois, du début de l'étape à sa fin (ou au jour donné si elle est en cours). */
export function jaugeDelai(libelle: string, c: Pick<CaseParcours, 'debut' | 'fin' | 'etat'>, mois: number, jour: string): Jauge {
  if (!c.debut) return { libelle, valeur: `[n] / ${mois} mois`, fraction: null };
  const fin = c.etat === 'faite' ? (c.fin ?? c.debut) : jour;
  const jours = Math.max(0, joursEntre(c.debut, fin));
  const ecoules = Math.min(mois, Math.round((jours / MOIS) * 10) / 10);
  return { libelle, valeur: `${String(ecoules).replace('.', ',')} / ${mois} mois`, fraction: borne(jours / (mois * MOIS)) };
}

/**
 * Jauges de la sorte, d'après ce que la fiche publie (scrutins, dates). Le délai de six mois d'un
 * rapport n'est celui d'aucune autre instance qu'une commission d'enquête (ordonnance n° 58-1100,
 * art. 6) : avec un autre modèle connu, pas de jauge.
 */
export function jaugesEtape(sorte: SorteEtape, c: CaseParcours, votes: ScrutinResume[], jour: string, modele: string | null = null): Jauge[] {
  const vote = votes[0];
  switch (sorte) {
    case 'vote':
      return [
        vote
          ? { libelle: 'Majorité absolue des membres', valeur: `${vote.decompte.pour} / ${MAJORITE_ABSOLUE_AN}`, fraction: borne(vote.decompte.pour / MAJORITE_ABSOLUE_AN) }
          : { libelle: 'Majorité absolue des membres', valeur: `[n] / ${MAJORITE_ABSOLUE_AN}`, fraction: null },
      ];
    case 'congres': {
      const exprimes = vote ? vote.decompte.pour + vote.decompte.contre : 0;
      const requis = Math.ceil((exprimes * 3) / 5);
      return [
        vote && exprimes > 0
          ? { libelle: 'Majorité des 3/5 des suffrages exprimés', valeur: `${vote.decompte.pour} / ${requis}`, fraction: borne(vote.decompte.pour / requis) }
          : { libelle: 'Majorité des 3/5 des suffrages exprimés', valeur: '[n] / [n]', fraction: null },
      ];
    }
    case 'hautecour':
      return [{ libelle: 'Destitution : deux tiers des membres', valeur: `[n] / ${Math.ceil((MEMBRES_PARLEMENT * 2) / 3)}`, fraction: null }];
    case 'recueil':
      return [
        {
          libelle: 'Soutiens d’électeurs, 1/10 du corps électoral',
          valeur: '[n] / [n]',
          fraction: null,
          absence: 'Décompte du ministère de l’Intérieur : absent des sources chargées.',
        },
        jaugeDelai('Durée écoulée', c, 9, jour),
      ];
    case 'examen':
      return [jaugeDelai('Délai d’examen', c, 6, jour)];
    case 'rapport':
      return modele && modele !== 'commission_enquete' ? [] : [jaugeDelai('Délai', c, 6, jour)];
    default:
      return [];
  }
}

// ---------- Fourches ----------

export interface Fourche {
  /** Branche prise, d'après la conclusion publiée ; null : issue non publiée, rien n'est tranché. */
  prise: string | null;
  autre: string;
  /** Les deux branches, quand aucune n'est établie. */
  branches: [string, string];
}

/**
 * Branches du droit commun après la CMP, le vote de ses conclusions ou l'examen d'un RIP. La branche
 * prise n'est montrée que si la conclusion publiée la dit sans ambiguïté.
 */
export function fourcheEtape(sorte: SorteEtape, c: Pick<CaseParcours, 'conclusion' | 'etat'>): Fourche | null {
  const conclusion = (c.conclusion ?? '').toLowerCase();
  const choisir = (oui: string, non: string, estOui: boolean | null): Fourche => ({
    prise: estOui === null ? null : estOui ? oui : non,
    autre: estOui === null ? '' : estOui ? non : oui,
    branches: [oui, non],
  });
  if (sorte === 'cmp') {
    const desaccord = /d[ée]saccord|[ée]chec|pas d.accord/.test(conclusion);
    const accord = !desaccord && /accord|conclusive/.test(conclusion);
    return choisir('Accord : vote du texte de la CMP', 'Désaccord : nouvelle lecture', accord ? true : desaccord ? false : null);
  }
  if (sorte === 'conclusions') {
    const morceaux = conclusion.split('·').map((m) => m.trim()).filter(Boolean);
    const rejete = morceaux.some((m) => /rejet/.test(m));
    const adopte = morceaux.length >= 2 && morceaux.every((m) => /adopt/.test(m));
    return choisir('Adopté par les deux chambres : fin de la navette', 'Rejeté : nouvelle lecture', adopte ? true : rejete ? false : null);
  }
  if (sorte === 'examen') return choisir('Examinée par chaque chambre : pas de référendum', 'Non examinée dans le délai : référendum', null);
  return null;
}

// ---------- Déviations (feuille Événement) ----------

/** Icône d'une déviation, par sa clé de modèle ; à défaut, celle de son effet. */
export function iconeDeviation(cle: string, effet: EffetDeviation): NomIcone {
  const icones: Record<string, NomIcone> = {
    procedure_acceleree: 'accel',
    engagement_responsabilite: 'e493',
    motion_procedure: 'proc',
    irrecevabilite: 'irrec',
    retrait: 'retrait',
    retrait_ordre_du_jour: 'odj',
    caducite: 'caduc',
    fusion: 'fusion',
  };
  return icones[cle] ?? effet;
}

/**
 * Effet conditionnel (« effet si… ») en clair. Seuls le 49.3 et la motion de procédure ont un
 * effet conditionnel défini dans les modèles de parcours (`si`, `effet_si` de opendata/parcours,
 * rendu dans `DeviationParcours.effetSi`) ; les autres phrases sont des règles générales
 * (Constitution, règlements), pas des données du dossier : `effetSiDe` le dit.
 */
export const EFFET_SI: Record<string, string> = {
  procedure_acceleree: 'CMP possible après une seule lecture dans chaque chambre.',
  engagement_responsabilite: 'Si une motion de censure est adoptée : fin du parcours.',
  motion_procedure: 'Adoptée (rejet préalable, question préalable, renvoi en commission) : remplace l’issue de l’étape.',
  retrait: 'Les étapes suivantes n’auront pas lieu.',
  retrait_ordre_du_jour: 'Le texte peut être réinscrit plus tard.',
  caducite: 'Fin de législature, dissolution, ou renouvellement du Sénat pour les propositions des sénateurs.',
  fusion: 'La suite se lit dans le dossier qui l’absorbe.',
};

export const effetSi = (d: Pick<DeviationParcours, 'cle'>): string | null => EFFET_SI[d.cle] ?? null;

/**
 * Effet conditionnel et d'où il vient : `modele` quand la fiche publie l'effet du modèle
 * (`effetSi`), `regle` sinon (phrase générale, pas une donnée du dossier) ; null : rien à dire.
 */
export function effetSiDe(d: Pick<DeviationParcours, 'cle' | 'effetSi'>): { texte: string; source: 'modele' | 'regle' } | null {
  const texte = effetSi(d);
  if (!texte) return null;
  return { texte, source: d.effetSi ? 'modele' : 'regle' };
}

/** Libellé de l'action principale de la feuille, selon la déviation et le dossier rattaché. */
export function actionDeviation(d: Pick<DeviationParcours, 'cle'>, rattache: boolean): string {
  if (rattache && d.cle === 'engagement_responsabilite') return 'Voir le 49.3 et la motion';
  if (rattache && d.cle === 'fusion') return 'Voir le dossier joint';
  if (rattache) return 'Voir le dossier rattaché';
  return 'Voir l’étape';
}
