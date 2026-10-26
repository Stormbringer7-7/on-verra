// Fixtures de l'Explorer (faits filtrés) : une base de faits fictifs tirée du canevas v4
// (Explorer.dc.html : interventions, amendements, votes, contrôle, transparence), rattachés aux
// entités des autres fixtures, et un lecteur synchrone qui répond aux lectures de
// `core/domain/explorer.ts`. Les sorties des exemples sont produites par ces règles partagées ;
// l'adaptateur mémoire de l'API lit la même base.
//
// Rattachements, comme en base : un fait n'est sous un objet que par un lien publié (dossier,
// réunion d'une étape, amendement discuté → son article). Les prises de parole en commission AN
// n'ont que le nom publié de l'orateur : elles ne comptent pour aucune personne ni aucun groupe.

import {
  APERCU_GROUPE,
  explorerSync,
  type DemandeGroupes,
  type Lecture,
  type Nommes,
  type ReponseLecture,
} from '../../core/domain/explorer';
import type {
  AmendementRef,
  Chambre,
  CleCase,
  CleFiltre,
  DemandeFaits,
  DossierRef,
  ExplorationFaits,
  Fait,
  FiltresFaits,
  GroupeFaits,
  GroupeRef,
  Intervention,
  ObjetFocal,
  Page,
  PersonneRef,
  Position,
  PositionDeGroupe,
  Regroupement,
  ReunionRef,
  ScrutinFiltre,
  ScrutinResume,
  SortAmendement,
  SuggestionFiltre,
  TypeFait,
} from '../../core/domain/model';
import { familleDe, TYPES_ACTION, TYPES_FAITS } from '../../core/domain/explorer';
import { INTERVENTIONS_CE123, INTERVENTIONS_SEANCE_1203, extrait } from './discussions';
import { AMENDEMENTS, RESUMES } from './dossiers';
import { A, ART, D, G, GROUPES_AN, GROUPES_SENAT, P, comme, lienFictif, orateur, prov } from './entites';
import { DECLARATIONS_CAMILLE, DECLARATIONS_CLAIRE, resumes } from './fonctions';
import { INTERETS } from './interets';
import { FICHE_SCRUTIN_1874, S } from './scrutins';

// ---------- Objets nommables ----------

const AFFECO_AN = { id: 'commission-affeco-an', nom: 'Commission des affaires économiques' };
const AFFECO_SENAT = { id: 'commission-affeco-senat', nom: 'Commission des affaires économiques (Sénat)' };
const ASSEMBLEE = { id: 'assemblee-nationale', nom: 'Assemblée nationale' };
const SENAT = { id: 'senat', nom: 'Sénat' };
const ORGANES = [AFFECO_AN, AFFECO_SENAT, ASSEMBLEE, SENAT];
const CHAMBRE_DE_L_ORGANE: Record<string, Chambre> = { [AFFECO_AN.id]: 'AN', [ASSEMBLEE.id]: 'AN', [AFFECO_SENAT.id]: 'SENAT', [SENAT.id]: 'SENAT' };
const CHAMBRES: Record<Chambre, string> = { AN: 'Assemblée nationale', SENAT: 'Sénat' };

const DOSSIERS = Object.values(RESUMES);
const ARTICLES = Object.values(ART);
/** Dossier de chaque article suivi (identifiants des fixtures : `art-<dossier>-<numéro>`). */
const dossierDeLArticle = (id: string): DossierRef | null => (id.startsWith('art-energie') ? D.energie : id.startsWith('art-location') ? D.location : null);
const PERSONNES = Object.values(P);
const GROUPES = Object.values(G);
const SCRUTINS = Object.values(S);
const AMDTS = Object.values(AMENDEMENTS);

const caseDe = (dossier: string, cle: CleCase) => DOSSIERS.find((d) => d.id === dossier)?.barre.find((c) => c.cle === cle) ?? null;

// ---------- Base de faits ----------

/** Un fait et ce par quoi il se filtre (liens publiés seulement). */
interface Indexe {
  onglet: Exclude<TypeFait, 'personnes'>;
  fait: Fait;
  dossier?: string;
  etape?: CleCase;
  article?: string;
  /** Plusieurs pour un scrutin : les groupes qui ont voté. */
  groupes: string[];
  /** Plusieurs pour un scrutin : les votants publiés. */
  personnes: string[];
  chambre?: Chambre;
  organe?: string;
  scrutin?: string;
  amendement?: string;
  date: string | null;
  sort?: SortAmendement | null;
  nature?: string;
  /** Vote à main levée : montré seulement pour son amendement filtré. */
  mainLevee?: boolean;
}

