// Fixtures : prises de parole fictives (commission et séance), telles qu'un compte rendu les
// publierait. En commission AN, l'orateur n'est connu que par son nom publié (« nom_publie »).

import type { Intervenant, Intervention, InterventionExtrait, ListeInterventions, Orateur, ReunionRef } from '../../core/domain/model';
import { A, D, G, P, lienFictif, orateur, prov } from './entites';

const COMMISSION_AN_0302: ReunionRef = {
  id: 'reunion-an-com-2026-02-03',
  type: 'commission',
  chambre: 'AN',
  organe: { id: 'commission-affeco-an', nom: 'Commission des affaires économiques' },
  debut: '2026-02-03T09:30:00+01:00',
};

const SEANCE_AN_1203: ReunionRef = {
  id: 'reunion-an-seance-2026-03-12',
  type: 'seance',
  chambre: 'AN',
  organe: { id: 'assemblee-nationale', nom: 'Assemblée nationale' },
  debut: '2026-03-12T21:30:00+01:00',
};

const nomPublie = (nom: string, qualite: string | null = null): Orateur => ({ type: 'nom_publie', nom, qualite });

const intervention = (
  id: string,
  reunion: ReunionRef,
  ordre: number,
  orateurIci: Orateur,
  groupe: Intervention['groupe'],
  texte: string,
  sujet: Partial<Intervention['sujet']>,
): Intervention => ({
  id,
  reunion,
  ordre,
  horodatage: reunion.type === 'seance' ? ordre * 42 : null,
  orateur: orateurIci,
  groupe,
  texte,
  sujet: { dossier: D.energie, article: null, amendement: null, point: null, ...sujet },
  compteRendu: {
    url: lienFictif(reunion.type === 'seance' ? 'an/compte-rendu/2026-03-12-2e-seance' : 'an/commission/affeco/2026-02-03'),
    ancre: `p-${ordre}`,
    provenance: prov('AN', 'intervention', `${reunion.id}#${ordre}`),
  },
  synthese: null,
});

const SUR_CE123 = { article: 'Article 3', amendement: A.ce123, point: 'Projet de loi de programmation énergétique 2026-2035' };

export const INTERVENTIONS_CE123: Intervention[] = [
  intervention(
    'int-com-0302-41', COMMISSION_AN_0302, 41, nomPublie('Mme Inès Modèle'), null,
    'Quarante pour cent, c’est l’objectif d’hier. Les capacités attribuées en mer permettent d’aller plus loin dès 2035. Cet amendement aligne simplement notre programmation sur la trajectoire européenne.',
    SUR_CE123,
  ),
  intervention(
    'int-com-0302-42', COMMISSION_AN_0302, 42, nomPublie('Mme Camille Exemple', 'rapporteure'), null,
    'Avis favorable : cette cible reste cohérente avec les appels d’offres déjà lancés.',
    SUR_CE123,
  ),
  intervention(
    'int-com-0302-43', COMMISSION_AN_0302, 43, nomPublie('M. Hugo Fictif'), null,
    'Nous voterons contre : rien ne garantit le raccordement de ces capacités au réseau d’ici là.',
    SUR_CE123,
  ),
];

export const INTERVENTIONS_SEANCE_1203: Intervention[] = [
  intervention(
    'int-an-1203-12', SEANCE_AN_1203, 12, orateur(P.hugo), G.B,
    'Six réacteurs en 2045, c’est trop tard. Notre amendement avance l’échéance à 2040, comme le permettent les capacités industrielles annoncées.',
    { article: 'Article 5', amendement: A.n1876 },
  ),
  intervention(
    'int-an-1203-13', SEANCE_AN_1203, 13, orateur(P.claire, 'ministre'), null,
    'Avis défavorable du Gouvernement : le calendrier retenu est celui que la filière peut tenir.',
    { article: 'Article 5', amendement: A.n1876 },
  ),
  intervention(
    'int-an-1874-camille', SEANCE_AN_1203, 14, orateur(P.camille, 'rapporteure'), G.A,
    'Avancer ce calendrier sans plan de financement ni de formation des équipes, c’est fragiliser le programme lui-même. Je voterai contre cet amendement, pas contre le nucléaire.',
    { article: 'Article 5', amendement: A.n1876 },
  ),
];

/** Extrait d'une intervention (début du texte). */
export const extrait = (i: Intervention, longueur = 160): InterventionExtrait => ({
  id: i.id,
  orateur: i.orateur,
  groupe: i.groupe,
  date: i.reunion.debut?.slice(0, 10) ?? null,
  extrait: i.texte.length > longueur ? i.texte.slice(0, i.texte.lastIndexOf(' ', longueur)) : i.texte,
  tronque: i.texte.length > longueur,
  compteRendu: i.compteRendu,
});

export const INTERVENANTS = {
  energieCommission: [
    { orateur: nomPublie('Mme Camille Exemple', 'rapporteure'), groupe: null, interventions: 41, extrait: extrait(INTERVENTIONS_CE123[1]) },
    { orateur: nomPublie('Mme Inès Modèle'), groupe: null, interventions: 38, extrait: extrait(INTERVENTIONS_CE123[0]) },
    { orateur: nomPublie('M. Hugo Fictif'), groupe: null, interventions: 12, extrait: extrait(INTERVENTIONS_CE123[2]) },
  ],
  energieSeance: [
    { orateur: orateur(P.claire, 'ministre'), groupe: null, interventions: 31, extrait: extrait(INTERVENTIONS_SEANCE_1203[1]) },
    { orateur: orateur(P.camille, 'rapporteure'), groupe: G.A, interventions: 24, extrait: extrait(INTERVENTIONS_SEANCE_1203[2]) },
    { orateur: orateur(P.hugo), groupe: G.B, interventions: 17, extrait: extrait(INTERVENTIONS_SEANCE_1203[0]) },
  ],
} satisfies Record<string, Intervenant[]>;

export const LISTE_INTERVENTIONS_CE123: ListeInterventions = {
  cible: { type: 'amendement', id: A.ce123.id },
  libelle: 'Amendement CE123 · Commission des affaires économiques',
  interventions: { elements: INTERVENTIONS_CE123, page: 1, taille: 20, total: 3, suivante: null },
};

export const LISTE_INTERVENTIONS_SEANCE_AN: ListeInterventions = {
  cible: { type: 'etape', dossier: D.energie.id, cle: 'seance_1_o' },
  libelle: 'Séance AN · Programmation énergétique',
  interventions: { elements: INTERVENTIONS_SEANCE_1203, page: 1, taille: 3, total: 1214, suivante: 2 },
};
