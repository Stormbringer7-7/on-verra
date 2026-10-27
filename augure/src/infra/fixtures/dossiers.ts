// Fixtures : les deux dossiers fictifs du canevas et les autres lignes de la liste.
//   - énergie : projet de loi, procédure accélérée, CMP conclusive, Conseil constitutionnel saisi ;
//   - location : proposition de loi, navette normale, deux lectures, CMP en échec, dernier mot à l'AN.
// Synthèses : présentes (comme relues) pour le dossier énergie, absentes (null) pour le dossier
// location, afin que l'UI montre les deux cas (« Pas de synthèse disponible »).

import type {
  Accueil,
  AmendementRef,
  AmendementResume,
  ArticleRef,
  Auteur,
  CaseCompacte,
  CaseParcours,
  Chiffre,
  CleCase,
  DocumentOfficiel,
  DossierRef,
  DossierResume,
  EtapeResume,
  FicheAmendement,
  FicheArticle,
  FicheDossier,
  FicheEtape,
  ListeDossiers,
  Lieu,
  Parcours,
  SegmentDiff,
  StatAmendementsEtape,
  TypeDocument,
  VersionArticle,
} from '../../core/domain/model';
import {
  A,
  ART,
  BARRE_BUDGET,
  BARRE_ENERGIE,
  BARRE_EPARGNE,
  BARRE_LOCATION,
  BARRE_MEDECINS,
  D,
  G,
  P,
  comme,
  lienFictif,
  orateur,
  prov,
} from './entites';
import { INTERVENANTS, INTERVENTIONS_CE123, extrait } from './discussions';
import { INTERETS } from './interets';
import { S } from './scrutins';

const ch = (libelle: string, valeur: number | string, detail: string | null = null): Chiffre => ({ libelle, valeur, detail });
const ou = (cases: CaseCompacte[], cle: CleCase) => {
  const c = cases.find((x) => x.cle === cle)!;
  return { cle, libelle: c.libelle };
};
const auteur = (p: typeof P.camille): Auteur => ({ type: 'personne', personne: p });

// ---------- Parcours complets ----------

type Detail = { lieu: Lieu | null; debut?: string; fin?: string; conclusion?: string; programmeeLe?: string; facultative?: boolean };

function parcoursComplet(dossier: string, cases: CaseCompacte[], details: Partial<Record<CleCase, Detail>>): CaseParcours[] {
  return cases.map((c, i) => {
    const d = details[c.cle] ?? { lieu: null };
    const facultative =
      d.facultative ??
      !['depot', 'commission_1_o', 'seance_1_o', 'transmission_1_s', 'commission_1_s', 'seance_1_s', 'promulgation', 'jo'].includes(c.cle);
    return {
      rang: i + 1,
      cle: c.cle,
      libelle: c.libelle,
      lieu: d.lieu,
      facultative,
      nature: facultative ? (c.cle === 'cc' ? 'facultative' : 'conditionnelle') : 'obligatoire',
      etat: c.etat,
      courante: c.courante,
      attendue: c.attendue,
      deviation: c.deviation,
      debut: d.debut ?? null,
      fin: d.fin ?? null,
      programmeeLe: d.programmeeLe ?? null,
      conclusion: d.conclusion ?? null,
      provenance: c.etat === 'faite' || c.etat === 'en_cours' ? [prov('AN', 'acte', `${dossier}-${c.cle}`)] : [],
    };
  });
}

const CASES_ENERGIE = parcoursComplet('DLR5L17N-energie', BARRE_ENERGIE, {
  depot: { lieu: 'AN', debut: '2026-01-12', fin: '2026-01-12' },
  commission_1_o: { lieu: 'AN', debut: '2026-01-28', fin: '2026-02-04' },
  seance_1_o: { lieu: 'AN', debut: '2026-03-03', fin: '2026-03-18', conclusion: 'adopté' },
  commission_1_s: { lieu: 'SENAT', debut: '2026-04-22', fin: '2026-05-06' },
  seance_1_s: { lieu: 'SENAT', debut: '2026-05-19', fin: '2026-05-28', conclusion: 'modifié' },
  lecture_2_o: { lieu: 'AN' },
  lecture_2_s: { lieu: 'SENAT' },
  cmp: { lieu: 'CMP', debut: '2026-06-24', fin: '2026-06-24', conclusion: 'Accord' },
  conclusions_cmp: { lieu: null, debut: '2026-10-14', fin: '2026-10-15', conclusion: 'Sénat : adopté · AN : adopté' },
  nouvelle_lecture: { lieu: null },
  lecture_definitive: { lieu: 'AN' },
  cc: { lieu: 'CC', debut: '2026-10-17' },
  promulgation: { lieu: 'PR' },
  jo: { lieu: 'JO' },
});

const CASES_LOCATION = parcoursComplet('DLR5L17N-location', BARRE_LOCATION, {
  depot: { lieu: 'AN', debut: '2025-11-14', fin: '2025-11-14' },
  lecture_1_o: { lieu: 'AN', debut: '2026-01-15', fin: '2026-02-05', conclusion: 'adoptée' },
  lecture_1_s: { lieu: 'SENAT', debut: '2026-03-11', fin: '2026-04-09', conclusion: 'modifiée' },
  lecture_2_o: { lieu: 'AN', debut: '2026-05-20', fin: '2026-06-11', conclusion: 'modifiée' },
  lecture_2_s: { lieu: 'SENAT', debut: '2026-06-18', fin: '2026-07-02', conclusion: 'modifiée' },
  cmp: { lieu: 'CMP', debut: '2026-09-09', fin: '2026-09-16', conclusion: 'Désaccord' },
  conclusions_cmp: { lieu: null },
  nouvelle_lecture: { lieu: null, debut: '2026-10-08', fin: '2026-10-14', conclusion: 'AN : adoptée · Sénat : rejetée' },
  lecture_definitive: { lieu: 'AN', programmeeLe: '2026-11-05' },
  cc: { lieu: 'CC' },
  promulgation_jo: { lieu: 'PR' },
});

