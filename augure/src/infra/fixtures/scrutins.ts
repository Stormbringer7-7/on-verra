// Fixtures : scrutins publics des deux dossiers fictifs (AN et Sénat), fiche du scrutin n° 1874
// (six réacteurs d'ici 2040) et « Pourquoi Camille Exemple a voté contre ».

import type {
  Decompte,
  ExplicationVote,
  FicheScrutin,
  GroupeRef,
  NatureScrutin,
  PositionDeGroupe,
  PositionExprimee,
  ScrutinResume,
} from '../../core/domain/model';
import { A, ART, BARRE_ENERGIE, BARRE_LOCATION, D, G, P, comme, lienFictif, orateur, prov } from './entites';
import { DECLARATIONS_CAMILLE, FONCTIONS, resumes } from './fonctions';
import { INTERETS } from './interets';
import { SIEGEANTS_AN, votesNominatifs } from './sieges';

const scrutin = (
  id: string,
  chambre: 'AN' | 'SENAT',
  numero: string,
  date: string,
  nature: NatureScrutin,
  intitule: string,
  enClair: string | null,
  [pour, contre, abstention]: [number, number, number],
  adopte: boolean,
  dossier: ScrutinResume['dossier'],
  etape: ScrutinResume['etape'],
): ScrutinResume => ({
  id,
  chambre,
  numero,
  date,
  nature,
  intitule,
  enClair,
  sort: adopte ? 'adopté' : 'rejeté',
  adopte,
  decompte: { pour, contre, abstention },
  dossier,
  etape,
});

export const S = {
  // Programmation énergétique (procédure accélérée)
  an1874: scrutin(
    'scrutin-an-1874', 'AN', '1874', '2026-03-12', 'amendement',
    'l’amendement n° 1876 de M. Hugo Fictif à l’article 5 du projet de loi de programmation énergétique',
    'Lancer six réacteurs supplémentaires d’ici 2040', [247, 268, 22], false, D.energie,
    { cle: 'seance_1_o', libelle: 'Séance AN' },
  ),
  an1880: scrutin(
    'scrutin-an-1880', 'AN', '1880', '2026-03-18', 'ensemble',
    'l’ensemble du projet de loi de programmation énergétique 2026-2035 (première lecture)',
    'Adopter le projet de loi en 1re lecture', [312, 220, 31], true, D.energie,
    { cle: 'seance_1_o', libelle: 'Séance AN' },
  ),
  sen212: scrutin(
    'scrutin-senat-212', 'SENAT', '212', '2026-05-28', 'ensemble',
    'l’ensemble du projet de loi de programmation énergétique 2026-2035',
    'Adopter le projet de loi modifié', [241, 98, 9], true, D.energie,
    { cle: 'seance_1_s', libelle: 'Séance Sénat' },
  ),
  sen298: scrutin(
    'scrutin-senat-298', 'SENAT', '298', '2026-10-14', 'ensemble',
    'l’ensemble du texte élaboré par la commission mixte paritaire sur le projet de loi de programmation énergétique',
    'Adopter le texte de compromis', [230, 105, 8], true, D.energie,
    { cle: 'conclusions_cmp', libelle: 'Vote du texte de la CMP' },
  ),
  an2410: scrutin(
    'scrutin-an-2410', 'AN', '2410', '2026-10-15', 'ensemble',
    'l’ensemble du projet de loi de programmation énergétique 2026-2035 (texte de la commission mixte paritaire)',
    'Adopter définitivement la loi de programmation énergétique', [330, 190, 40], true, D.energie,
    { cle: 'conclusions_cmp', libelle: 'Vote du texte de la CMP' },
  ),
  // Location saisonnière (navette normale)
  an1102: scrutin(
    'scrutin-an-1102', 'AN', '1102', '2026-02-05', 'ensemble',
    'l’ensemble de la proposition de loi visant à réguler les meublés de tourisme (première lecture)',
    null, [351, 162, 30], true, D.location,
    { cle: 'lecture_1_o', libelle: '1re lecture AN' },
  ),
  sen140: scrutin(
    'scrutin-senat-140', 'SENAT', '140', '2026-04-09', 'ensemble',
    'l’ensemble de la proposition de loi visant à réguler les meublés de tourisme',
    null, [201, 112, 20], true, D.location,
    { cle: 'lecture_1_s', libelle: '1re lecture Sénat' },
  ),
  sen297: scrutin(
    'scrutin-senat-297', 'SENAT', '297', '2026-10-14', 'motion',
    'la motion tendant à opposer la question préalable à la proposition de loi visant à réguler les meublés de tourisme (nouvelle lecture)',
    null, [198, 121, 9], true, D.location,
    { cle: 'nouvelle_lecture', libelle: 'Nouvelle lecture' },
  ),
  // Autres votes de la semaine (Accueil)
  an2398: scrutin(
    'scrutin-an-2398', 'AN', '2398', '2026-10-16', 'motion',
    'la motion de rejet préalable du projet de loi de financement de la sécurité sociale pour 2027',
    'Rejeter d’emblée le budget de la Sécurité sociale 2027', [201, 322, 0], false, null, null,
  ),
  an2433: scrutin(
    'scrutin-an-2433', 'AN', '2433', '2026-10-22', 'article',
    'l’article 12 du projet de loi de finances pour 2027',
    'Adopter l’article 12 du budget 2027', [312, 241, 4], true, D.budget,
    { cle: 'lecture_1_o', libelle: '1re lecture AN' },
  ),
};