const SEANCE_AN_1703: ReunionRef = {
  id: 'reunion-an-seance-2026-03-17',
  type: 'seance',
  chambre: 'AN',
  organe: ASSEMBLEE,
  debut: '2026-03-17T15:00:00+01:00',
};
const COMMISSION_SENAT_0505: ReunionRef = {
  id: 'reunion-senat-com-2026-05-05',
  type: 'commission',
  chambre: 'SENAT',
  organe: AFFECO_SENAT,
  debut: '2026-05-05T09:30:00+02:00',
};
const SEANCE_AN_0128: ReunionRef = {
  id: 'reunion-an-seance-2026-01-28',
  type: 'seance',
  chambre: 'AN',
  organe: ASSEMBLEE,
  debut: '2026-01-28T15:00:00+01:00',
};

/** Prise de parole publiée (même forme que les fixtures de discussions). */
const parole = (
  id: string,
  reunion: ReunionRef,
  ordre: number,
  qui: PersonneRef,
  qualite: string | null,
  texte: string,
  dossier: DossierRef,
  amendement: AmendementRef,
): Intervention => ({
  id,
  reunion,
  ordre,
  horodatage: reunion.type === 'seance' ? ordre * 42 : null,
  orateur: orateur(qui, qualite),
  groupe: qui.groupe,
  texte,
  sujet: { dossier, article: null, amendement, point: null },
  compteRendu: {
    url: lienFictif(`${reunion.chambre === 'AN' ? 'an' : 'senat'}/compte-rendu/${reunion.id}`),
    ancre: `p-${ordre}`,
    provenance: prov(reunion.chambre === 'AN' ? 'AN' : 'SENAT', 'intervention', `${reunion.id}#${ordre}`),
  },
  synthese: null,
});

const SEANCE_ART3: Intervention[] = [
  parole('int-an-1703-21', SEANCE_AN_1703, 21, P.camille, 'rapporteure', 'Je soutiens l’objectif propre à la chaleur : c’est la moitié de notre consommation.', D.energie, A.n655),
  parole('int-an-1703-22', SEANCE_AN_1703, 22, P.louis, null, 'Le réseau doit suivre le rythme des parcs en mer.', D.energie, A.n655),
  parole('int-an-1703-23', SEANCE_AN_1703, 23, P.ines, null, '45 % n’est pas un plafond, c’est un plancher.', D.energie, A.n655),
  parole('int-an-1703-24', SEANCE_AN_1703, 24, P.hugo, null, 'Cet objectif ne dit rien du coût pour les ménages.', D.energie, A.n655),
  parole('int-an-1703-25', SEANCE_AN_1703, 25, P.lea, null, 'La chaleur renouvelable mérite un objectif à part entière.', D.energie, A.n655),
  parole('int-an-1703-26', SEANCE_AN_1703, 26, P.claire, 'ministre', 'Le Gouvernement s’en remet à la sagesse de l’Assemblée sur ce relèvement.', D.energie, A.n655),
];
const AUTRES_PAROLES: Intervention[] = [
  parole('int-senat-com-0505-8', COMMISSION_SENAT_0505, 8, P.paul, null, '45 % est hors d’atteinte avec les capacités de raccordement actuelles.', D.energie, A.com56),
  parole('int-an-0128-5', SEANCE_AN_0128, 5, P.ines, null, '90 nuits couvrent l’été sans vider les centres-villes.', D.location, A.ce40),
];

/** Case, article et date d'un fait d'après l'amendement discuté. */
const surAmendement = (id: string) => {
  const a = AMDTS.find((x) => x.id === id)!;
  return { etape: a.etape?.cle, article: a.article?.id };
};

const intervention = (i: Intervention): Indexe => {
  const { etape, article } = i.sujet.amendement ? surAmendement(i.sujet.amendement.id) : { etape: undefined, article: undefined };
  const dossier = i.sujet.dossier?.id;
  const e = extrait(i);
  const personne = i.orateur.type === 'personne' ? i.orateur.personne : null;
  const date = i.reunion.debut?.slice(0, 10) ?? null;
  const c = dossier && etape ? caseDe(dossier, etape) : null;
  return {
    onglet: 'interventions',
    fait: {
      type: 'intervention',
      id: i.id,
      orateur: i.orateur,
      groupe: i.groupe,
      extrait: e.extrait,
      tronque: e.tronque,
      reunion: i.reunion,
      contexte: {
        dossier: i.sujet.dossier,
        etape: c ? { cle: c.cle, libelle: c.libelle } : null,
        article: ARTICLES.find((x) => x.id === article) ?? null,
        date,
      },
      compteRendu: i.compteRendu,
    },
    dossier,
    etape,
    article,
    groupes: i.groupe ? [i.groupe.id] : [],
    personnes: personne ? [personne.id] : [],
    chambre: i.reunion.chambre,
    organe: i.reunion.organe?.id,
    amendement: i.sujet.amendement?.id,
    date,
  };
};