const LOI_ORDINAIRE: Parcours['modele'] = {
  cle: 'loi_ordinaire',
  version: 1,
  libelle: 'Loi ordinaire',
  famille: 'legislatif',
  fondement: 'Constitution, art. 39 à 45 (navette, CMP, dernier mot de l’AN), 61 (Conseil constitutionnel) et 10 (promulgation)',
};

export const PARCOURS_ENERGIE: Parcours = {
  modele: LOI_ORDINAIRE,
  procedure: 'acceleree',
  origine: 'AN',
  cases: CASES_ENERGIE,
  deviations: [
    {
      cle: 'procedure_acceleree',
      libelle: 'Procédure accélérée',
      fondement: 'Constitution, art. 45, al. 2 : CMP possible après une seule lecture dans chaque chambre',
      etape: 'depot',
      effet: 'rejoint',
      debut: '2026-01-12',
      conclusion: null,
      provenance: [prov('AN', 'acte', 'DLR5L17N-energie-procacc')],
    },
  ],
  branches: [],
  parent: null,
  enfants: [],
  dateReference: '2026-10-24',
  prochaineEcheance: null,
};

export const PARCOURS_LOCATION: Parcours = {
  modele: LOI_ORDINAIRE,
  procedure: 'normale',
  origine: 'AN',
  cases: CASES_LOCATION,
  deviations: [],
  branches: [{ de: 'cmp', vers: 'nouvelle_lecture', libelle: 'CMP sans accord : nouvelle lecture' }],
  parent: null,
  enfants: [],
  dateReference: '2026-10-24',
  prochaineEcheance: {
    date: '2026-11-05',
    heure: '2026-11-05T15:00:00+01:00',
    libelle: 'Lecture définitive AN · Séance publique',
    etat: 'Confirmé',
    cle: 'lecture_definitive',
  },
};

// ---------- Listes ----------

const resume = (
  dossier: DossierRef,
  titreOfficiel: string,
  titreEnClair: string | null,
  type: string,
  origine: DossierResume['origine'],
  etat: DossierResume['etat'],
  procedure: DossierResume['procedure'],
  barre: CaseCompacte[],
  dernierEvenement: DossierResume['dernierEvenement'],
  prochaineEcheance: DossierResume['prochaineEcheance'] = null,
): DossierResume => {
  const courante = barre.find((c) => c.courante);
  return {
    id: dossier.id,
    titre: dossier.titre,
    titreOfficiel,
    titreEnClair,
    type,
    nature: type.startsWith('Projet') ? 'projet' : 'proposition',
    origine,
    theme: null,
    etat,
    procedure,
    barre,
    etapeCourante: courante ? { cle: courante.cle, libelle: courante.libelle, etat: courante.etat } : null,
    prochaineEcheance,
    dernierEvenement,
    parent: null,
  };
};

export const RESUMES = {
  energie: resume(
    D.energie, 'Projet de loi de programmation énergétique 2026-2035', 'Planifier l’énergie de la France jusqu’en 2035',
    'Projet de loi', 'gouvernement', 'en_cours', 'acceleree', BARRE_ENERGIE,
    { date: '2026-10-17', libelle: 'Conseil constitutionnel saisi par 60 députés' },
  ),
  location: resume(
    D.location, 'Proposition de loi visant à réguler les meublés de tourisme', null,
    'Proposition de loi ordinaire', 'parlementaire', 'en_cours', 'normale', BARRE_LOCATION,
    { date: '2026-10-14', libelle: 'Nouvelle lecture : le Sénat rejette le texte' },
    PARCOURS_LOCATION.prochaineEcheance,
  ),
  budget: resume(
    D.budget, 'Projet de loi de finances pour 2027', 'Le budget de l’État pour 2027',
    'Projet de loi de finances de l’année', 'gouvernement', 'en_cours', 'normale', BARRE_BUDGET,
    { date: '2026-10-20', libelle: 'Séance publique à l’Assemblée' },
    { date: '2026-10-28', heure: '2026-10-28T16:00:00+01:00', libelle: '1re lecture AN · Vote solennel sur la première partie', etat: 'Confirmé', cle: 'lecture_1_o' },
  ),
  medecins: resume(
    D.medecins, 'Loi n° 2026-412 visant à améliorer l’accès aux soins', 'Réguler l’installation des médecins',
    'Proposition de loi ordinaire', 'parlementaire', 'promulgue', 'normale', BARRE_MEDECINS,
    { date: '2026-04-03', libelle: 'Loi n° 2026-412 publiée au Journal officiel' },
  ),
  epargne: resume(
    D.epargne, 'Projet de loi créant un compte épargne-temps universel', 'Créer un compte épargne-temps universel',
    'Projet de loi', 'gouvernement', 'adopte', 'acceleree', BARRE_EPARGNE,
    { date: '2026-10-01', libelle: 'Adopté définitivement, promulgation en attente' },
  ),
  video: resume(
    D.video, 'Proposition de loi généralisant la vidéoprotection algorithmique', null,
    'Proposition de loi ordinaire', 'parlementaire', 'rejete', 'normale', [],
    { date: '2026-06-11', libelle: 'Rejeté en séance à l’Assemblée' },
  ),
  ia: resume(
    D.ia, 'Loi n° 2026-198 d’adaptation au règlement européen sur l’intelligence artificielle', 'Adapter le droit français au règlement européen sur l’IA',
    'Projet de loi', 'gouvernement', 'promulgue', 'acceleree', [],
    { date: '2026-02-19', libelle: 'Loi n° 2026-198 publiée au Journal officiel' },
  ),
};

export const ACCUEIL: Accueil = {
  semaine: { debut: '2026-10-19', fin: '2026-10-25' },
  dossiers: [RESUMES.location, RESUMES.budget, RESUMES.energie, RESUMES.medecins],
  votes: [S.an2433, S.an2398, S.an2410, S.sen297],
};

