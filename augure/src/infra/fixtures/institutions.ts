// Fixtures : institutions du canevas (hémicycles par groupe, Gouvernement, Conseil constitutionnel).

import type { GroupeRef, Institution } from '../../core/domain/model';
import { D, P, comme, lienFictif, prov } from './entites';
import { RESUMES } from './dossiers';
import { COMPOSITION_AN, COMPOSITION_SENAT, SIEGEANTS_AN, SIEGEANTS_SENAT } from './sieges';

const sieges = (lignes: [GroupeRef, number][]) => lignes.map(([groupe, n], rang) => ({ groupe, sieges: n, rang }));

export const INSTITUTIONS: Record<'an' | 'senat' | 'gouvernement' | 'cc', Institution> = {
  an: {
    type: 'an',
    libelle: 'Assemblée nationale',
    legislature: '17',
    date: '2026-10-24',
    sieges: 577,
    groupes: sieges(COMPOSITION_AN),
    sansGroupe: 0,
    membres: SIEGEANTS_AN,
  },
  senat: {
    type: 'senat',
    libelle: 'Sénat',
    legislature: null,
    date: '2026-10-24',
    sieges: 348,
    groupes: sieges(COMPOSITION_SENAT),
    sansGroupe: 0,
    membres: SIEGEANTS_SENAT,
  },
  gouvernement: {
    type: 'gouvernement',
    libelle: 'Gouvernement',
    actuel: {
      id: 'gouvernement-2',
      nom: 'Gouvernement [NOM] II',
      debut: '2025-05-12',
      fin: null,
      membres: [
        { personne: comme(P.claire, 'Ministre de la Transition énergétique'), fonction: 'Ministre de la Transition énergétique', depuis: '2025-05-12', ancienne: 'ancienne députée (2017-2025)' },
        { personne: comme(P.sarah, 'Ministre déléguée au Logement'), fonction: 'Ministre déléguée au Logement', depuis: '2026-02-03', ancienne: 'ancienne sénatrice (2020-2026)' },
      ],
    },
    gouvernements: [
      { id: 'gouvernement-2', nom: 'Gouvernement [NOM] II', debut: '2025-05-12', fin: null },
      { id: 'gouvernement-1', nom: 'Gouvernement [NOM] I', debut: '2024-07-22', fin: '2025-05-11' },
      { id: 'gouvernement-0', nom: 'Gouvernement [NOM]', debut: '2024-01-09', fin: '2024-07-21' },
    ],
    textesDeposes: { total: 14, dossiers: [RESUMES.energie, RESUMES.budget, RESUMES.epargne] },
  },
  cc: {
    type: 'cc',
    libelle: 'Conseil constitutionnel',
    saisinesEnCours: [{ dossier: D.energie, date: '2026-10-17', saisissants: '60 députés' }],
    decisions: [
      {
        id: 'cc-2026-412',
        numero: '2026-412 DC',
        type: 'DC',
        date: '2026-03-28',
        solution: 'Conformité',
        dossier: D.medecins,
        url: lienFictif('constit/2026-412-DC'),
        provenance: prov('CONSTIT', 'decision', 'CONSTEXT-fictif-412'),
      },
      {
        id: 'cc-2026-198',
        numero: '2026-198 DC',
        type: 'DC',
        date: '2026-02-12',
        solution: 'Non conformité partielle',
        dossier: D.ia,
        url: lienFictif('constit/2026-198-DC'),
        provenance: prov('CONSTIT', 'decision', 'CONSTEXT-fictif-198'),
      },
      {
        id: 'cc-2026-37',
        numero: '2026-37 QPC',
        type: 'QPC',
        date: '2026-01-30',
        solution: 'Non conformité totale',
        dossier: null,
        url: lienFictif('constit/2026-37-QPC'),
        provenance: prov('CONSTIT', 'decision', 'CONSTEXT-fictif-37'),
      },
    ],
  },
};