/** Date du sort de chaque amendement (fin de la réunion qui l'a examiné). */
const DATE_SORT: Record<string, string> = {
  'amdt-ce123': '2026-02-04',
  'amdt-ce88': '2026-02-04',
  'amdt-1876': '2026-03-12',
  'amdt-2051': '2026-03-13',
  'amdt-655': '2026-03-17',
  'amdt-com56': '2026-05-06',
  'amdt-s412': '2026-05-26',
  'amdt-ce40': '2026-01-14',
  'amdt-51': '2026-01-28',
  'amdt-com12': '2026-03-18',
  'amdt-s9': '2026-03-25',
  'amdt-33': '2026-05-27',
};

const amendement = (a: (typeof AMDTS)[number]): Indexe => {
  const dossier = a.id.match(/^amdt-(ce40|com12|33|s9|51)$/) ? D.location : D.energie;
  const auteur = a.auteur?.type === 'personne' ? a.auteur.personne : null;
  const commission = a.etape?.cle.startsWith('commission') ?? false;
  const organe = commission ? (a.chambre === 'AN' ? AFFECO_AN : AFFECO_SENAT) : undefined;
  const date = DATE_SORT[a.id] ?? null;
  return {
    onglet: 'amendements',
    fait: {
      type: 'amendement',
      id: a.id,
      amendement: a,
      contexte: { dossier, etape: a.etape, article: a.article, date },
      provenance: prov(a.chambre === 'AN' ? 'AN' : 'SENAT', 'amendement', `${a.chambre}-${a.numero}`),
    },
    dossier: dossier.id,
    etape: a.etape?.cle,
    article: a.article?.id,
    groupes: auteur?.groupe ? [auteur.groupe.id] : [],
    personnes: auteur ? [auteur.id] : [],
    chambre: a.chambre,
    organe: organe?.id,
    amendement: a.id,
    date,
    sort: a.sort,
  };
};

/** Votes individuels publiés connus des fixtures (personne → position). */
const VOTANTS: Record<string, Record<string, Position>> = {
  [S.an1874.id]: {
    [P.camille.id]: 'contre',
    [P.louis.id]: 'pour',
    [P.hugo.id]: 'pour',
    [P.paulM.id]: 'pour',
    [P.ines.id]: 'contre',
    [P.karim.id]: 'contre',
    [P.lea.id]: 'contre',
  },
  [S.an1880.id]: { [P.camille.id]: 'pour', [P.louis.id]: 'pour', [P.hugo.id]: 'contre', [P.ines.id]: 'pour', [P.lea.id]: 'pour' },
  [S.sen212.id]: { [P.pierre.id]: 'pour', [P.paul.id]: 'pour' },
  [S.an1102.id]: { [P.ines.id]: 'pour', [P.hugo.id]: 'pour', [P.camille.id]: 'pour' },
};

/** Répartition par groupe publiée (fiche du scrutin), quand les fixtures la donnent. */
const REPARTITION: Record<string, PositionDeGroupe[]> = { [S.an1874.id]: FICHE_SCRUTIN_1874.groupes };

/** Amendement mis aux voix par un scrutin, par lien explicite. */
const AMENDEMENT_DU_SCRUTIN: Record<string, string> = { [S.an1874.id]: A.n1876.id };

const scrutin = (s: ScrutinResume): Indexe => {
  const a = AMENDEMENT_DU_SCRUTIN[s.id];
  const groupes = (s.chambre === 'AN' ? GROUPES_AN : GROUPES_SENAT).map((g) => g.id);
  return {
    onglet: 'votes',
    fait: {
      type: 'scrutin',
      id: s.id,
      scrutin: s,
      duFiltre: null,
      provenance: prov(s.chambre === 'AN' ? 'AN' : 'SENAT', 'scrutin', `${s.chambre}-${s.numero}`, lienFictif(`${s.chambre.toLowerCase()}/scrutin/${s.numero}`)),
    },
    dossier: s.dossier?.id,
    etape: s.etape?.cle,
    article: a ? surAmendement(a).article : undefined,
    groupes,
    personnes: Object.keys(VOTANTS[s.id] ?? {}),
    chambre: s.chambre,
    scrutin: s.id,
    amendement: a,
    date: s.date,
  };
};