const TOUS = [RESUMES.energie, RESUMES.location, RESUMES.budget, RESUMES.epargne, RESUMES.medecins, RESUMES.video, RESUMES.ia];

const FACETTES: ListeDossiers['facettes'] = {
  etats: [
    { valeur: 'en_cours', libelle: 'En cours', nombre: 3 },
    { valeur: 'adopte', libelle: 'Adoptés', nombre: 1 },
    { valeur: 'promulgue', libelle: 'Promulgués', nombre: 2 },
    { valeur: 'rejete', libelle: 'Rejetés', nombre: 1 },
  ],
  origines: [
    { valeur: 'gouvernement', libelle: 'Gouvernement', nombre: 4 },
    { valeur: 'parlementaire', libelle: 'Parlementaires', nombre: 3 },
  ],
  themes: [],
};

export const LISTE_DOSSIERS: ListeDossiers = {
  legislature: '17',
  filtre: {},
  facettes: FACETTES,
  dossiers: { elements: TOUS, page: 1, taille: 20, total: TOUS.length, suivante: null },
};

const PARLEMENTAIRES = TOUS.filter((d) => d.origine === 'parlementaire');
export const LISTE_DOSSIERS_PARLEMENTAIRES: ListeDossiers = {
  legislature: '17',
  filtre: { origine: 'parlementaire' },
  facettes: FACETTES,
  dossiers: { elements: PARLEMENTAIRES, page: 1, taille: 20, total: PARLEMENTAIRES.length, suivante: null },
};

// ---------- Amendements ----------

const amdt = (
  ref: AmendementRef,
  etape: CleCase,
  barre: CaseCompacte[],
  article: ArticleRef | null,
  division: string,
  sort: AmendementResume['sort'],
  objet: string | null,
  qui: Auteur,
  cosignataires: number,
): AmendementResume => ({
  ...ref,
  etape: ou(barre, etape),
  article,
  division,
  sort,
  objet,
  auteur: qui,
  cosignataires,
});

export const AMENDEMENTS = {
  ce123: amdt(A.ce123, 'commission_1_o', BARRE_ENERGIE, ART.e3, 'Article 3', 'adopte', 'Relever l’objectif de renouvelables à 45 % en 2035', auteur(P.ines), 12),
  n1876: amdt(A.n1876, 'seance_1_o', BARRE_ENERGIE, ART.e5, 'Article 5', 'rejete', 'Lancer six réacteurs supplémentaires d’ici 2040 (au lieu de 2045)', auteur(P.hugo), 21),
  com56: amdt(A.com56, 'commission_1_s', BARRE_ENERGIE, ART.e3, 'Article 3', 'adopte', 'Ramener l’objectif de renouvelables à 42 %', auteur(P.paul), 0),
  s412: amdt(A.s412, 'seance_1_s', BARRE_ENERGIE, ART.e14bis, 'Article additionnel après l’article 14', 'adopte', 'Bilan de la loi devant le Parlement tous les deux ans', auteur(comme(P.pierre, 'Rapporteur · Groupe S1')), 0),
  n2051: amdt(A.n2051, 'seance_1_o', BARRE_ENERGIE, ART.e11, 'Article 11', 'retire', 'Supprimer les tarifs réglementés en 2030', auteur(P.louis), 0),
  ce88: amdt(A.ce88, 'commission_1_o', BARRE_ENERGIE, ART.e8, 'Article 8', 'adopte', 'Étendre l’obligation aux bâtiments des collectivités', auteur(comme(P.camille, 'Rapporteure · Groupe A')), 0),
  n655: amdt(A.n655, 'seance_1_o', BARRE_ENERGIE, ART.e3, 'Article 3', 'adopte', 'Ajouter un objectif propre à la chaleur', auteur(P.lea), 4),
  // location : objets en clair absents (synthèse non disponible)
  ce40: amdt(A.ce40, 'lecture_1_o', BARRE_LOCATION, ART.l2, 'Article 2', 'adopte', null, auteur(P.ines), 10),
  com12: amdt(A.com12, 'lecture_1_s', BARRE_LOCATION, ART.l2, 'Article 2', 'adopte', null, auteur(P.paul), 0),
  n33: amdt(A.n33, 'lecture_2_o', BARRE_LOCATION, ART.l2, 'Article 2', 'adopte', null, auteur(P.ines), 0),
  s9: amdt(A.s9, 'lecture_1_s', BARRE_LOCATION, ART.l4, 'Article 4', 'adopte', null, auteur(P.pierre), 0),
  n51: amdt(A.n51, 'lecture_1_o', BARRE_LOCATION, ART.l2, 'Article 2', 'rejete', null, auteur(P.hugo), 3),
};

const page = <T>(elements: T[]) => ({ elements, page: 1, taille: 20, total: elements.length, suivante: null });
const stat = (barre: CaseCompacte[], cle: CleCase, deposes: number, adoptes: number): StatAmendementsEtape => ({ ...ou(barre, cle), deposes, adoptes });

// ---------- Fiche du dossier énergie ----------

const etapeResume = (
  cases: CaseParcours[],
  cle: CleCase,
  organe: EtapeResume['organe'],
  resumeEnClair: string | null,
  chiffres: Chiffre[],
): EtapeResume => {
  const c = cases.find((x) => x.cle === cle)!;
  return {
    cle,
    libelle: c.libelle,
    lieu: c.lieu,
    organe,
    etat: c.etat,
    courante: c.courante,
    debut: c.debut,
    fin: c.fin,
    conclusion: c.conclusion,
    resume: resumeEnClair,
    chiffres,
  };
};

const AFFECO_AN = { id: 'commission-affeco-an', nom: 'Commission des affaires économiques' };
const AFFECO_SENAT = { id: 'commission-affeco-senat', nom: 'Commission des affaires économiques (Sénat)' };

