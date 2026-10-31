// Fiches question (écran Question) : les deux questions déjà présentes dans les fixtures (onglet
// « Dossiers » de Camille Exemple, faits de contrôle de l'Explorer), mêmes identifiants et mêmes
// champs, avec leurs textes. Tout est fictif. Le ministère est celui publié, jamais la personne du
// ministre ; une question écrite sans réponse reste « en attente », jamais un échec.
// « Questions de la même séance » : les QG 1201 et 1202 sont du même jour, donc de la même séance de
// questions au Gouvernement ; une QE n'en a pas (null).

import type { FicheQuestion, QuestionDeLaSeance } from '../../core/domain/model';
import { AUJOURDHUI, P, prov } from './entites';

/** Résumé d'une QG pour « Questions de la même séance » (auteur sans fonction, comme l'API). */
const deLaSeance = (q: FicheQuestion): QuestionDeLaSeance => ({
  id: q.id,
  type: q.type,
  numero: q.numero,
  date: q.date,
  titre: q.titre,
  rubrique: q.rubrique,
  ministere: q.ministereAttributaire ?? q.ministereInterroge,
  dateReponse: q.dateReponse,
  auteur: q.auteur ? { ...q.auteur, fonction: null } : null,
  provenance: q.provenance,
});

/** Question au Gouvernement, réponse en séance le même jour. */
export const QUESTION_QG_1201: FicheQuestion = {
  id: 'question-qg-1201',
  type: 'QG',
  chambre: 'AN',
  numero: '1201',
  legislature: '17',
  titre: 'Raccordement des parcs éoliens en mer',
  rubrique: 'énergie et carburants',
  auteur: P.camille,
  ministereInterroge: 'Ministère de la Transition énergétique',
  ministereAttributaire: 'Ministère de la Transition énergétique',
  attributions: [{ ministere: 'Ministère de la Transition énergétique', date: '2026-05-12' }],
  date: '2026-05-12',
  dateReponse: '2026-05-12',
  texteQuestion:
    'Madame la ministre, trois parcs éoliens en mer attendent leur raccordement au réseau. Quel calendrier le Gouvernement retient-il pour les travaux, et qui en supportera le coût ?',
  texteReponse:
    'Madame la députée, les raccordements des trois parcs sont programmés d’ici 2028. Le coût est porté par le gestionnaire du réseau, comme le prévoit le code de l’énergie.',
  statut: 'repondue',
  cloture: { libelle: 'Réponse publiée', date: '2026-05-12' },
  jour: AUJOURDHUI,
  provenance: prov('AN', 'question', 'QANR5L17QG1201'),
};

/** Autre question au Gouvernement du même jour (même séance de questions). */
export const QUESTION_QG_1202: FicheQuestion = {
  id: 'question-qg-1202',
  type: 'QG',
  chambre: 'AN',
  numero: '1202',
  legislature: '17',
  titre: 'Prix de l’électricité pour les ménages',
  rubrique: 'énergie et carburants',
  auteur: P.hugo,
  ministereInterroge: 'Ministère de l’Économie',
  ministereAttributaire: 'Ministère de l’Économie',
  attributions: [{ ministere: 'Ministère de l’Économie', date: '2026-05-12' }],
  date: '2026-05-12',
  dateReponse: '2026-05-12',
  texteQuestion: null,
  texteReponse:
    'M. Hugo Fictif. Monsieur le ministre, les tarifs proposés aux ménages s’éloignent du prix de gros. Que comptez-vous faire ? M. le ministre. Monsieur le député, un rapport sur les marges des fournisseurs sera publié avant l’été.',
  statut: 'repondue',
  cloture: { libelle: 'Réponse publiée', date: '2026-05-12' },
  jour: AUJOURDHUI,
  provenance: prov('AN', 'question', 'QANR5L17QG1202'),
};

QUESTION_QG_1201.memeSeance = [deLaSeance(QUESTION_QG_1202)];
QUESTION_QG_1202.memeSeance = [deLaSeance(QUESTION_QG_1201)];

/** Question écrite publiée au JO, attribuée, sans réponse publiée : en attente. */
export const QUESTION_QE_4521: FicheQuestion = {
  id: 'question-qe-4521',
  type: 'QE',
  chambre: 'AN',
  numero: '4521',
  legislature: '17',
  titre: 'Marges des fournisseurs d’électricité',
  rubrique: 'énergie et carburants',
  auteur: P.hugo,
  ministereInterroge: 'Ministère de l’Économie',
  ministereAttributaire: 'Ministère de la Transition énergétique',
  attributions: [
    { ministere: 'Ministère de l’Économie', date: '2026-06-12' },
    { ministere: 'Ministère de la Transition énergétique', date: '2026-07-03' },
  ],
  date: '2026-06-12',
  dateReponse: null,
  texteQuestion:
    'M. Hugo Fictif attire l’attention de M. le ministre sur l’écart entre le prix de gros de l’électricité et les tarifs proposés aux ménages. Il lui demande quelles données le Gouvernement publie sur les marges des fournisseurs.',
  texteReponse: null,
  statut: 'en_attente',
  cloture: null,
  jour: AUJOURDHUI,
  memeSeance: null,
  provenance: prov('AN', 'question', 'QANR5L17QE4521'),
};
