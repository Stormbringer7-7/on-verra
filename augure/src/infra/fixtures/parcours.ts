// Parcours réels (copie de `civictrace`, projection du 27/10/2026, valeurs de
// opendata/docs/indicateurs.md) : le rail de la fiche Dossier est testé sur ces quatre cas, pas
// seulement sur les dossiers fictifs du canevas.
//   AGRICOLE      DLR5L17N54085, loi ordinaire accélérée, promulguée (déviation au dépôt, branche)
//   FIN_DE_VIE    DLR5L17N51670, navette normale, CMP en désaccord, lecture définitive
//   ENGAGEMENT    DLR5L17N53597, 49.3 sur la 1re partie du PLF 2026, rattaché à sa nouvelle lecture
//   CADUC_SENAT   ppl23-694, proposition de loi du Sénat devenue caduque (état publié, sans date)

import type { CaseParcours, EtatCase, Lieu, NatureEtape, Parcours, Provenance } from '../../core';
import { prov } from './entites';

const AN = (uid: string): Provenance => prov('AN', 'dossier', uid, `https://www.assemblee-nationale.fr/dyn/17/dossiers/${uid}`);
const SENAT = (signet: string): Provenance => prov('SENAT', 'dossier', signet, `https://www.senat.fr/dossier-legislatif/${signet}.html`);

type Ligne = [cle: string, libelle: string, lieu: Lieu | null, nature: NatureEtape, etat: EtatCase, debut?: string | null, fin?: string | null, conclusion?: string | null];

function etapes(source: Provenance, lignes: Ligne[], deviations: string[] = []): CaseParcours[] {
  return lignes.map(([cle, libelle, lieu, nature, etat, debut = null, fin = null, conclusion = null], i) => ({
    rang: i + 1,
    cle,
    libelle,
    lieu,
    facultative: nature !== 'obligatoire',
    nature,
    etat,
    courante: etat === 'en_cours',
    attendue: false,
    deviation: deviations.includes(cle),
    debut,
    fin,
    programmeeLe: null,
    conclusion,
    provenance: etat === 'faite' || etat === 'en_cours' ? [source] : [],
  }));
}

const LOI_ORDINAIRE: Parcours['modele'] = {
  cle: 'loi_ordinaire',
  version: 1,
  libelle: 'Loi ordinaire',
  famille: 'legislatif',
  fondement: 'Constitution, art. 39 à 45 (navette, CMP, dernier mot de l’AN), 61 (Conseil constitutionnel) et 10 (promulgation)',
};

/** Navette d'une loi ordinaire au-delà de la 1re lecture, sans objet par défaut. */
const NAVETTE: Ligne[] = [
  ['lecture_2_o', '2e lecture AN', 'AN', 'conditionnelle', 'sans_objet'],
  ['lecture_2_s', '2e lecture Sénat', 'SENAT', 'conditionnelle', 'sans_objet'],
  ['lecture_n', 'Lectures suivantes', null, 'conditionnelle', 'sans_objet'],
];