export const FICHE_ENERGIE: FicheDossier = {
  entete: {
    id: D.energie.id,
    titre: D.energie.titre,
    titreOfficiel: 'Projet de loi de programmation énergétique 2026-2035',
    titreEnClair: 'Planifier l’énergie de la France jusqu’en 2035',
    type: 'Projet de loi',
    nature: 'projet',
    procedure: 'acceleree',
    origine: 'gouvernement',
    theme: null,
    legislature: '17',
    dateDepot: '2026-01-12',
    etat: 'en_cours',
    auteur: { type: 'gouvernement', ministre: comme(P.claire, 'Ministre de la Transition énergétique') },
    cosignataires: 0,
    resumeEnClair:
      'Fixe les objectifs de production et de consommation d’énergie de la France pour 2026-2035 : part des renouvelables, nucléaire, économies d’énergie.',
  },
  parcours: PARCOURS_ENERGIE,
  ceQuiAChange: [
    { article: ART.e3, resume: 'Objectif renouvelables relevé de 40 % à 45 % en 2035' },
    { article: ART.e5, resume: 'Nouveaux réacteurs : « jusqu’à six » au lieu de « six »' },
    { article: ART.e14bis, resume: 'Bilan devant le Parlement tous les deux ans, ajouté par le Sénat' },
  ],
  etapes: [
    etapeResume(CASES_ENERGIE, 'depot', null, 'Déposé par le Gouvernement · 18 articles · étude d’impact publiée', [ch('Articles', 18)]),
    etapeResume(CASES_ENERGIE, 'commission_1_o', AFFECO_AN, null, [ch('Amendements déposés', 612), ch('Amendements adoptés', 96)]),
    etapeResume(CASES_ENERGIE, 'seance_1_o', null, null, [ch('Amendements déposés', 1980), ch('Amendements adoptés', 214), ch('Scrutins publics', 2)]),
    etapeResume(CASES_ENERGIE, 'commission_1_s', AFFECO_SENAT, null, [ch('Amendements déposés', 248), ch('Amendements adoptés', 61)]),
    etapeResume(CASES_ENERGIE, 'seance_1_s', null, 'Texte modifié par le Sénat', [ch('Amendements déposés', 402), ch('Amendements adoptés', 31), ch('Scrutins publics', 1)]),
    etapeResume(CASES_ENERGIE, 'cmp', null, 'Accord trouvé sur les 9 articles restant en discussion', [ch('Articles en discussion', 9), ch('Membres', 14)]),
    etapeResume(CASES_ENERGIE, 'conclusions_cmp', null, 'Conclusions de la CMP adoptées par les deux chambres', [ch('Scrutins publics', 2)]),
    etapeResume(CASES_ENERGIE, 'cc', null, 'Examen en cours · décision attendue avant le 17/11/2026', [ch('Saisissants', '60 députés')]),
    etapeResume(CASES_ENERGIE, 'promulgation', null, null, []),
    etapeResume(CASES_ENERGIE, 'jo', null, null, []),
  ],
  versionsDuTexte: 5,
  articles: [
    { article: ART.e1, intitule: 'Objectifs généraux de la politique énergétique', modifications: 0, etat: 'inchange', ajoutePar: null },
    { article: ART.e3, intitule: 'Part des énergies renouvelables en 2035', modifications: 4, etat: 'modifie', ajoutePar: null },
    { article: ART.e5, intitule: 'Nouveaux réacteurs nucléaires', modifications: 2, etat: 'modifie', ajoutePar: null },
    { article: ART.e8, intitule: 'Économies d’énergie dans les bâtiments publics', modifications: 1, etat: 'modifie', ajoutePar: null },
    { article: ART.e11, intitule: 'Tarifs réglementés de l’électricité', modifications: 2, etat: 'modifie', ajoutePar: null },
    { article: ART.e14bis, intitule: 'Bilan devant le Parlement tous les deux ans', modifications: 1, etat: 'ajoute', ajoutePar: 'SENAT' },
  ],
  amendements: {
    parEtape: [
      stat(BARRE_ENERGIE, 'commission_1_o', 612, 96),
      stat(BARRE_ENERGIE, 'seance_1_o', 1980, 214),
      stat(BARRE_ENERGIE, 'commission_1_s', 248, 61),
      stat(BARRE_ENERGIE, 'seance_1_s', 402, 31),
    ],
    filtre: {},
    liste: page([AMENDEMENTS.ce123, AMENDEMENTS.n1876, AMENDEMENTS.com56, AMENDEMENTS.s412, AMENDEMENTS.n2051, AMENDEMENTS.ce88]),
  },
  scrutins: [S.an1874, S.an1880, S.sen212, S.sen298, S.an2410],
  acteurs: [
    {
      role: 'gouvernement',
      libelle: 'Gouvernement',
      total: 1,
      acteurs: [{ qui: orateur(P.claire), role: 'Ministre de la Transition énergétique · porte le texte', activite: ch('Interventions', 54) }],
    },
    {
      role: 'rapporteur',
      libelle: 'Rapporteurs',
      total: 2,
      acteurs: [
        { qui: orateur(P.camille), role: 'Députée · Groupe A · rapporteure à l’Assemblée', activite: ch('Amendements', 41) },
        { qui: orateur(P.pierre), role: 'Sénateur · Groupe S1 · rapporteur au Sénat', activite: ch('Amendements', 23) },
      ],
    },
    {
      role: 'cmp',
      libelle: 'Commission mixte paritaire',
      total: 14,
      acteurs: [
        { qui: orateur(P.camille), role: 'Rapporteure AN · membre de la CMP', activite: null },
        { qui: orateur(P.pierre), role: 'Rapporteur Sénat · membre de la CMP', activite: null },
      ],
    },
    {
      role: 'auteurs_amendements',
      libelle: 'Auteurs d’amendements les plus actifs',
      total: 2,
      acteurs: [
        { qui: orateur(P.ines), role: 'Députée · Groupe C', activite: ch('Amendements', 38) },
        { qui: orateur(P.hugo), role: 'Député · Groupe B', activite: ch('Amendements', 31) },
      ],
    },
    {
      role: 'saisissants_cc',
      libelle: 'Saisine du Conseil constitutionnel',
      total: 60,
      acteurs: [{ qui: orateur(P.hugo), role: 'Premier signataire de la saisine · Groupe B', activite: null }],
    },
  ],
  interets: INTERETS.dossierEnergie,
  chiffres: [
    ch('Étapes franchies', '7 / 10'),
    ch('Amendements déposés', 3242),
    ch('Amendements adoptés', 402),
    ch('Scrutins publics', 5),
    ch('Interventions en séance', 1214),
    ch('Durée d’examen', '9 mois'),
  ],
  sources: [
    prov('AN', 'dossier', 'DLR5L17N-energie', lienFictif('an/dossier/energie')),
    prov('SENAT', 'dossier', 'pjl25-energie', lienFictif('senat/dossier/energie')),
    prov('LEGIFRANCE', 'dossier', 'JORFDOLE-energie', null),
    prov('CONSTIT', 'saisine', '2026-xxx DC', null),
  ],
};

