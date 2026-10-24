// Fixtures : représentants d'intérêts fictifs, actions déclarées et rapprochements avec le parcours
// législatif, chacun avec son statut (« Vérifié · l'action cite le texte », « À vérifier · même
// sujet, même période »).

import type { ActionRepresentation, CibleInteret, FicheRepresentant, Lien, LienInteret, RepresentantResume } from '../../core/domain/model';
import { A, ART, D, lienFictif, prov } from './entites';

export const R = {
  enr: { id: 'ri-enr', denomination: 'Association fictive des énergies renouvelables', categorie: 'Organisation syndicale et professionnelle' },
  nucleaire: { id: 'ri-nucleaire', denomination: 'Fédération fictive du nucléaire civil', categorie: 'Organisation syndicale et professionnelle' },
  conso: { id: 'ri-conso', denomination: 'Collectif fictif des consommateurs d’énergie', categorie: 'Association' },
  sobre: { id: 'ri-sobre', denomination: 'Collectif fictif pour une transition sobre', categorie: 'Association' },
  plateforme: { id: 'ri-plateforme', denomination: 'Plateforme fictive de location courte durée', categorie: 'Société commerciale' },
  hotellerie: { id: 'ri-hotellerie', denomination: 'Fédération fictive de l’hôtellerie', categorie: 'Fédération professionnelle' },
} satisfies Record<string, RepresentantResume>;

const AVERTISSEMENT =
  'Ce rapprochement n’établit ni une rencontre, ni une influence sur le texte : seulement une action déclarée sur ce sujet.';

const verifie = (cible: CibleInteret): Lien<CibleInteret> => ({
  statut: 'verifie',
  cible,
  rapprochement: {
    statut: 'verifie',
    methode: 'reference_explicite',
    motif: 'l’action cite le texte',
    preuve: prov('HATVP', 'action', 'action-fictive'),
  },
});

const aVerifier = (candidat: CibleInteret, methode: 'meme_sujet' | 'meme_sujet_meme_periode'): Lien<CibleInteret> => ({
  statut: 'a_verifier',
  candidat,
  rapprochement: {
    statut: 'a_verifier',
    methode,
    motif: methode === 'meme_sujet' ? 'même sujet' : 'même sujet, même période',
    avertissement: AVERTISSEMENT,
  },
});

const action = (id: string, debut: string, fin: string, objet: string, responsables: string[]) => ({
  id,
  periode: { debut, fin },
  objet,
  responsables,
});

export const ACTIONS_ENR: ActionRepresentation[] = [
  {
    ...action('act-enr-1', '2026-01-01', '2026-03-31', 'Objectifs de renouvelables dans la programmation énergétique', ['Député', 'Collaborateur parlementaire']),
    domaines: ['Énergie'],
    actions: ['Envoi de notes', 'Entretiens'],
    decisions: ['Projet de loi de programmation énergétique 2026-2035'],
    publieeLe: '2026-04-28',
  },
  {
    ...action('act-enr-2', '2026-01-01', '2026-03-31', 'Calendrier des appels d’offres éolien en mer', ['Membre du Gouvernement', 'Cabinet ministériel']),
    domaines: ['Énergie'],
    actions: ['Entretiens'],
    decisions: [],
    publieeLe: '2026-04-28',
  },
  {
    ...action('act-enr-3', '2026-04-01', '2026-06-30', 'Raccordement des installations au réseau', ['Sénateur']),
    domaines: ['Énergie'],
    actions: ['Envoi de notes'],
    decisions: [],
    publieeLe: '2026-07-30',
  },
  {
    ...action('act-enr-4', '2026-07-01', '2026-09-30', 'Bilan de la programmation devant le Parlement', ['Député', 'Sénateur']),
    domaines: ['Énergie'],
    actions: ['Organisation de discussions'],
    decisions: [],
    publieeLe: '2026-10-20',
  },
];