export const PARCOURS_AGRICOLE: Parcours = {
  modele: LOI_ORDINAIRE,
  procedure: 'acceleree',
  origine: 'AN',
  cases: etapes(
    AN('DLR5L17N54085'),
    [
      ['depot', 'Dépôt AN', 'AN', 'obligatoire', 'faite', '2026-04-08', '2026-04-08'],
      ['commission_1_o', 'Commission AN', 'AN', 'obligatoire', 'faite', '2026-04-08', '2026-05-07'],
      ['seance_1_o', 'Séance AN', 'AN', 'obligatoire', 'faite', '2026-05-19', '2026-06-02', 'adopté'],
      ['transmission_1_s', 'Transmission Sénat', 'SENAT', 'obligatoire', 'faite', '2026-06-03', '2026-06-03'],
      ['commission_1_s', 'Commission Sénat', 'SENAT', 'obligatoire', 'faite', '2026-06-03', '2026-06-17'],
      ['seance_1_s', 'Séance Sénat', 'SENAT', 'obligatoire', 'faite', '2026-07-02', '2026-07-02', 'modifié'],
      ...NAVETTE,
      ['cmp', 'CMP', 'CMP', 'conditionnelle', 'faite', '2026-07-06', '2026-07-17', 'Accord'],
      ['conclusions_cmp', 'Vote du texte de la CMP', null, 'conditionnelle', 'faite', '2026-07-20', '2026-07-21', 'AN : adopté · Sénat : adopté'],
      ['nouvelle_lecture', 'Nouvelle lecture', null, 'conditionnelle', 'sans_objet'],
      ['lecture_definitive', 'Lecture définitive AN', 'AN', 'conditionnelle', 'sans_objet'],
      ['cc', 'Conseil constitutionnel', 'CC', 'facultative', 'faite', '2026-07-24', '2026-08-14', 'Non conformité partielle - réserve'],
      ['promulgation', 'Promulgation', 'PR', 'obligatoire', 'faite', '2026-08-18', '2026-08-18', 'Loi n° 2026-796'],
      ['jo', 'Journal officiel', 'JO', 'obligatoire', 'faite', '2026-08-19', '2026-08-19', 'JO n° 192'],
    ],
    ['depot'],
  ),
  deviations: [
    {
      cle: 'procedure_acceleree',
      libelle: 'Procédure accélérée',
      fondement: 'Constitution, art. 45, al. 2 : CMP possible après une seule lecture dans chaque chambre',
      etape: 'depot',
      effet: 'rejoint',
      debut: null,
      conclusion: null,
      provenance: [AN('DLR5L17N54085')],
    },
  ],
  branches: [{ de: 'conclusions_cmp', vers: 'cc', libelle: 'Texte de la CMP adopté : fin de la navette' }],
  parent: null,
  enfants: [],
  dateReference: '2026-10-27',
  prochaineEcheance: null,
};

export const PARCOURS_FIN_DE_VIE: Parcours = {
  modele: LOI_ORDINAIRE,
  procedure: 'normale',
  origine: 'AN',
  cases: etapes(AN('DLR5L17N51670'), [
    ['depot', 'Dépôt AN', 'AN', 'obligatoire', 'faite', '2025-03-11', '2025-03-11'],
    ['commission_1_o', 'Commission AN', 'AN', 'obligatoire', 'faite', '2025-03-11', '2025-05-02'],
    ['seance_1_o', 'Séance AN', 'AN', 'obligatoire', 'faite', '2025-05-12', '2025-05-27', 'adoptée'],
    ['transmission_1_s', 'Transmission Sénat', 'SENAT', 'obligatoire', 'faite', '2025-05-27', '2025-05-27'],
    ['commission_1_s', 'Commission Sénat', 'SENAT', 'obligatoire', 'faite', '2025-05-27', '2026-01-07'],
    ['seance_1_s', 'Séance Sénat', 'SENAT', 'obligatoire', 'faite', '2026-01-28', '2026-01-28', 'rejetée'],
    ['lecture_2_o', '2e lecture AN', 'AN', 'conditionnelle', 'faite', '2026-01-28', '2026-02-25', 'adoptée'],
    ['lecture_2_s', '2e lecture Sénat', 'SENAT', 'conditionnelle', 'faite', '2026-02-25', '2026-05-12', 'rejetée'],
    ['lecture_n', 'Lectures suivantes', null, 'conditionnelle', 'sans_objet'],
    ['cmp', 'CMP', 'CMP', 'conditionnelle', 'faite', '2026-05-19', '2026-06-03', 'Désaccord'],
    ['conclusions_cmp', 'Vote du texte de la CMP', null, 'conditionnelle', 'sans_objet'],
    ['nouvelle_lecture', 'Nouvelle lecture', null, 'conditionnelle', 'faite', '2026-05-12', '2026-07-07', 'AN : adoptée · Sénat : rejetée'],
    ['lecture_definitive', 'Lecture définitive AN', 'AN', 'conditionnelle', 'faite', '2026-07-09', '2026-07-15', 'adoptée'],
    ['cc', 'Conseil constitutionnel', 'CC', 'facultative', 'faite', '2026-07-16', '2026-08-14', 'Conformité - réserve'],
    ['promulgation', 'Promulgation', 'PR', 'obligatoire', 'faite', '2026-08-18', '2026-08-18', 'Loi n° 2026-794'],
    ['jo', 'Journal officiel', 'JO', 'obligatoire', 'faite', '2026-08-19', '2026-08-19', 'JO n° 192'],
  ]),
  deviations: [],
  branches: [{ de: 'cmp', vers: 'nouvelle_lecture', libelle: 'CMP sans accord : nouvelle lecture' }],
  parent: null,
  enfants: [],
  dateReference: '2026-10-27',
  prochaineEcheance: null,
};