/** Amendements adoptés ou rejetés sans scrutin public : votes à main levée. */
const mainLevee = (a: (typeof AMDTS)[number]): Indexe => {
  const base = amendement(a);
  return {
    ...base,
    onglet: 'votes',
    fait: {
      type: 'main_levee',
      id: `main-levee-${a.id}`,
      amendement: { id: a.id, numero: a.numero, chambre: a.chambre },
      sort: a.sort,
      contexte: (base.fait as Extract<Fait, { type: 'amendement' }>).contexte,
      provenance: (base.fait as Extract<Fait, { type: 'amendement' }>).provenance,
    },
    sort: undefined,
    mainLevee: true,
  };
};

const QUESTION_CAMILLE = {
  id: 'question-qg-1201',
  type: 'QG' as const,
  numero: '1201',
  date: '2026-05-12',
  titre: 'Raccordement des parcs éoliens en mer',
  rubrique: 'énergie et carburants',
  ministere: 'Ministère de la Transition énergétique',
  dateReponse: '2026-05-12',
  provenance: prov('AN', 'question', 'QANR5L17QG1201'),
};
const QUESTION_HUGO = {
  id: 'question-qe-4521',
  type: 'QE' as const,
  numero: '4521',
  date: '2026-06-12',
  titre: 'Marges des fournisseurs d’électricité',
  rubrique: 'énergie et carburants',
  ministere: 'Ministère de la Transition énergétique',
  dateReponse: null,
  provenance: prov('AN', 'question', 'QANR5L17QE4521'),
};

const question = (q: typeof QUESTION_CAMILLE | typeof QUESTION_HUGO, auteur: PersonneRef): Indexe => ({
  onglet: 'controle',
  fait: { type: 'question', id: q.id, question: q, auteur },
  groupes: auteur.groupe ? [auteur.groupe.id] : [],
  personnes: [auteur.id],
  chambre: 'AN',
  date: q.date,
});

const interet = (l: (typeof INTERETS.dossierEnergie)[number], n: number): Indexe => {
  const c = l.vers.statut === 'verifie' ? l.vers.cible : l.vers.candidat;
  return {
    onglet: 'transparence',
    fait: { type: 'interet', id: `interet-${l.action.id}-${n}`, lien: l },
    dossier: c.dossier?.id,
    amendement: c.type === 'amendement' ? c.amendement.id : undefined,
    article: c.type === 'article' ? c.article.id : undefined,
    groupes: [],
    personnes: [],
    date: l.action.periode.fin,
    nature: 'Lobbying déclaré',
  };
};

const declaration = (d: (typeof DECLARATIONS_CAMILLE)[number], qui: PersonneRef): Indexe => {
  const [r] = resumes([d]);
  return {
    onglet: 'transparence',
    fait: { type: 'declaration', id: `declaration-${d.id}`, personne: qui, declaration: r, provenance: d.provenance },
    groupes: qui.groupe ? [qui.groupe.id] : [],
    personnes: [qui.id],
    date: d.datePublication,
    nature: 'Déclarations d’intérêts',
  };
};

export const BASE_FAITS: Indexe[] = [
  ...[...INTERVENTIONS_CE123, ...INTERVENTIONS_SEANCE_1203, ...SEANCE_ART3, ...AUTRES_PAROLES].map(intervention),
  ...AMDTS.map(amendement),
  ...SCRUTINS.map(scrutin),
  ...[AMENDEMENTS.ce123, AMENDEMENTS.n655, AMENDEMENTS.com56].map(mainLevee),
  question(QUESTION_CAMILLE, P.camille),
  question(QUESTION_HUGO, P.hugo),
  ...[...INTERETS.dossierEnergie, ...INTERETS.amendementCE123].map(interet),
  ...DECLARATIONS_CAMILLE.map((d) => declaration(d, P.camille)),
  ...DECLARATIONS_CLAIRE.map((d) => declaration(d, comme(P.claire, 'Ministre de la Transition énergétique'))),
];

// ---------- Lecteur ----------

const LIBELLE_SORT: Record<SortAmendement, string> = {
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré',
  tombe: 'Tombé',
  non_soutenu: 'Non soutenu',
  irrecevable: 'Irrecevable',
  en_attente: 'En attente',
};
const ORDRE_SORT = Object.keys(LIBELLE_SORT);