const lien = (
  representant: RepresentantResume,
  a: LienInteret['action'],
  actionsDeclarees: number,
  vers: Lien<CibleInteret>,
): LienInteret => ({ representant, action: a, actionsDeclarees, vers });

const nucleaire1 = action('act-nuc-1', '2026-01-01', '2026-03-31', 'Calendrier des nouveaux réacteurs', ['Député']);
const conso1 = action('act-conso-1', '2026-01-01', '2026-06-30', 'Tarifs réglementés de l’électricité', ['Député', 'Sénateur']);
const sobre1 = action('act-sobre-1', '2026-01-01', '2026-03-31', 'Programmation énergétique', ['Député']);

export const INTERETS = {
  /** Section « Intérêts » du dossier énergie. */
  dossierEnergie: [
    lien(R.enr, ACTIONS_ENR[0], 12, verifie({ type: 'dossier', dossier: D.energie })),
    lien(R.nucleaire, nucleaire1, 9, verifie({ type: 'dossier', dossier: D.energie })),
    lien(R.conso, conso1, 4, aVerifier({ type: 'dossier', dossier: D.energie }, 'meme_sujet_meme_periode')),
  ],
  dossierLocation: [
    lien(
      R.plateforme,
      action('act-plat-1', '2026-01-01', '2026-06-30', 'Plafond de nuits, enregistrement des meublés', ['Député']),
      7,
      verifie({ type: 'dossier', dossier: D.location }),
    ),
    lien(
      R.hotellerie,
      action('act-hot-1', '2026-01-01', '2026-06-30', 'Concurrence des meublés touristiques', ['Député', 'Sénateur']),
      5,
      aVerifier({ type: 'dossier', dossier: D.location }, 'meme_sujet_meme_periode'),
    ),
  ],
  amendementCE123: [
    lien(R.enr, ACTIONS_ENR[0], 12, aVerifier({ type: 'amendement', amendement: A.ce123, dossier: D.energie }, 'meme_sujet_meme_periode')),
  ],
  /** Lobbying sur le sujet du scrutin n° 1874, auprès de « députés » (pas de personne nommée). */
  voteCamille1874: [
    lien(R.nucleaire, nucleaire1, 9, aVerifier({ type: 'amendement', amendement: A.n1876, dossier: D.energie }, 'meme_sujet_meme_periode')),
    lien(R.sobre, sobre1, 3, aVerifier({ type: 'dossier', dossier: D.energie }, 'meme_sujet_meme_periode')),
  ],
  representantEnr: [
    lien(R.enr, ACTIONS_ENR[0], 12, verifie({ type: 'dossier', dossier: D.energie })),
    lien(R.enr, ACTIONS_ENR[0], 12, aVerifier({ type: 'amendement', amendement: A.ce123, dossier: D.energie }, 'meme_sujet_meme_periode')),
    lien(R.enr, ACTIONS_ENR[3], 12, aVerifier({ type: 'article', article: ART.e14bis, dossier: D.energie }, 'meme_sujet')),
  ],
};

export const FICHE_REPRESENTANT_ENR: FicheRepresentant = {
  id: R.enr.id,
  denomination: R.enr.denomination,
  nomUsage: null,
  categorie: R.enr.categorie,
  identifiant: { valeur: '[IDENTIFIANT HATVP]', type: 'HATVP' },
  inscritDepuis: '2018-03-12',
  secteurs: ['Énergie', 'Environnement'],
  exercice: {
    periode: { debut: '2026-01-01', fin: '2026-12-31' },
    actions: 12,
    depenses: '[TRANCHE]',
    salaries: 4,
    personnesDeclarees: null,
  },
  actions: { elements: ACTIONS_ENR, page: 1, taille: 20, total: 4, suivante: null },
  rapprochements: INTERETS.representantEnr,
  provenance: prov('HATVP', 'representant', 'ri-enr', lienFictif('hatvp/ri-enr')),
};