// ---------- Fiche du scrutin n° 1874 ----------

/** [groupe, pour, contre, abstention, absents] — de la gauche vers la droite. */
const VOTES_1874: [GroupeRef, number, number, number, number][] = [
  [G.A, 120, 16, 4, 12],
  [G.B, 98, 9, 4, 7],
  [G.C, 2, 88, 2, 6],
  [G.D, 5, 62, 2, 2],
  [G.E, 2, 52, 1, 4],
  [G.F, 8, 32, 8, 2],
  [G.NI, 12, 9, 1, 7],
];

const ligne = (d: Decompte): PositionExprimee | null => {
  const tri = (['pour', 'contre', 'abstention'] as const).map((p) => [p, d[p]] as const).sort((a, b) => b[1] - a[1]);
  return tri[0][1] === 0 || tri[0][1] === tri[1][1] ? null : tri[0][0];
};

const positions = (lignes: [GroupeRef, number, number, number, number][]): PositionDeGroupe[] =>
  lignes.map(([groupe, pour, contre, abstention, absents], rang) => {
    const decompte = { pour, contre, abstention };
    return { groupe, rang, ligne: ligne(decompte), decompte, nonVotants: 0, absents, membres: pour + contre + abstention + absents };
  });

export const FICHE_SCRUTIN_1874: FicheScrutin = {
  barre: { dossier: D.energie, cases: BARRE_ENERGIE, ici: 'seance_1_o' },
  scrutin: S.an1874,
  objet: { type: 'amendement', amendement: A.n1876, article: ART.e5 },
  sens: { pour: 'Avancer à 2040 la mise en service de six nouveaux réacteurs', contre: 'Garder l’échéance de 2045' },
  nonVotants: 0,
  absents: 40,
  groupes: positions(VOTES_1874),
  votesDifferents: {
    total: 73,
    personnes: [
      { personne: P.camille, position: 'contre', ligneDuGroupe: 'pour' },
      { personne: P.louis, position: 'abstention', ligneDuGroupe: 'pour' },
      { personne: P.paulM, position: 'contre', ligneDuGroupe: 'pour' },
      { personne: P.karim, position: 'pour', ligneDuGroupe: 'contre' },
      { personne: P.lea, position: 'pour', ligneDuGroupe: 'contre' },
    ],
  },
  votes: votesNominatifs(
    positions(VOTES_1874).map((g) => ({ groupe: g.groupe, ...g.decompte, nonVotants: g.nonVotants, absents: g.absents })),
    { [P.camille.id]: 'contre', [P.louis.id]: 'abstention', [P.paulM.id]: 'contre', [P.karim.id]: 'pour', [P.lea.id]: 'pour', [P.hugo.id]: 'pour', [P.ines.id]: 'contre' },
    new Map(SIEGEANTS_AN.map((m) => [m.personne.id, m.siege])),
  ),
  compteRendu: {
    url: lienFictif('an/compte-rendu/2026-03-12-2e-seance'),
    ancre: 'p-1874',
    provenance: prov('AN', 'compte_rendu', 'CRSANR5L17S2026O1N180'),
  },
  provenance: prov('AN', 'scrutin', 'VTANR5L17V1874', lienFictif('an/scrutin/1874')),
};

const GROUPES_297 = positions([
  [G.S1, 130, 6, 2, 7],
  [G.S2, 8, 80, 1, 3],
  [G.S3, 52, 4, 3, 5],
  [G.S4, 2, 28, 1, 2],
  [G.NIS, 6, 3, 2, 1],
]).map((g, i) => (i === 0 ? { ...g, nonVotants: 2, membres: g.membres + 2 } : g));