const egal = (valeur: string | undefined, filtre: string | undefined) => filtre === undefined || valeur === filtre;

/** Le fait répond-il à tous les filtres (liens publiés seulement) ? */
function retenu(x: Indexe, f: FiltresFaits): boolean {
  if (x.mainLevee && f.amendement !== x.amendement) return false;
  return (
    egal(x.dossier, f.dossier) &&
    egal(x.etape, f.etape) &&
    egal(x.article, f.article) &&
    (f.groupe === undefined || x.groupes.includes(f.groupe)) &&
    (f.personne === undefined || x.personnes.includes(f.personne)) &&
    egal(x.chambre, f.chambre) &&
    egal(x.organe, f.organe) &&
    egal(x.scrutin, f.scrutin) &&
    egal(x.amendement, f.amendement)
  );
}

const personneRef = (id: string) => PERSONNES.find((p) => p.id === id) ?? null;
const groupeRef = (id: string) => GROUPES.find((g) => g.id === id) ?? null;

/** Le fait tel qu'affiché sous ces filtres (position de la personne ou du groupe sur un scrutin). */
function affiche(x: Indexe, f: FiltresFaits): Fait {
  if (x.fait.type !== 'scrutin') return x.fait;
  const id = x.fait.id;
  if (f.personne) {
    const position = VOTANTS[id]?.[f.personne];
    if (!position) return x.fait;
    const groupe = personneRef(f.personne)?.groupe;
    const ligne = groupe ? REPARTITION[id]?.find((g) => g.groupe.id === groupe.id)?.ligne ?? null : null;
    const exprimee = position === 'pour' || position === 'contre' || position === 'abstention';
    return { ...x.fait, duFiltre: { type: 'personne', position, parDelegation: false, contreSonGroupe: exprimee && ligne !== null && ligne !== position } };
  }
  if (f.groupe) {
    const g = REPARTITION[id]?.find((r) => r.groupe.id === f.groupe);
    if (g) return { ...x.fait, duFiltre: { type: 'groupe', ligne: g.ligne, decompte: g.decompte, membres: g.membres } };
  }
  return x.fait;
}

/** Faits retenus d'un onglet ; « personnes » : ceux qui ont agi (parole, amendement, vote). */
function faitsDe(base: Indexe[], onglet: TypeFait, f: FiltresFaits): Indexe[] {
  if (onglet !== 'personnes') return base.filter((x) => x.onglet === onglet && retenu(x, f));
  const actes = base.filter((x) => TYPES_ACTION.includes(x.onglet) && retenu(x, f));
  // Un scrutin cite tous ses votants : on ne garde que la personne ou le groupe filtrés.
  const ids = [...new Set(actes.flatMap((x) => x.personnes))].filter(
    (p) => (!f.personne || p === f.personne) && (!f.groupe || personneRef(p)?.groupe?.id === f.groupe),
  );
  return ids.flatMap((id): Indexe[] => {
    const personne = personneRef(id);
    if (!personne) return [];
    const n = (t: TypeFait) => actes.filter((x) => x.onglet === t && x.personnes.includes(id)).length;
    return [
      {
        onglet: 'interventions',
        fait: { type: 'personne', id, personne, interventions: n('interventions'), amendements: n('amendements'), votes: n('votes') },
        groupes: personne.groupe ? [personne.groupe.id] : [],
        personnes: [id],
        date: null,
      },
    ];
  });
}

/** Clé et nom du groupe d'un fait pour un regroupement (null : « Sans … »). */
function cleDe(x: Indexe, r: Regroupement): string | null {
  switch (r) {
    case 'dossier':
      return x.dossier ?? null;
    case 'etape':
      return x.dossier && x.etape ? `${x.dossier}/${x.etape}` : null;
    case 'article':
      return x.article ?? null;
    case 'groupe':
      return x.fait.type === 'scrutin' ? null : (x.groupes[0] ?? null);
    case 'personne':
      return x.fait.type === 'scrutin' ? null : (x.personnes[0] ?? null);
    case 'organe':
      return x.organe ?? null;
    case 'date':
      return x.date;
    case 'sort':
      return x.sort ?? null;
    case 'nature':
      return x.nature ?? null;
  }
}

const SANS: Record<Regroupement, string> = {
  dossier: 'Sans dossier',
  etape: 'Sans étape précise',
  article: 'Sans article précis',
  groupe: 'Sans groupe',
  personne: 'Orateur sans personne identifiée',
  organe: 'Sans organe',
  date: 'Sans date',
  sort: 'Sort non publié',
  nature: 'Autres',
};

