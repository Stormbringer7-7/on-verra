// Fixtures : annuaire, classement et fiches des personnes fictives du canevas (Camille Exemple,
// députée rapporteure ; Claire Exemple, ministre ; Nadia Specimen, maire et ancienne députée ;
// une fiche RNE seule, que la revue n'a reliée à personne).

import type { Annuaire, Classement, ElementAnnuaire, FichePersonne, Indicateur, LigneClassement } from '../../core/domain/model';
import { D, G, P, prov } from './entites';
import { DECLARATIONS_CAMILLE, FONCTIONS } from './fonctions';
import { S } from './scrutins';

const element = (
  p: typeof P.camille,
  role: ElementAnnuaire['role'],
  fonction: string,
  source: ElementAnnuaire['source'],
): ElementAnnuaire => ({ id: p.id, identite: 'personne', nom: p.nom, role, fonction, groupe: p.groupe, source });

const ANNUAIRE_TOUS: ElementAnnuaire[] = [
  element(P.camille, 'depute', 'Députée · Essonne, 4e · Groupe A', 'AN'),
  element(P.claire, 'gouvernement', 'Ministre de la Transition énergétique depuis 2025', 'AN'),
  element(P.pierre, 'senateur', 'Sénateur · Loire-Atlantique · Groupe S1', 'SENAT'),
  element(P.ines, 'depute', 'Députée · Nord, 7e · Groupe C', 'AN'),
  element(P.paul, 'senateur', 'Sénateur · Gironde · Groupe S2', 'SENAT'),
  element(P.hugo, 'depute', 'Député · Gironde, 2e · Groupe B', 'AN'),
  element(P.louis, 'depute', 'Député · Rhône, 1re · Groupe A', 'AN'),
  element(P.sarah, 'gouvernement', 'Ministre déléguée au Logement depuis 2026 · ancienne sénatrice', 'AN'),
  // Les élus locaux après les fonctions nationales, comme l'annuaire de l'API.
  element(P.nadia, 'elu_local', 'Maire de [COMMUNE] · ancienne députée (2017-2022)', 'RNE'),
];

/** Élu local tel que publié par le RNE, relié à aucune personne (pas de décision de revue). */
const FICHE_RNE_SEULE: ElementAnnuaire = {
  id: 'rne-maire-099',
  identite: 'fiche_rne',
  nom: 'Thomas Esquisse',
  role: 'elu_local',
  fonction: 'Maire de [AUTRE COMMUNE]',
  groupe: null,
  source: 'RNE',
};

const EFFECTIFS: Annuaire['effectifs'] = [
  { role: 'depute', nombre: 577 },
  { role: 'senateur', nombre: 348 },
  { role: 'gouvernement', nombre: 36 },
  { role: 'elu_local', nombre: 2 },
];

export const ANNUAIRE: Annuaire = {
  filtre: {},
  effectifs: EFFECTIFS,
  personnes: { elements: ANNUAIRE_TOUS, page: 1, taille: 20, total: 961, suivante: null },
};

const ELUS = [ANNUAIRE_TOUS[6], FICHE_RNE_SEULE];
export const ANNUAIRE_ELUS_LOCAUX: Annuaire = {
  filtre: { role: 'elu_local' },
  effectifs: EFFECTIFS,
  personnes: { elements: ELUS, page: 1, taille: 20, total: ELUS.length, suivante: null },
};

// ---------- Classement ----------

const PERIODE = { debut: '2025-10-25', fin: '2026-10-24' };

const ecarts = (valeur: number, votes: number): Indicateur => ({
  libelle: 'Écarts au groupe',
  valeur,
  unite: 'nombre',
  denominateur: { valeur: votes, libelle: 'votes en groupe' },
  reference: { libelle: 'Moyenne des députés : écarts pour 100 votes en groupe', valeur: 3.2 },
  ceQueLaDonneeNeDitPas: [
    'Seuls les scrutins publics comptent : les votes à main levée ne sont pas nominatifs.',
    'Un groupe sans majorité nette sur un scrutin n’a pas de ligne : aucun écart n’y est compté.',
  ],
  periode: PERIODE,
  calcul: 'lecture.indicateur_ecarts',
});

const rangee = (rang: number, p: typeof P.camille, e: number, votes: number): LigneClassement => ({
  rang,
  personne: { id: p.id, nom: p.nom, groupe: p.groupe },
  indicateur: ecarts(e, votes),
});

export const CLASSEMENT_AN_ECARTS: Classement = {
  demande: { chambre: 'AN', critere: 'ecarts', ordre: 'desc', themes: ['energie', 'logement'] },
  themesAppliques: [],
  themesDisponibles: [],
  periode: PERIODE,
  explication:
    'Un écart est un vote différent de la majorité de son groupe. Ce n’est ni bien ni mal : c’est là que se lisent les choix personnels.',
  lignes: [
    rangee(1, P.karim, 14, 188),
    rangee(2, P.louis, 11, 201),
    rangee(3, P.lea, 9, 176),
    rangee(4, P.camille, 5, 214),
    rangee(5, P.hugo, 3, 190),
  ],
};

// ---------- Fiches ----------

const ENTETE_CAMILLE: FichePersonne['entete'] = {
  id: P.camille.id,
  identite: 'personne',
  nom: P.camille.nom,
  civilite: 'Mme',
  enCours: [
    { libelle: 'Députée · Essonne, 4e circ.', groupe: null },
    { libelle: 'Groupe A', groupe: G.A },
    { libelle: 'Commission des affaires économiques', groupe: null },
  ],
  provenance: [prov('AN', 'acteur', 'PA-fictif-camille'), prov('HATVP', 'declarant', 'camille-exemple')],
};

