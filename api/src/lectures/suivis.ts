// Handler de « Mes suivis » : l'app envoie les identifiants qu'elle garde sur l'appareil et une
// date ; le cœur rassemble les actes du parcours des dossiers suivis (DossiersRepository) et les
// votes des personnes suivies à l'inverse de leur groupe (ScrutinsRepository), sans rien garder.

import type { DemandeSuivis, EvenementSuivi, Suivis } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, RequeteInvalide, remplirPar } from './commun';
import { REMPLIR } from './syntheses';

/** Identifiants suivis acceptés par liste, événements rendus au plus. */
export const MAX_SUIVIS = 50;
export const LIMITE_EVENEMENTS = 50;

export const LIMITES_SUIVIS = [
  'Seuls les actes publiés du parcours et les votes en scrutin public à l’inverse du groupe sont suivis.',
  'Vos suivis restent sur votre appareil : nous ne savons pas qui suit quoi.',
];

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function identifiants(valeur: unknown, nom: string): string[] {
  if (!Array.isArray(valeur) || valeur.some((v) => typeof v !== 'string' || !v.trim() || v.length > 200)) {
    throw new RequeteInvalide(`${nom} : liste d'identifiants attendue`);
  }
  if (valeur.length > MAX_SUIVIS) throw new RequeteInvalide(`${nom} : ${MAX_SUIVIS} au plus`);
  return [...new Set(valeur as string[])];
}

/** Jour valide, ni dans le futur ni plus d'un an avant aujourd'hui. */
function depuisValide(valeur: unknown, aujourdhui: string): string {
  if (typeof valeur !== 'string' || !JOUR.test(valeur) || Number.isNaN(Date.parse(`${valeur}T00:00:00Z`))) {
    throw new RequeteInvalide('Depuis : date « AAAA-MM-JJ » attendue');
  }
  const limite = new Date(`${aujourdhui}T00:00:00Z`);
  limite.setUTCFullYear(limite.getUTCFullYear() - 1);
  if (valeur > aujourdhui || valeur < limite.toISOString().slice(0, 10)) throw new RequeteInvalide('Depuis : au plus un an avant aujourd’hui');
  return valeur;
}

export function lecturesSuivis({ depots, synthetiseur, horloge }: LecturesDeps): Pick<Handlers, 'ConsulterSuivis'> {
  const r = remplirPar(synthetiseur);
  const { dossiers, personnes, scrutins } = depots;

  return {
    ConsulterSuivis: async (demande: DemandeSuivis) => {
      const idsDossiers = identifiants(demande.dossiers, 'Dossiers');
      const idsPersonnes = identifiants(demande.personnes, 'Personnes');
      const depuis = depuisValide(demande.depuis, horloge.aujourdhui());

      const [resumes, entetes] = await Promise.all([
        idsDossiers.length ? dossiers.resumesDe(idsDossiers) : Promise.resolve([]),
        Promise.all(idsPersonnes.map((id) => personnes.entete(id))),
      ]);
      const connus = entetes.flatMap((e) => (e ? [e] : []));
      const [actes, ecarts] = await Promise.all([
        resumes.length ? dossiers.actesDepuis(resumes.map((d) => d.id), depuis, LIMITE_EVENEMENTS) : Promise.resolve([]),
        Promise.all(
          connus.map(async (p) =>
            (await scrutins.derniersEcarts(p.id, LIMITE_EVENEMENTS))
              .filter((s) => s.date >= depuis)
              .map((scrutin): EvenementSuivi => ({ type: 'ecart', date: scrutin.date, personne: { id: p.id, nom: p.nom }, scrutin })),
          ),
        ),
      ]);
      // Du plus récent au plus ancien ; à date égale, les actes avant les votes (ordre stable).
      const evenements = [...actes, ...ecarts.flat()]
        .map((e, i) => ({ e, i }))
        .sort((a, b) => b.e.date.localeCompare(a.e.date) || a.i - b.i)
        .slice(0, LIMITE_EVENEMENTS)
        .map(({ e }) => e);

      const trouves = new Set([...resumes.map((d) => d.id), ...connus.map((p) => p.id)]);
      const sortie: Suivis = {
        demande,
        evenements,
        dossiers: resumes,
        personnes: connus,
        inconnus: [...idsDossiers, ...idsPersonnes].filter((id) => !trouves.has(id)),
        limites: LIMITES_SUIVIS,
      };
      return REMPLIR.ConsulterSuivis(r, sortie);
    },
  };
}