const CLE_FILTRE: Partial<Record<Regroupement, CleFiltre>> = {
  dossier: 'dossier',
  etape: 'etape',
  article: 'article',
  groupe: 'groupe',
  personne: 'personne',
  organe: 'organe',
};

function tete(r: Regroupement, cle: string | null, f: FiltresFaits): Omit<GroupeFaits, 'total' | 'faits'> {
  const id = `${r}:${cle ?? ''}`;
  if (cle === null) return { cle: id, libelle: SANS[r], detail: null, groupe: null, filtre: null };
  const filtreCle = CLE_FILTRE[r];
  // L'étape ne filtre qu'à l'intérieur du dossier filtré ; un filtre déjà posé ne se répète pas.
  const valeur = r === 'etape' ? cle.split('/')[1] : cle;
  const filtre = filtreCle && f[filtreCle] !== valeur && (r !== 'etape' || f.dossier === cle.split('/')[0]) ? { cle: filtreCle, id: valeur } : null;
  switch (r) {
    case 'dossier':
      return { cle: id, libelle: DOSSIERS.find((d) => d.id === cle)?.titre ?? cle, detail: null, groupe: null, filtre };
    case 'etape': {
      const [d, c] = cle.split('/');
      return { cle: id, libelle: caseDe(d, c as CleCase)?.libelle ?? c, detail: DOSSIERS.find((x) => x.id === d)?.titre ?? null, groupe: null, filtre };
    }
    case 'article':
      return { cle: id, libelle: `Art. ${ARTICLES.find((a) => a.id === cle)?.numero ?? cle}`, detail: null, groupe: null, filtre };
    case 'groupe': {
      const g = groupeRef(cle);
      return { cle: id, libelle: g?.libelle ?? cle, detail: null, groupe: g, filtre };
    }
    case 'personne': {
      const p = personneRef(cle);
      return { cle: id, libelle: p?.nom ?? cle, detail: p?.fonction ?? null, groupe: p?.groupe ?? null, filtre };
    }
    case 'organe':
      return { cle: id, libelle: ORGANES.find((o) => o.id === cle)?.nom ?? cle, detail: null, groupe: null, filtre };
    case 'sort':
      return { cle: id, libelle: LIBELLE_SORT[cle as SortAmendement] ?? cle, detail: null, groupe: null, filtre: null };
    case 'date':
    case 'nature':
      return { cle: id, libelle: cle, detail: null, groupe: null, filtre: null };
  }
}

/** Du plus récent au plus ancien, puis par identifiant. */
const parDate = (a: Indexe, b: Indexe) => (b.date ?? '').localeCompare(a.date ?? '') || a.fait.id.localeCompare(b.fait.id);

interface Groupe {
  cle: string | null;
  faits: Indexe[];
}

function regrouper(faits: Indexe[], r: Regroupement): Groupe[] {
  const par = new Map<string | null, Indexe[]>();
  for (const x of faits) par.set(cleDe(x, r), [...(par.get(cleDe(x, r)) ?? []), x]);
  const groupes = [...par.entries()].map(([cle, liste]) => ({ cle, faits: [...liste].sort(parDate) }));
  const premiere = (g: Groupe) => g.faits.reduce((m, x) => (x.date && (!m || x.date < m) ? x.date : m), null as string | null) ?? '9999';
  const ordre = (a: Groupe, b: Groupe) => {
    if ((a.cle === null) !== (b.cle === null)) return a.cle === null ? 1 : -1;
    switch (r) {
      case 'date':
        return (b.cle ?? '').localeCompare(a.cle ?? '');
      case 'sort':
        return ORDRE_SORT.indexOf(a.cle ?? '') - ORDRE_SORT.indexOf(b.cle ?? '');
      case 'etape':
        return premiere(a).localeCompare(premiere(b));
      default:
        return b.faits.length - a.faits.length || (a.cle ?? '').localeCompare(b.cle ?? '');
    }
  };
  return groupes.sort(ordre);
}

const paginer = <T>(liste: T[], { page, taille }: { page: number; taille: number }): Page<T> => ({
  elements: liste.slice((page - 1) * taille, page * taille),
  page,
  taille,
  total: liste.length,
  suivante: page * taille < liste.length ? page + 1 : null,
});

function compter(base: Indexe[], f: FiltresFaits): Record<TypeFait, number> {
  return Object.fromEntries(TYPES_FAITS.map((t) => [t, faitsDe(base, t, f).length])) as Record<TypeFait, number>;
}

