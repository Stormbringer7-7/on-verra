// Fixtures : fonctions datées (frise) et déclarations HATVP des personnes fictives du canevas.
// Partagées par les fiches Personne et « Pourquoi ce vote ». Rubriques sans données privées.

import type { DeclarationHatvp, DeclarationResume, FonctionDatee } from '../../core/domain/model';
import { G, lienFictif, prov } from './entites';

const f = (
  titre: string,
  type: FonctionDatee['type'],
  debut: string,
  fin: string | null,
  source: FonctionDatee['source'],
  idNatif: string,
  extra: Partial<FonctionDatee> = {},
): FonctionDatee => ({
  titre,
  type,
  organisation: null,
  groupe: null,
  debut,
  fin,
  source,
  provenance: prov(source, source === 'RNE' ? 'mandat' : 'fonction', idNatif),
  ...extra,
});

/** Rattachement d'un mandat RNE à la personne : seulement par décision de revue humaine. */
const parRevue = (cas: string): FonctionDatee['rattachement'] => ({
  statut: 'verifie',
  methode: 'revue_humaine',
  motif: `Mandat relié à la personne par la revue humaine (cas ${cas})`,
  preuve: null,
});

export const FONCTIONS = {
  camille: [
    f('Conseillère municipale, [COMMUNE]', 'mandat_local', '2014-03-30', '2020-06-28', 'RNE', 'rne-cm-001', { rattachement: parRevue('elu_local:001') }),
    f('Adjointe au maire chargée de l’environnement', 'mandat_local', '2014-04-20', '2020-06-28', 'RNE', 'rne-adj-001', { rattachement: parRevue('elu_local:002') }),
    f('Conseillère départementale de l’Essonne', 'mandat_local', '2015-03-29', '2021-06-27', 'RNE', 'rne-cd-001', { rattachement: parRevue('elu_local:003') }),
    f('Députée de l’Essonne, 4e circonscription', 'depute', '2022-06-22', null, 'AN', 'PM-fictif-001'),
    f('Membre de la commission des affaires économiques', 'membre_commission', '2022-06-29', null, 'AN', 'PM-fictif-002', {
      organisation: { id: 'commission-affeco-an', nom: 'Commission des affaires économiques' },
    }),
    f('Vice-présidente du Groupe A', 'membre_groupe', '2024-07-18', null, 'AN', 'PM-fictif-003', { groupe: G.A }),
    f('Rapporteure du projet de loi de programmation énergétique', 'autre', '2026-01-20', '2026-10-15', 'AN', 'PM-fictif-004'),
  ],
  claire: [
    f('Conseillère régionale', 'mandat_local', '2012-03-21', '2017-07-01', 'RNE', 'rne-cr-002', { rattachement: parRevue('elu_local:010') }),
    f('Députée de la Gironde, 5e circonscription', 'depute', '2017-06-21', '2025-05-11', 'AN', 'PM-fictif-010'),
    f('Présidente de la commission du développement durable', 'presidence', '2022-06-30', '2025-05-11', 'AN', 'PM-fictif-011'),
    f('Ministre de la Transition énergétique', 'membre_gouvernement', '2025-05-12', null, 'AN', 'PM-fictif-012', {
      organisation: { id: 'gouvernement-2', nom: 'Gouvernement [NOM] II' },
    }),
  ],
  nadia: [
    f('Conseillère municipale, [COMMUNE]', 'mandat_local', '2008-03-16', '2014-03-30', 'RNE', 'rne-cm-020', { rattachement: parRevue('elu_local:020') }),
    f('Adjointe au maire chargée du logement', 'mandat_local', '2014-03-30', '2017-06-20', 'RNE', 'rne-adj-020', { rattachement: parRevue('elu_local:021') }),
    f('Députée des Bouches-du-Rhône, 5e circonscription', 'depute', '2017-06-21', '2022-06-21', 'AN', 'PM-fictif-020'),
    f('Maire de [COMMUNE]', 'mandat_local', '2020-07-03', null, 'RNE', 'rne-maire-020', { rattachement: parRevue('elu_local:022') }),
    f('Vice-présidente de [INTERCOMMUNALITÉ], chargée de l’habitat', 'mandat_local', '2020-07-15', null, 'RNE', 'rne-epci-020', {
      rattachement: parRevue('elu_local:023'),
    }),
  ],
} satisfies Record<string, FonctionDatee[]>;

const resume = (
  id: string,
  type: string,
  libelle: string,
  modificative: boolean,
  dateDepot: string,
  datePublication: string,
): DeclarationResume => ({ id, type, libelle, modificative, dateDepot, datePublication, url: lienFictif(`hatvp/${id}`) });

export const DECLARATIONS_CAMILLE: DeclarationHatvp[] = [
  {
    ...resume('decl-camille-2022', 'DIA', 'Déclaration d’intérêts et d’activités', false, '2022-08-12', '2022-10-03'),
    qualite: 'Députée',
    mandat: 'Député',
    provenance: prov('HATVP', 'declaration', 'decl-camille-2022', lienFictif('hatvp/decl-camille-2022')),
    rubriques: [
      { rubrique: 'activProfCinqDerniereDto', libelle: 'Activités professionnelles (5 dernières années)', neant: false, elements: [{ description: '[ACTIVITÉ DÉCLARÉE]' }] },
      {
        rubrique: 'mandatElectifDto',
        libelle: 'Mandats électifs',
        neant: false,
        elements: [{ description: 'Conseillère municipale' }, { description: 'Adjointe au maire' }, { description: 'Conseillère départementale' }],
      },
      { rubrique: 'participationFinanciereDto', libelle: 'Participations financières dans des sociétés', neant: true, elements: [] },
      { rubrique: 'fonctionBenevoleDto', libelle: 'Fonctions bénévoles', neant: false, elements: [{ description: '[FONCTION DÉCLARÉE]' }] },
    ],
  },
  {
    ...resume('decl-camille-2024', 'DIAM', 'Déclaration modificative d’intérêts et d’activités', true, '2024-03-08', '2024-04-15'),
    qualite: 'Députée',
    mandat: 'Député',
    provenance: prov('HATVP', 'declaration', 'decl-camille-2024', lienFictif('hatvp/decl-camille-2024')),
    rubriques: [
      { rubrique: 'mandatElectifDto', libelle: 'Mandats électifs', neant: false, elements: [{ description: 'Fin d’un mandat local' }] },
      { rubrique: 'participationFinanciereDto', libelle: 'Participations financières dans des sociétés', neant: true, elements: [] },
    ],
  },
];

export const DECLARATIONS_CLAIRE: DeclarationHatvp[] = [
  {
    ...resume('decl-claire-2025', 'DI', 'Déclaration d’intérêts (membre du Gouvernement)', false, '2025-06-10', '2025-07-22'),
    qualite: 'Membre du Gouvernement',
    mandat: null,
    provenance: prov('HATVP', 'declaration', 'decl-claire-2025'),
    rubriques: [
      { rubrique: 'activProfCinqDerniereDto', libelle: 'Activités professionnelles (5 dernières années)', neant: false, elements: [{ description: '[ACTIVITÉ DÉCLARÉE]' }] },
      { rubrique: 'participationFinanciereDto', libelle: 'Participations financières dans des sociétés', neant: true, elements: [] },
    ],
  },
];

/** Version courte (« Pourquoi ce vote »). */
export const resumes = (liste: DeclarationHatvp[]): DeclarationResume[] =>
  liste.map(({ id, type, libelle, modificative, dateDepot, datePublication, url }) => ({
    id,
    type,
    libelle,
    modificative,
    dateDepot,
    datePublication,
    url,
  }));