export const PARCOURS_ENGAGEMENT: Parcours = {
  modele: {
    cle: 'responsabilite_gouvernement',
    version: 1,
    libelle: 'Responsabilité du Gouvernement',
    famille: 'gouvernement',
    fondement: 'Constitution, art. 49 et 50 ; règlement de l’AN, art. 152 à 156',
  },
  procedure: 'normale',
  origine: 'AN',
  cases: etapes(AN('DLR5L17N53597'), [
    ['declaration', 'Déclaration du Gouvernement', 'AN', 'conditionnelle', 'faite', '2026-01-20', '2026-01-20'],
    ['motion', 'Dépôt de la motion de censure', 'AN', 'conditionnelle', 'faite', '2026-01-20', '2026-01-20'],
    ['debat', 'Débat en séance', 'AN', 'conditionnelle', 'faite', '2026-01-23', '2026-01-23'],
    ['vote', 'Vote', 'AN', 'conditionnelle', 'faite', '2026-01-23', '2026-01-23'],
  ]),
  deviations: [],
  branches: [],
  parent: {
    dossier: { id: 'DLR5L17N52428', titre: 'Projet de loi de finances pour 2026' },
    etape: 'nouvelle_lecture',
    etapeLibelle: 'Nouvelle lecture',
  },
  enfants: [],
  dateReference: '2026-10-27',
  prochaineEcheance: null,
};

export const PARCOURS_CADUC_SENAT: Parcours = {
  modele: LOI_ORDINAIRE,
  procedure: 'normale',
  origine: 'SENAT',
  cases: etapes(
    SENAT('ppl23-694'),
    [
      ['depot', 'Dépôt Sénat', 'SENAT', 'obligatoire', 'faite', '2024-06-17', '2024-06-17', 'déposé au Sénat'],
      ['commission_1_o', 'Commission Sénat', 'SENAT', 'obligatoire', 'sans_objet'],
      ['seance_1_o', 'Séance Sénat', 'SENAT', 'obligatoire', 'sans_objet'],
      ['transmission_1_s', 'Transmission AN', 'AN', 'obligatoire', 'sans_objet'],
      ['commission_1_s', 'Commission AN', 'AN', 'obligatoire', 'sans_objet'],
      ['seance_1_s', 'Séance AN', 'AN', 'obligatoire', 'sans_objet'],
      ['lecture_2_o', '2e lecture Sénat', 'SENAT', 'conditionnelle', 'sans_objet'],
      ['lecture_2_s', '2e lecture AN', 'AN', 'conditionnelle', 'sans_objet'],
      ['lecture_n', 'Lectures suivantes', null, 'conditionnelle', 'sans_objet'],
      ['cmp', 'CMP', 'CMP', 'conditionnelle', 'sans_objet'],
      ['conclusions_cmp', 'Vote du texte de la CMP', null, 'conditionnelle', 'sans_objet'],
      ['nouvelle_lecture', 'Nouvelle lecture', null, 'conditionnelle', 'sans_objet'],
      ['lecture_definitive', 'Lecture définitive AN', 'AN', 'conditionnelle', 'sans_objet'],
      ['cc', 'Conseil constitutionnel', 'CC', 'facultative', 'sans_objet'],
      ['promulgation', 'Promulgation', 'PR', 'obligatoire', 'sans_objet'],
      ['jo', 'Journal officiel', 'JO', 'obligatoire', 'sans_objet'],
    ],
    ['depot'],
  ),
  deviations: [
    {
      cle: 'caducite',
      libelle: 'Caducité',
      fondement:
        'Fin de législature ou dissolution (textes en instance à l’AN) ; renouvellement partiel du Sénat (propositions des sénateurs non adoptées, règlement du Sénat) : état publié par DOSLEG',
      etape: 'depot',
      effet: 'termine',
      debut: null,
      conclusion: null,
      provenance: [SENAT('ppl23-694')],
    },
  ],
  branches: [],
  parent: null,
  enfants: [],
  dateReference: '2026-10-27',
  prochaineEcheance: null,
};
