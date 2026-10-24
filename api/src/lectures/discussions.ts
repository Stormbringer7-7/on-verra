// Handler des discussions : prises de parole d'une étape, d'une réunion, sur un amendement ou
// d'une personne, texte intégral et paginé (DiscussionsRepository.interventions).

import type { CibleInterventions } from '@contrat/domain/model';

import { CASES, type Handlers, type LecturesDeps, RequeteInvalide, borner, parmi, remplirPar, texte, texteFacultatif, trouve } from './commun';
import { REMPLIR } from './syntheses';

/** La cible telle qu'elle doit être : exactement une, et ses identifiants. */
function cibleValide(cible: unknown): CibleInterventions {
  const c = (cible ?? {}) as Record<string, unknown>;
  switch (c.type) {
    case 'etape':
      return { type: 'etape', dossier: texte(c.dossier, 'Identifiant du dossier'), cle: parmi(c.cle, CASES, 'Case du parcours') };
    case 'reunion':
      return { type: 'reunion', id: texte(c.id, 'Identifiant de la réunion') };
    case 'amendement':
      return { type: 'amendement', id: texte(c.id, "Identifiant de l'amendement") };
    case 'personne': {
      const dossier = texteFacultatif(c.dossier, 'Identifiant du dossier');
      return { type: 'personne', id: texte(c.id, 'Identifiant de la personne'), ...(dossier ? { dossier } : {}) };
    }
    default:
      throw new RequeteInvalide(`Cible inconnue : ${String(c.type)}`);
  }
}

export function lecturesDiscussions({ depots, synthetiseur }: LecturesDeps): Pick<Handlers, 'ListerInterventions'> {
  const r = remplirPar(synthetiseur);
  return {
    ListerInterventions: async (demande) => {
      const cible = cibleValide(demande.cible);
      const trouvees = trouve(await depots.discussions.interventions(cible, borner(demande)), 'Cible des interventions');
      return REMPLIR.ListerInterventions(r, { cible, libelle: trouvees.libelle, interventions: trouvees.interventions });
    },
  };
}