function groupesDe(base: Indexe[], d: DemandeGroupes): Page<GroupeFaits> {
  const groupes = regrouper(faitsDe(base, d.onglet, d.filtres), d.regroupement).map((g) => ({
    ...tete(d.regroupement, g.cle, d.filtres),
    total: g.faits.length,
    faits: g.faits.slice(0, APERCU_GROUPE).map((x) => affiche(x, d.filtres)),
  }));
  return paginer(groupes, d.page);
}

function deplier(base: Indexe[], d: DemandeGroupes, cle: string): Page<Fait> {
  const g = regrouper(faitsDe(base, d.onglet, d.filtres), d.regroupement).find((x) => `${d.regroupement}:${x.cle ?? ''}` === cle);
  return paginer((g?.faits ?? []).map((x) => affiche(x, d.filtres)), d.page);
}

/** Nom, pastille et fiche de chaque filtre posé ; null si un identifiant est inconnu. */
function nommer(f: FiltresFaits): Nommes {
  const nommes: Exclude<Nommes, null> = [];
  const ajouter = (cle: CleFiltre, id: string, libelle: string, detail: string | null, groupe: GroupeRef | null, fiche: ObjetFocal['fiche']) =>
    nommes.push({ actif: { cle, famille: familleDe(cle), id, libelle, groupe }, focal: { cle, id, libelle, detail, groupe, fiche } });
  for (const [cle, id] of Object.entries(f) as [CleFiltre, string][]) {
    if (id === undefined) continue;
    switch (cle) {
      case 'dossier': {
        const d = DOSSIERS.find((x) => x.id === id);
        if (!d) return null;
        ajouter(cle, id, d.titre, d.type, null, { type: 'dossier', id });
        break;
      }
      case 'etape': {
        const c = f.dossier ? caseDe(f.dossier, id as CleCase) : null;
        if (!c || !f.dossier) return null;
        ajouter(cle, id, c.libelle, DOSSIERS.find((x) => x.id === f.dossier)?.titre ?? null, null, { type: 'etape', dossier: f.dossier, cle: c.cle });
        break;
      }
      case 'article': {
        const a = ARTICLES.find((x) => x.id === id);
        if (!a) return null;
        ajouter(cle, id, `Art. ${a.numero}`, dossierDeLArticle(id)?.titre ?? null, null, { type: 'article', id });
        break;
      }
      case 'groupe': {
        const g = groupeRef(id);
        if (!g) return null;
        ajouter(cle, id, g.libelle, CHAMBRES[g.chambre], g, { type: 'institution', institution: g.chambre === 'AN' ? 'an' : 'senat' });
        break;
      }
      case 'personne': {
        const p = personneRef(id);
        if (!p) return null;
        ajouter(cle, id, p.nom, p.fonction, p.groupe, { type: 'personne', id });
        break;
      }
      case 'chambre': {
        if (id !== 'AN' && id !== 'SENAT') return null;
        ajouter(cle, id, CHAMBRES[id], null, null, { type: 'institution', institution: id === 'AN' ? 'an' : 'senat' });
        break;
      }
      case 'organe': {
        const o = ORGANES.find((x) => x.id === id);
        if (!o) return null;
        ajouter(cle, id, o.nom, CHAMBRES[CHAMBRE_DE_L_ORGANE[id]], null, null);
        break;
      }
      case 'scrutin': {
        const s = SCRUTINS.find((x) => x.id === id);
        if (!s) return null;
        ajouter(cle, id, `Scrutin n° ${s.numero}`, s.intitule, null, { type: 'scrutin', id });
        break;
      }
      case 'amendement': {
        const a = AMDTS.find((x) => x.id === id);
        if (!a) return null;
        ajouter(cle, id, `Amendement ${a.numero}`, a.division, null, { type: 'amendement', id });
        break;
      }
      case 'departement':
        return null;
    }
  }
  return nommes;
}

