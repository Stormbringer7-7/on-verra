// Handlers des scrutins publics : fiche du scrutin (AN et Sénat) et « Pourquoi ce vote ». Rien
// n'y relie deux faits par une causalité : on juxtapose ce qui est public et sourcé autour du vote.

import type { EntetePersonne, PersonneRef } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, barreDe, remplirPar, texte, trouve } from './commun';
import { REMPLIR } from './syntheses';

/** Interventions de la personne avant le vote, au plus. */
export const LIMITE_AVANT_LE_VOTE = 5;

/**
 * La personne dans le contexte du vote : son nom, ses fonctions en cours telles que publiées et
 * son groupe le jour du vote (sinon son groupe actuel).
 */
function personneDuVote(entete: EntetePersonne, groupeDuVote: PersonneRef['groupe']): PersonneRef {
  const fonctions = entete.enCours.filter((f) => f.groupe === null).map((f) => f.libelle);
  const groupe = groupeDuVote ?? entete.enCours.find((f) => f.groupe)?.groupe ?? null;
  return {
    id: entete.id,
    nom: entete.nom,
    fonction: [...fonctions.slice(0, 1), ...(groupe ? [groupe.libelle] : [])].join(' · ') || null,
    groupe,
  };
}

export function lecturesScrutins({ depots, synthetiseur }: LecturesDeps): Pick<Handlers, 'ConsulterScrutin' | 'ExpliquerVote'> {
  const r = remplirPar(synthetiseur);
  const { scrutins, discussions, personnes, transparence } = depots;

  return {
    ConsulterScrutin: async ({ id }) => {
      texte(id, 'Identifiant du scrutin');
      const fiche = trouve(await scrutins.fiche(id), 'Scrutin');
      const dossier = fiche.scrutin.dossier?.id;
      const barre = dossier ? await barreDe(depots, dossier, fiche.scrutin.etape?.cle ?? null) : null;
      return REMPLIR.ConsulterScrutin(r, { ...fiche, barre });
    },

    ExpliquerVote: async ({ scrutin: idScrutin, personne: idPersonne }) => {
      texte(idScrutin, 'Identifiant du scrutin');
      texte(idPersonne, 'Identifiant de la personne');
      const [fiche, vote, entete] = await Promise.all([
        scrutins.fiche(idScrutin),
        scrutins.vote(idScrutin, idPersonne),
        personnes.entete(idPersonne),
      ]);
      const { scrutin } = trouve(fiche, 'Scrutin');
      const { vote: individuel, groupe } = trouve(vote, 'Vote de cette personne sur ce scrutin');
      const dossier = scrutin.dossier?.id ?? null;
      const [barre, interventionsAvant, actes, parcours, declarations, lobbying] = await Promise.all([
        dossier ? barreDe(depots, dossier, scrutin.etape?.cle ?? null) : null,
        discussions.avantLeVote(idScrutin, idPersonne, LIMITE_AVANT_LE_VOTE),
        dossier ? personnes.actesSurLeDossier(idPersonne, dossier) : [],
        personnes.fonctions(idPersonne),
        transparence.declarationsResumees(idPersonne),
        transparence.interetsDe({ type: 'vote', scrutin: idScrutin, personne: idPersonne }),
      ]);
      return REMPLIR.ExpliquerVote(r, {
        barre,
        scrutin,
        personne: personneDuVote(trouve(entete, 'Personne'), groupe?.groupe ?? null),
        vote: individuel,
        groupe,
        interventionsAvant,
        actes,
        // Aucun thème attribué aux dossiers (vocabulaire contrôlé à venir) : rien n'est classé.
        surLeTheme: null,
        parcours,
        declarations: { declarations, auTheme: null },
        lobbying,
      });
    },
  };
}