// ---------- Fiche du dossier location ----------

export const FICHE_LOCATION: FicheDossier = {
  entete: {
    id: D.location.id,
    titre: D.location.titre,
    titreOfficiel: 'Proposition de loi visant à réguler les meublés de tourisme',
    titreEnClair: null,
    type: 'Proposition de loi ordinaire',
    nature: 'proposition',
    procedure: 'normale',
    origine: 'parlementaire',
    theme: null,
    legislature: '17',
    dateDepot: '2025-11-14',
    etat: 'en_cours',
    auteur: auteur(comme(P.ines, 'Députée · Groupe C')),
    cosignataires: 48,
    resumeEnClair: null,
  },
  parcours: PARCOURS_LOCATION,
  ceQuiAChange: [
    { article: ART.l2, resume: null },
    { article: ART.l4, resume: null },
    { article: ART.l6, resume: null },
  ],
  etapes: [
    etapeResume(CASES_LOCATION, 'depot', null, null, [ch('Articles', 9), ch('Cosignataires', 48)]),
    etapeResume(CASES_LOCATION, 'lecture_1_o', null, null, [ch('Amendements déposés', 402), ch('Amendements adoptés', 58), ch('Scrutins publics', 1)]),
    etapeResume(CASES_LOCATION, 'lecture_1_s', null, null, [ch('Amendements déposés', 186), ch('Amendements adoptés', 34), ch('Scrutins publics', 1)]),
    etapeResume(CASES_LOCATION, 'lecture_2_o', null, null, [ch('Amendements déposés', 74), ch('Amendements adoptés', 6)]),
    etapeResume(CASES_LOCATION, 'lecture_2_s', null, null, [ch('Amendements déposés', 41), ch('Amendements adoptés', 3)]),
    etapeResume(CASES_LOCATION, 'cmp', null, null, [ch('Membres', 14)]),
    etapeResume(CASES_LOCATION, 'nouvelle_lecture', null, null, [ch('Amendements déposés', 52), ch('Amendements adoptés', 4), ch('Scrutins publics', 1)]),
    etapeResume(CASES_LOCATION, 'lecture_definitive', null, null, []),
    etapeResume(CASES_LOCATION, 'cc', null, null, []),
    etapeResume(CASES_LOCATION, 'promulgation_jo', null, null, []),
  ],
  versionsDuTexte: 6,
  articles: [
    { article: ART.l2, intitule: 'Plafond annuel de location d’une résidence principale', modifications: 5, etat: 'modifie', ajoutePar: null },
    { article: ART.l4, intitule: 'Quotas fixés par les communes', modifications: 1, etat: 'ajoute', ajoutePar: 'SENAT' },
    { article: ART.l6, intitule: 'Sanctions', modifications: 1, etat: 'modifie', ajoutePar: null },
    { article: ART.l7, intitule: 'Enregistrement obligatoire des meublés', modifications: 0, etat: 'inchange', ajoutePar: null },
  ],
  amendements: {
    parEtape: [
      stat(BARRE_LOCATION, 'lecture_1_o', 402, 58),
      stat(BARRE_LOCATION, 'lecture_1_s', 186, 34),
      stat(BARRE_LOCATION, 'lecture_2_o', 74, 6),
      stat(BARRE_LOCATION, 'lecture_2_s', 41, 3),
      stat(BARRE_LOCATION, 'nouvelle_lecture', 52, 4),
    ],
    filtre: {},
    liste: page([AMENDEMENTS.ce40, AMENDEMENTS.com12, AMENDEMENTS.n33, AMENDEMENTS.s9, AMENDEMENTS.n51]),
  },
  scrutins: [S.an1102, S.sen140, S.sen297],
  acteurs: [
    {
      role: 'auteur',
      libelle: 'Auteure',
      total: 1,
      acteurs: [{ qui: orateur(P.ines), role: 'Députée · Groupe C · auteure et rapporteure', activite: ch('Interventions', 38) }],
    },
    {
      role: 'rapporteur',
      libelle: 'Sénat',
      total: 1,
      acteurs: [{ qui: orateur(P.paul), role: 'Sénateur · Groupe S2 · rapporteur au Sénat', activite: ch('Amendements', 12) }],
    },
    {
      role: 'gouvernement',
      libelle: 'Gouvernement',
      total: 1,
      acteurs: [{ qui: orateur(P.sarah), role: 'Ministre déléguée au Logement', activite: ch('Interventions', 21) }],
    },
    {
      role: 'auditionnes',
      libelle: 'Élus locaux auditionnés',
      total: 1,
      acteurs: [
        // Auditionnée : le compte rendu ne donne que le nom publié (aucune personne reliée).
        { qui: { type: 'nom_publie', nom: 'Mme Nadia Specimen', qualite: 'maire de [COMMUNE]' }, role: 'Auditionnée en commission', activite: ch('Audition', '22/01/2026') },
      ],
    },
  ],
  interets: INTERETS.dossierLocation,
  chiffres: [
    ch('Lectures', 6),
    ch('Amendements déposés', 755),
    ch('Amendements adoptés', 105),
    ch('Scrutins publics', 3),
    ch('CMP', 'Désaccord'),
    ch('Durée d’examen', '12 mois'),
  ],
  sources: [
    prov('AN', 'dossier', 'DLR5L17N-location', lienFictif('an/dossier/location')),
    prov('SENAT', 'dossier', 'ppl25-location', lienFictif('senat/dossier/location')),
  ],
};

