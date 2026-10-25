// Fixtures « Mes suivis » : les dossiers énergie et location et Camille Exemple suivis.
//   - depuis le 1er octobre 2026 : trois actes du parcours, aucun vote de Camille contre son groupe ;
//   - Camille seule depuis le 1er mars 2026 : son vote du scrutin n° 1874 contre son groupe.
// Un identifiant inconnu est rendu dans `inconnus`, jamais une erreur.

import type { Suivis } from '../../core/domain/model';
import { RESUMES } from './dossiers';
import { D, P, prov } from './entites';
import { PERSONNES } from './personnes';
import { S } from './scrutins';

const LIMITES = [
  'Seuls les actes publiés du parcours et les votes en scrutin public à l’inverse du groupe sont suivis.',
  'Vos suivis restent sur votre appareil : nous ne savons pas qui suit quoi.',
];

const CAMILLE = PERSONNES['camille-exemple/parcours'].entete;

export const SUIVIS_OCTOBRE: Suivis = {
  demande: { dossiers: [D.energie.id, D.location.id, 'dossier-inconnu'], personnes: [P.camille.id], depuis: '2026-10-01' },
  evenements: [
    {
      type: 'acte',
      date: '2026-10-17',
      dossier: D.energie,
      cle: 'cc',
      libelle: 'Conseil constit. · Saisine du conseil constitutionnel',
      provenance: prov('AN', 'acte', 'DLR5L17N-energie-cc'),
    },
    {
      type: 'acte',
      date: '2026-10-15',
      dossier: D.energie,
      cle: 'conclusions_cmp',
      libelle: 'Vote du texte de la CMP · Sénat : adopté · AN : adopté',
      provenance: prov('AN', 'acte', 'DLR5L17N-energie-conclusions_cmp'),
    },
    {
      type: 'acte',
      date: '2026-10-14',
      dossier: D.location,
      cle: 'nouvelle_lecture',
      libelle: 'Nouvelle lecture · AN : adoptée · Sénat : rejetée',
      provenance: prov('AN', 'acte', 'DLR5L17N-location-nouvelle_lecture'),
    },
  ],
  dossiers: [RESUMES.energie, RESUMES.location],
  personnes: [CAMILLE],
  inconnus: ['dossier-inconnu'],
  limites: LIMITES,
};

export const SUIVIS_CAMILLE_MARS: Suivis = {
  demande: { dossiers: [], personnes: [P.camille.id], depuis: '2026-03-01' },
  evenements: [{ type: 'ecart', date: S.an1874.date, personne: { id: P.camille.id, nom: P.camille.nom }, scrutin: S.an1874 }],
  dossiers: [],
  personnes: [CAMILLE],
  inconnus: [],
  limites: LIMITES,
};