/** Sénat, nouvelle lecture : question préalable adoptée (rejet du texte). Pas de synthèse. */
export const FICHE_SCRUTIN_SENAT_297: FicheScrutin = {
  barre: { dossier: D.location, cases: BARRE_LOCATION, ici: 'nouvelle_lecture' },
  scrutin: S.sen297,
  objet: { type: 'motion' },
  sens: { pour: null, contre: null },
  nonVotants: 2,
  absents: 18,
  groupes: GROUPES_297,
  votesDifferents: { total: 25, personnes: [{ personne: P.pierre, position: 'contre', ligneDuGroupe: 'pour' }] },
  votes: votesNominatifs(
    GROUPES_297.map((g) => ({ groupe: g.groupe, ...g.decompte, nonVotants: g.nonVotants, absents: g.absents })),
    { [P.pierre.id]: 'contre', [P.paul.id]: 'contre' },
    new Map(),
  ),
  compteRendu: null,
  provenance: prov('SENAT', 'scrutin', '2025-297', lienFictif('senat/scrutin/2025-297')),
};

// ---------- Pourquoi ce vote ----------

export const EXPLICATION_CAMILLE_1874: ExplicationVote = {
  barre: { dossier: D.energie, cases: BARRE_ENERGIE, ici: 'seance_1_o' },
  scrutin: S.an1874,
  personne: comme(P.camille, 'Députée de l’Essonne · Groupe A · rapporteure du texte'),
  vote: { position: 'contre', parDelegation: false, miseAuPoint: null },
  groupe: { groupe: G.A, ligne: 'pour', partLigne: 86, memePosition: 16, exprimes: 140 },
  interventionsAvant: [
    {
      id: 'int-an-1874-camille',
      orateur: orateur(P.camille, 'rapporteure'),
      groupe: G.A,
      date: '2026-03-12',
      extrait:
        '« Avancer ce calendrier sans plan de financement ni de formation des équipes, c’est fragiliser le programme lui-même. Je voterai contre cet amendement, pas contre le nucléaire. »',
      tronque: false,
      compteRendu: {
        url: lienFictif('an/compte-rendu/2026-03-12-2e-seance'),
        ancre: 'p-3827764',
        provenance: prov('AN', 'intervention', 'CRSANR5L17S2026O1N180#3827764'),
      },
    },
  ],
  actes: [
    {
      type: 'rapporteur',
      libelle: 'Rapporteure du texte à l’Assemblée nationale',
      vers: { type: 'etape', dossier: D.energie.id, cle: 'commission_1_o' },
      provenance: prov('AN', 'acte', 'AN1-COM-FOND-NOMIN-fictif'),
    },
    {
      type: 'amendements',
      libelle: 'A déposé 41 amendements, dont le CE88 (bâtiments des collectivités)',
      vers: { type: 'amendement', id: A.ce88.id },
      provenance: prov('AN', 'amendement', 'AMANR5L17PO59051BTC0088'),
    },
    {
      type: 'vote',
      libelle: 'A voté pour l’ensemble du texte le 18/03/2026',
      vers: { type: 'scrutin', id: S.an1880.id },
      provenance: prov('AN', 'scrutin', 'VTANR5L17V1880'),
    },
  ],
  surLeTheme: {
    theme: 'Énergie',
    decompte: { pour: 4, contre: 1, abstention: 0, absences: 0 },
    ecarts: {
      libelle: 'Écarts au groupe sur le thème',
      valeur: 1,
      unite: 'nombre',
      denominateur: { valeur: 5, libelle: 'votes en groupe sur l’énergie en 12 mois' },
      reference: { libelle: 'Moyenne des membres du Groupe A sur les mêmes scrutins', valeur: null },
      ceQueLaDonneeNeDitPas: ['Les votes à main levée ne sont pas nominatifs : ils ne sont pas comptés.'],
      periode: { debut: '2025-11-01', fin: '2026-10-24' },
      calcul: 'lecture.vote_et_groupe',
    },
    synthese: 'Plutôt pour (4 votes sur 5). Ce vote est son seul écart avec le Groupe A sur ce thème.',
  },
  parcours: FONCTIONS.camille,
  declarations: {
    declarations: resumes(DECLARATIONS_CAMILLE),
    auTheme:
      'Déclarations d’intérêts de 2022 et 2024 : aucune activité, participation ni fonction déclarée dans le secteur de l’énergie.',
  },
  lobbying: INTERETS.voteCamille1874,
};