// ---------- Étapes ----------

const doc = (id: string, type: TypeDocument, titre: string, numero: string | null, date: string | null, systeme: 'AN' | 'SENAT' = 'AN'): DocumentOfficiel => ({
  id,
  type,
  titre,
  numero,
  date,
  url: lienFictif(`${systeme.toLowerCase()}/document/${id}`),
  provenance: prov(systeme, 'document', id),
});

const barreIci = (dossier: DossierRef, cases: CaseCompacte[], ici: CleCase | null) => ({ dossier, cases, ici });

/** Cases affichées (hors sans_objet) : précédente et suivante. */
function voisines(cases: CaseCompacte[], cle: CleCase) {
  const visibles = cases.filter((c) => c.etat !== 'sans_objet');
  const i = visibles.findIndex((c) => c.cle === cle);
  const v = (c: CaseCompacte | undefined) => (c ? { cle: c.cle, libelle: c.libelle } : null);
  return { numero: i + 1, precedente: v(visibles[i - 1]), suivante: v(visibles[i + 1]) };
}

/** Déviations et dossiers rattachés à l'étape `cle` du parcours. */
const rattache = (parcours: Parcours, cle: CleCase) => ({
  deviations: parcours.deviations.filter((d) => d.etape === cle),
  enfants: parcours.enfants.filter((e) => e.etape === cle),
});