/** Valeurs du niveau suivant, avec le nombre d'actions législatives si on les ajoute. */
function suggerer(base: Indexe[], f: FiltresFaits, cle: CleFiltre, limite: number): SuggestionFiltre[] {
  const actes = base.filter((x) => TYPES_ACTION.includes(x.onglet) && retenu(x, f));
  const valeurs = new Set(
    actes.flatMap((x): string[] => {
      switch (cle) {
        case 'groupe':
          return x.groupes;
        case 'personne':
          return x.personnes.filter((p) => !f.groupe || personneRef(p)?.groupe?.id === f.groupe);
        case 'dossier':
        case 'etape':
        case 'article':
        case 'chambre':
        case 'organe':
          return x[cle] ? [x[cle]!] : [];
        default:
          return [];
      }
    }),
  );
  return [...valeurs]
    .flatMap((v): SuggestionFiltre[] => {
      const avec = { ...f, [cle]: v };
      const nombre = actes.filter((x) => retenu(x, avec)).length;
      const nom = nommer({ ...(cle === 'etape' ? { dossier: f.dossier } : {}), [cle]: v })?.find((n) => n.actif.cle === cle);
      return nombre && nom ? [{ cle, id: v, libelle: nom.actif.libelle, nombre, groupe: nom.actif.groupe }] : [];
    })
    .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle))
    .slice(0, limite);
}

function scrutinFiltre(id: string, groupe: string | null): ScrutinFiltre | null {
  const s = SCRUTINS.find((x) => x.id === id);
  if (!s) return null;
  const groupes = REPARTITION[id] ?? [];
  const ligne = groupe ? groupes.find((g) => g.groupe.id === groupe)?.ligne ?? null : null;
  const membres = groupe
    ? Object.entries(VOTANTS[id] ?? {}).flatMap(([pid, position]) => {
        const personne = personneRef(pid);
        if (personne?.groupe?.id !== groupe) return [];
        const exprimee = position === 'pour' || position === 'contre' || position === 'abstention';
        return [{ personne, position, parDelegation: false, contreSonGroupe: exprimee && ligne !== null && ligne !== position }];
      })
    : null;
  return { scrutin: s, groupes, membres };
}

/** Lecteur synchrone sur une base de faits (fixtures, adaptateur mémoire de l'API). */
export function lecteurFaits(base: Indexe[] = BASE_FAITS) {
  return (l: Lecture): ReponseLecture => {
    switch (l.type) {
      case 'nommer':
        return nommer(l.filtres);
      case 'compter':
        return compter(base, l.filtres);
      case 'groupes':
        return groupesDe(base, l.demande);
      case 'deplier':
        return deplier(base, l.demande, l.cle);
      case 'suggerer':
        return suggerer(base, l.filtres, l.cle, l.limite);
      case 'scrutin':
        return scrutinFiltre(l.scrutin, l.groupe);
    }
  };
}

export type { Indexe as FaitIndexe };

// ---------- Exemples ----------

const exemple = (demande: DemandeFaits): ExplorationFaits =>
  explorerSync(demande, { page: demande.page ?? 1, taille: demande.taille ?? 20 }, lecteurFaits());

export const EXPLORER_TOUT = exemple({});
export const EXPLORER_ENERGIE = exemple({ filtres: { dossier: D.energie.id } });
export const EXPLORER_ART3_SEANCE = exemple({
  filtres: { dossier: D.energie.id, etape: 'seance_1_o', article: ART.e3.id },
  ordre: ['dossier', 'etape', 'article'],
});
export const EXPLORER_ART3_GROUPE_A = exemple({
  filtres: { dossier: D.energie.id, etape: 'seance_1_o', article: ART.e3.id, groupe: G.A.id },
  ordre: ['dossier', 'etape', 'article', 'groupe'],
  comparer: G.C.id,
});
export const EXPLORER_CAMILLE = exemple({ filtres: { personne: P.camille.id, groupe: G.A.id }, ordre: ['personne'] });
export const EXPLORER_CAMILLE_VOTES = exemple({ filtres: { personne: P.camille.id }, onglet: 'votes' });
export const EXPLORER_SCRUTIN_GROUPE_A = exemple({ filtres: { scrutin: S.an1874.id, groupe: G.A.id }, ordre: ['scrutin', 'groupe'] });
export const EXPLORER_CE123 = exemple({ filtres: { amendement: A.ce123.id }, onglet: 'votes' });
export const EXPLORER_ENERGIE_TRANSPARENCE = exemple({ filtres: { dossier: D.energie.id }, onglet: 'transparence' });
export const EXPLORER_ENERGIE_SORT_ADOPTE = exemple({ filtres: { dossier: D.energie.id }, onglet: 'amendements', deplier: 'sort:adopte', taille: 3 });
export const EXPLORER_VIDE = exemple({ filtres: { article: ART.l2.id, groupe: G.A.id }, ordre: ['article', 'groupe'] });
export const EXPLORER_DEPARTEMENT = exemple({ filtres: { dossier: D.energie.id, departement: '33' } });