export const PERSONNES: Record<string, FichePersonne> = {
  'camille-exemple/parcours': {
    entete: ENTETE_CAMILLE,
    contenu: { onglet: 'parcours', fonctions: FONCTIONS.camille, mandatsLocauxEnCours: [] },
  },
  'camille-exemple/choix': {
    entete: ENTETE_CAMILLE,
    contenu: {
      onglet: 'choix',
      indicateurs: [
        {
          libelle: 'Participation aux scrutins publics',
          valeur: 78.5,
          unite: 'pourcentage',
          denominateur: { valeur: 214, libelle: 'scrutins pendant son mandat, 12 derniers mois' },
          reference: { libelle: 'Attendu : participation du Groupe A sur les mêmes scrutins', valeur: 71.2 },
          ceQueLaDonneeNeDitPas: ['Les déports et la présence en commission au même moment ne sont pas publiés.'],
          periode: PERIODE,
          calcul: 'lecture.indicateur_participation',
        },
        { ...ecarts(5, 214), reference: { libelle: 'Moyenne des membres du Groupe A : écarts pour 100 votes en groupe', valeur: 2.1 } },
      ],
      note: null,
      themes: [],
      derniersEcarts: [S.an1874],
    },
  },
  'camille-exemple/dossiers': {
    entete: ENTETE_CAMILLE,
    contenu: {
      onglet: 'dossiers',
      roles: [
        { type: 'rapporteur', nombre: 1, libelle: 'Rapporteure', detail: 'Projet de loi de programmation énergétique 2026-2035', dossier: D.energie },
        { type: 'auteur', nombre: 2, libelle: 'Propositions de loi déposées', detail: 'Dont « Rénovation des écoles » (en commission)', dossier: null },
        { type: 'amendements', nombre: 214, libelle: 'Amendements déposés', detail: '41 sur le projet de loi énergie · 58 adoptés au total', dossier: D.energie },
        { type: 'interventions', nombre: 312, libelle: 'Interventions en séance et en commission', detail: 'Dont 54 sur le projet de loi énergie', dossier: D.energie },
        { type: 'questions', nombre: 12, libelle: 'Questions au Gouvernement', detail: null, dossier: null },
      ],
      questions: {
        elements: [
          {
            id: 'question-qg-1201',
            type: 'QG',
            numero: '1201',
            date: '2026-05-12',
            titre: 'Raccordement des parcs éoliens en mer',
            rubrique: 'énergie et carburants',
            ministere: 'Ministère de la Transition énergétique',
            dateReponse: '2026-05-12',
            provenance: prov('AN', 'question', 'QANR5L17QG1201'),
          },
        ],
        page: 1,
        taille: 20,
        total: 12,
        suivante: null,
      },
    },
  },
  'camille-exemple/declarations': {
    entete: ENTETE_CAMILLE,
    contenu: { onglet: 'declarations', declarations: DECLARATIONS_CAMILLE },
  },
  'claire-exemple/parcours': {
    entete: {
      id: P.claire.id,
      identite: 'personne',
      nom: P.claire.nom,
      civilite: 'Mme',
      enCours: [{ libelle: 'Ministre de la Transition énergétique', groupe: null }, { libelle: 'Gouvernement [NOM] II', groupe: null }],
      provenance: [prov('AN', 'acteur', 'PA-fictif-claire')],
    },
    contenu: { onglet: 'parcours', fonctions: FONCTIONS.claire, mandatsLocauxEnCours: [] },
  },
  'claire-exemple/choix': {
    entete: {
      id: P.claire.id,
      identite: 'personne',
      nom: P.claire.nom,
      civilite: 'Mme',
      enCours: [{ libelle: 'Ministre de la Transition énergétique', groupe: null }],
      provenance: [prov('AN', 'acteur', 'PA-fictif-claire')],
    },
    contenu: {
      onglet: 'choix',
      indicateurs: [],
      note: 'Comme ministre, elle ne vote pas au Parlement. Elle porte des projets de loi et donne l’avis du Gouvernement sur les amendements.',
      themes: [],
      derniersEcarts: [],
    },
  },
  'nadia-specimen/parcours': {
    entete: {
      id: P.nadia.id,
      identite: 'personne',
      nom: P.nadia.nom,
      civilite: 'Mme',
      enCours: [
        { libelle: 'Maire de [COMMUNE]', groupe: null },
        { libelle: 'Vice-présidente de [INTERCOMMUNALITÉ]', groupe: null },
      ],
      provenance: [prov('AN', 'acteur', 'PA-fictif-nadia'), prov('RNE', 'mandat', 'rne-maire-020')],
    },
    contenu: {
      onglet: 'parcours',
      fonctions: FONCTIONS.nadia,
      mandatsLocauxEnCours: FONCTIONS.nadia.filter((f) => f.type === 'mandat_local' && f.fin === null),
    },
  },
  'rne-maire-099/parcours': {
    entete: {
      id: 'rne-maire-099',
      identite: 'fiche_rne',
      nom: 'Thomas Esquisse',
      civilite: null,
      enCours: [{ libelle: 'Maire de [AUTRE COMMUNE]', groupe: null }],
      provenance: [prov('RNE', 'mandat', 'rne-maire-099')],
    },
    contenu: {
      onglet: 'parcours',
      fonctions: [
        {
          titre: 'Maire de [AUTRE COMMUNE]',
          type: 'mandat_local',
          organisation: { id: 'commune-fictive', nom: '[AUTRE COMMUNE]' },
          groupe: null,
          debut: '2020-07-03',
          fin: null,
          source: 'RNE',
          provenance: prov('RNE', 'mandat', 'rne-maire-099'),
        },
      ],
      mandatsLocauxEnCours: [],
    },
  },
};