export const ETAPES: Record<string, FicheEtape> = {
  'dossier-energie/commission_1_o': {
    barre: barreIci(D.energie, BARRE_ENERGIE, 'commission_1_o'),
    case: CASES_ENERGIE[1],
    ...voisines(BARRE_ENERGIE, 'commission_1_o'),
    ...rattache(PARCOURS_ENERGIE, 'commission_1_o'),
    organe: AFFECO_AN,
    resume:
      'La commission réécrit le texte avant la séance. Elle relève l’objectif de renouvelables et étend les économies d’énergie aux collectivités.',
    chiffres: [ch('Amendements déposés', 612), ch('Adoptés', 96), ch('Réunions', 4)],
    changements: [
      {
        article: ART.e3,
        origine: {
          type: 'amendement',
          amendement: {
            statut: 'verifie',
            cible: AMENDEMENTS.ce123,
            rapprochement: { statut: 'verifie', methode: 'reference_explicite', motif: 'le texte de la commission cite l’amendement adopté', preuve: prov('AN', 'document', 'TA-com-energie') },
          },
        },
        resume: 'Objectif de renouvelables relevé de 40 % à 45 % en 2035',
      },
      {
        article: ART.e8,
        origine: {
          type: 'amendement',
          amendement: {
            statut: 'a_verifier',
            candidat: AMENDEMENTS.ce88,
            rapprochement: {
              statut: 'a_verifier',
              methode: 'attribution_en_revue',
              motif: 'attribution en revue : deux amendements adoptés modifient cet article',
              avertissement: 'L’amendement à l’origine de ce changement n’est pas encore établi.',
            },
          },
        },
        resume: 'Obligation étendue aux bâtiments des collectivités',
      },
    ],
    votes: [],
    quiIntervient: { intervenants: INTERVENANTS.energieCommission, total: 27 },
    documents: [
      doc('rapport-1342', 'rapport', 'Rapport n° 1342', '1342', '2026-02-04'),
      doc('texte-com-energie', 'texte_commission', 'Texte de la commission', '1342-A0', '2026-02-04'),
      doc('cr-com-energie', 'compte_rendu', 'Comptes rendus de la commission', null, '2026-02-03'),
    ],
  },
  'dossier-energie/seance_1_o': {
    barre: barreIci(D.energie, BARRE_ENERGIE, 'seance_1_o'),
    case: CASES_ENERGIE[2],
    ...voisines(BARRE_ENERGIE, 'seance_1_o'),
    ...rattache(PARCOURS_ENERGIE, 'seance_1_o'),
    organe: { id: 'assemblee-nationale', nom: 'Assemblée nationale' },
    resume:
      'Les 577 députés examinent le texte de la commission. Le calendrier des réacteurs est assoupli ; le texte est adopté par scrutin public.',
    chiffres: [ch('Amendements déposés', 1980), ch('Adoptés', 214), ch('Scrutins publics', 2)],
    changements: [
      {
        article: ART.e3,
        origine: {
          type: 'amendement',
          amendement: {
            statut: 'verifie',
            cible: AMENDEMENTS.n655,
            rapprochement: { statut: 'verifie', methode: 'reference_explicite', motif: 'le texte adopté cite l’amendement', preuve: prov('AN', 'document', 'TA0287') },
          },
        },
        resume: 'Ajout d’un objectif propre à la chaleur : 33 % renouvelable',
      },
      { article: ART.e5, origine: { type: 'non_etablie' }, resume: '« Six réacteurs » devient « jusqu’à six réacteurs »' },
    ],
    votes: [S.an1874, S.an1880],
    quiIntervient: { intervenants: INTERVENANTS.energieSeance, total: 96 },
    documents: [
      doc('ta-287', 'texte_adopte', 'Texte adopté n° 287', '287', '2026-03-18'),
      doc('cr-seance-energie', 'compte_rendu', 'Comptes rendus des séances', null, '2026-03-18'),
    ],
  },
  'dossier-energie/cc': {
    barre: barreIci(D.energie, BARRE_ENERGIE, 'cc'),
    case: CASES_ENERGIE[11],
    ...voisines(BARRE_ENERGIE, 'cc'),
    ...rattache(PARCOURS_ENERGIE, 'cc'),
    organe: { id: 'conseil-constitutionnel', nom: 'Conseil constitutionnel' },
    resume:
      'Soixante députés demandent au Conseil constitutionnel de vérifier que la loi respecte la Constitution. La loi ne peut pas être promulguée avant sa décision.',
    chiffres: [ch('Saisissants', '60 députés'), ch('Articles contestés', 3)],
    changements: [],
    votes: [],
    quiIntervient: { intervenants: [], total: 0 },
    documents: [doc('saisine-cc-energie', 'saisine', 'Lettre de saisine', null, '2026-10-17')],
  },
  'dossier-location/lecture_1_o': {
    barre: barreIci(D.location, BARRE_LOCATION, 'lecture_1_o'),
    case: CASES_LOCATION[1],
    ...voisines(BARRE_LOCATION, 'lecture_1_o'),
    ...rattache(PARCOURS_LOCATION, 'lecture_1_o'),
    organe: { id: 'assemblee-nationale', nom: 'Assemblée nationale' },
    resume: null,
    chiffres: [ch('Amendements déposés', 402), ch('Adoptés', 58), ch('Scrutins publics', 1)],
    changements: [
      {
        article: ART.l2,
        origine: {
          type: 'amendement',
          amendement: {
            statut: 'verifie',
            cible: AMENDEMENTS.ce40,
            rapprochement: { statut: 'verifie', methode: 'reference_explicite', motif: 'le texte de la commission cite l’amendement adopté', preuve: null },
          },
        },
        resume: null,
      },
    ],
    votes: [S.an1102],
    quiIntervient: {
      intervenants: [
        { orateur: { type: 'nom_publie', nom: 'Mme Inès Modèle', qualite: 'rapporteure' }, groupe: null, interventions: 38, extrait: null },
        { orateur: { type: 'nom_publie', nom: 'Mme Nadia Specimen', qualite: 'maire de [COMMUNE]' }, groupe: null, interventions: 3, extrait: null },
      ],
      total: 2,
    },
    documents: [doc('rapport-601', 'rapport', 'Rapport n° 601', '601', '2026-01-28'), doc('ta-198', 'texte_adopte', 'Texte adopté n° 198', '198', '2026-02-05')],
  },
  'dossier-location/cmp': {
    barre: barreIci(D.location, BARRE_LOCATION, 'cmp'),
    case: CASES_LOCATION[5],
    ...voisines(BARRE_LOCATION, 'cmp'),
    ...rattache(PARCOURS_LOCATION, 'cmp'),
    organe: { id: 'cmp-location', nom: 'Commission mixte paritaire' },
    resume: null,
    chiffres: [ch('Membres', 14), ch('Résultat', 'Désaccord')],
    changements: [],
    votes: [],
    quiIntervient: {
      intervenants: [
        { orateur: orateur(P.ines, 'rapporteure'), groupe: G.C, interventions: 4, extrait: null },
        { orateur: orateur(P.paul, 'rapporteur'), groupe: G.S2, interventions: 3, extrait: null },
      ],
      total: 2,
    },
    documents: [doc('rapport-cmp-location', 'rapport', 'Rapport de la CMP (désaccord)', '1650', '2026-09-16')],
  },
  'dossier-location/lecture_definitive': {
    barre: barreIci(D.location, BARRE_LOCATION, 'lecture_definitive'),
    case: CASES_LOCATION[8],
    ...voisines(BARRE_LOCATION, 'lecture_definitive'),
    ...rattache(PARCOURS_LOCATION, 'lecture_definitive'),
    organe: { id: 'assemblee-nationale', nom: 'Assemblée nationale' },
    resume: null,
    chiffres: [],
    changements: [],
    votes: [],
    quiIntervient: { intervenants: [], total: 0 },
    documents: [],
  },
};

// ---------- Articles ----------

const version = (
  id: string,
  rang: number,
  libelle: string,
  cases: CaseCompacte[],
  cle: CleCase | null,
  lieu: VersionArticle['lieu'],
  date: string,
  numero: string,
): VersionArticle => ({ id, rang, libelle, etape: cle ? ou(cases, cle) : null, lieu, date, numero, statut: 'present', mention: null });

const diff = (...morceaux: [SegmentDiff['type'], string][]): SegmentDiff[] => morceaux.map(([type, texte]) => ({ type, texte }));

export const ARTICLE_ENERGIE_3: FicheArticle = {
  barre: barreIci(D.energie, BARRE_ENERGIE, 'commission_1_o'),
  article: ART.e3,
  intitule: 'Part des énergies renouvelables',
  modifications: 4,
  versions: [
    version('va-e3-0', 0, 'Texte déposé', BARRE_ENERGIE, 'depot', 'AN', '2026-01-12', '3'),
    version('va-e3-1', 1, 'Commission AN', BARRE_ENERGIE, 'commission_1_o', 'AN', '2026-02-04', '3'),
    version('va-e3-2', 2, 'Séance AN', BARRE_ENERGIE, 'seance_1_o', 'AN', '2026-03-18', '3'),
    version('va-e3-3', 3, 'Commission Sénat', BARRE_ENERGIE, 'commission_1_s', 'SENAT', '2026-05-06', '3'),
    version('va-e3-4', 4, 'Texte de la CMP', BARRE_ENERGIE, 'cmp', 'CMP', '2026-06-24', '3'),
  ],
  affichee: {
    version: 'va-e3-1',
    comparaison: 'precedente',
    compareeA: 'va-e3-0',
    texte: 'La part des énergies renouvelables atteint au moins 45 % de la consommation finale brute d’énergie en 2035.',
    diff: diff(
      ['egal', 'La part des énergies renouvelables atteint au moins '],
      ['supprime', '40 %'],
      ['ajoute', '45 %'],
      ['egal', ' de la consommation finale brute d’énergie en 2035.'],
    ),
    origine: {
      type: 'amendement',
      amendement: {
        statut: 'verifie',
        cible: AMENDEMENTS.ce123,
        rapprochement: { statut: 'verifie', methode: 'reference_explicite', motif: 'le texte de la commission cite l’amendement adopté', preuve: prov('AN', 'document', 'TA-com-energie') },
      },
    },
    pourquoi: {
      expose:
        'Le présent amendement vise à porter l’objectif de 40 à 45 % afin de garantir la cohérence de la programmation avec les engagements européens de la France […]',
      synthese:
        'Aligner l’objectif français sur la trajectoire européenne pour 2035. Avis favorable de la rapporteure, sagesse du Gouvernement.',
    },
  },
};

