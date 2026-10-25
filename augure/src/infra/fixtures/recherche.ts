// Fixtures : recherche transversale sur les données fictives du canevas, et accusé de signalement.

import type { AccuseSignalement, ResultatRecherche, Trouve, TypeRecherche } from '../../core/domain/model';
import { A, D, G, P } from './entites';
import { R } from './interets';
import { S } from './scrutins';

const t = (type: TypeRecherche, id: string, titre: string, contexte: string, groupe: Trouve['groupe'] = null): Trouve => ({
  type,
  id,
  titre,
  contexte,
  groupe,
  ...(type === 'personnes' ? { identite: 'personne' as const } : {}),
});

const page = (elements: Trouve[]) => ({ elements, page: 1, taille: 5, total: elements.length, suivante: null });

export const RECHERCHE_ENERGIE: ResultatRecherche = {
  q: 'énergie',
  type: null,
  sections: [
    {
      type: 'dossiers',
      resultats: page([t('dossiers', D.energie.id, 'Projet de loi de programmation énergétique 2026-2035', 'Projet de loi · au Conseil constitutionnel')]),
    },
    {
      type: 'personnes',
      resultats: page([
        t('personnes', P.claire.id, P.claire.nom, 'Ministre de la Transition énergétique'),
        t('personnes', P.camille.id, P.camille.nom, 'Députée · Essonne · rapporteure énergie', G.A),
        t('personnes', P.pierre.id, P.pierre.nom, 'Sénateur · rapporteur énergie', G.S1),
      ]),
    },
    {
      type: 'amendements',
      resultats: page([
        t('amendements', A.ce123.id, 'Amendement CE123', 'CE123 · Art. 3 · Adopté'),
        t('amendements', A.com56.id, 'Amendement COM-56', 'COM-56 · Sénat · Art. 3 · Adopté'),
      ]),
    },
    {
      type: 'scrutins',
      resultats: page([
        t('scrutins', S.an1874.id, 'Scrutin n° 1874', 'AN · 12/03/2026 · Rejeté 247 – 268'),
        t('scrutins', S.an2410.id, 'Scrutin n° 2410', 'AN · 15/10/2026 · Adopté 330 – 190'),
      ]),
    },
    {
      type: 'organisations',
      resultats: page([
        t('organisations', R.enr.id, R.enr.denomination, 'Représentant d’intérêts · 12 actions en 2026'),
        t('organisations', R.nucleaire.id, R.nucleaire.denomination, 'Représentant d’intérêts · 9 actions en 2026'),
      ]),
    },
  ],
};

export const RECHERCHE_VIDE: ResultatRecherche = { q: 'zzzz', type: 'dossiers', sections: [] };

export const ACCUSE_SIGNALEMENT: AccuseSignalement = { id: 'signalement-fictif-1', recuLe: '2026-10-24T10:00:00+02:00' };
