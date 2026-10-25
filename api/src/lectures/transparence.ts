// Handler de la transparence : fiche d'un représentant d'intérêts (répertoire AGORA), ses actions
// déclarées et leurs rapprochements avec le parcours législatif, chacun avec son statut.

import { type Handlers, type LecturesDeps, borner, texte, trouve } from './commun';

export function lecturesTransparence({ depots }: LecturesDeps): Pick<Handlers, 'ConsulterRepresentant'> {
  const { transparence } = depots;
  return {
    ConsulterRepresentant: async (demande) => {
      const id = texte(demande.id, 'Identifiant du représentant');
      const [fiche, rapprochements] = await Promise.all([
        transparence.representant(id, borner(demande)),
        transparence.interetsDe({ type: 'representant', id }),
      ]);
      return { ...trouve(fiche, "Représentant d'intérêts"), rapprochements };
    },
  };
}