export const ARTICLE_LOCATION_2: FicheArticle = {
  barre: barreIci(D.location, BARRE_LOCATION, 'nouvelle_lecture'),
  article: ART.l2,
  intitule: 'Plafond de location d’une résidence principale',
  modifications: 5,
  versions: [
    version('va-l2-0', 0, 'Texte déposé', BARRE_LOCATION, 'depot', 'AN', '2025-11-14', '2'),
    version('va-l2-1', 1, '1re lecture AN', BARRE_LOCATION, 'lecture_1_o', 'AN', '2026-02-05', '2'),
    version('va-l2-2', 2, '1re lecture Sénat', BARRE_LOCATION, 'lecture_1_s', 'SENAT', '2026-04-09', '2'),
    version('va-l2-3', 3, '2e lecture AN', BARRE_LOCATION, 'lecture_2_o', 'AN', '2026-06-11', '2'),
    version('va-l2-4', 4, '2e lecture Sénat', BARRE_LOCATION, 'lecture_2_s', 'SENAT', '2026-07-02', '2'),
    version('va-l2-5', 5, 'Nouvelle lecture AN', BARRE_LOCATION, 'nouvelle_lecture', 'AN', '2026-10-08', '2'),
  ],
  affichee: {
    version: 'va-l2-5',
    comparaison: 'precedente',
    compareeA: 'va-l2-4',
    texte:
      'Une résidence principale ne peut être louée aux touristes plus de 90 nuits par an dans les zones tendues. Amende maximale : 15 000 €.',
    diff: diff(
      ['egal', 'Une résidence principale ne peut être louée aux touristes plus de '],
      ['supprime', '120'],
      ['ajoute', '90'],
      ['egal', ' nuits par an dans les zones tendues. Amende maximale : 15 000 €.'],
    ),
    origine: { type: 'non_etablie' },
    pourquoi: { expose: null, synthese: null },
  },
};

// ---------- Amendement ----------

export const AMENDEMENT_CE123: FicheAmendement = {
  barre: barreIci(D.energie, BARRE_ENERGIE, 'commission_1_o'),
  amendement: AMENDEMENTS.ce123,
  dateDepot: '2026-01-30',
  dateSort: '2026-02-04',
  dispositif: {
    texte: '<p>À l’alinéa 2, substituer au taux : « 40 % » le taux : « 45 % ».</p>',
    diff: ARTICLE_ENERGIE_3.affichee.diff,
  },
  expose:
    'Le présent amendement vise à porter l’objectif de 40 à 45 % afin de garantir la cohérence de la programmation avec les engagements européens de la France […]',
  exposeEnClair:
    'Aligner l’objectif français sur la trajectoire européenne pour 2035, en s’appuyant sur les capacités d’éolien en mer déjà attribuées.',
  cosignataires: {
    total: 12,
    personnes: [comme(P.lea, 'Cosignataire · Groupe F'), comme(P.karim, 'Cosignataire · Groupe C')],
    groupes: [G.C, G.F],
  },
  // AN : avis non publiés en données structurées. Le canevas montre « Favorable » et « Sagesse » :
  // ils ne figurent ici que dans la synthèse de l'article, jamais comme des faits.
  avis: { publies: false, liste: [] },
  vote: { type: 'main_levee' },
  discussions: { extraits: INTERVENTIONS_CE123.map((i) => extrait(i)), total: 3 },
  interets: INTERETS.amendementCE123,
  provenance: prov('AN', 'amendement', 'AMANR5L17PO59051BTC0123', lienFictif('an/amendement/CE123')),
};

/** Sénat : avis publiés (AMELI), pas de synthèse. */
export const AMENDEMENT_COM56: FicheAmendement = {
  barre: barreIci(D.energie, BARRE_ENERGIE, 'commission_1_s'),
  amendement: AMENDEMENTS.com56,
  dateDepot: '2026-04-24',
  dateSort: '2026-05-06',
  dispositif: { texte: '<p>Alinéa 2 : remplacer le taux : « 45 % » par le taux : « 42 % ».</p>', diff: null },
  expose: 'Un objectif jugé hors d’atteinte au regard des capacités de raccordement actuelles.',
  exposeEnClair: null,
  cosignataires: { total: 0, personnes: [], groupes: [] },
  avis: {
    publies: true,
    liste: [
      { emetteur: 'commission', avis: 'favorable', libelle: 'Favorable', provenance: prov('SENAT', 'amendement', 'ameli-com56') },
      { emetteur: 'gouvernement', avis: 'defavorable', libelle: 'Défavorable', provenance: prov('SENAT', 'amendement', 'ameli-com56') },
    ],
  },
  vote: { type: 'main_levee' },
  discussions: { extraits: [], total: 0 },
  interets: [],
  provenance: prov('SENAT', 'amendement', 'ameli-com56', lienFictif('senat/amendement/COM-56')),
};
