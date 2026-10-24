// Handler des institutions : Assemblée nationale et Sénat (composition par groupe), Gouvernement
// (membres, gouvernements de la législature, projets de loi déposés), Conseil constitutionnel.

import type { TypeInstitution } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, parmi, remplirPar } from './commun';
import { REMPLIR } from './syntheses';

/** Projets de loi du gouvernement actuel, décisions récentes du Conseil, montrés au plus. */
export const LIMITE_TEXTES_DEPOSES = 5;
export const LIMITE_DECISIONS_CC = 10;

const INSTITUTIONS: Record<TypeInstitution, true> = { an: true, senat: true, gouvernement: true, cc: true };

export function lecturesInstitutions({ depots, synthetiseur, horloge }: LecturesDeps): Pick<Handlers, 'ConsulterInstitution'> {
  const r = remplirPar(synthetiseur);
  const { institutions, dossiers } = depots;

  return {
    ConsulterInstitution: async ({ institution }) => {
      const type = parmi(institution, INSTITUTIONS, 'Institution');
      const jour = horloge.aujourdhui();
      switch (type) {
        case 'an':
        case 'senat':
          return institutions.chambre(type, jour);
        case 'cc':
          return institutions.conseilConstitutionnel(LIMITE_DECISIONS_CC);
        case 'gouvernement': {
          const gouvernement = await institutions.gouvernement(jour);
          const textesDeposes = gouvernement.actuel
            ? await dossiers.deposesParLeGouvernement(gouvernement.actuel.debut ?? jour, LIMITE_TEXTES_DEPOSES)
            : { total: 0, dossiers: [] };
          return REMPLIR.ConsulterInstitution(r, { ...gouvernement, textesDeposes });
        }
      }
    },
  };
}
