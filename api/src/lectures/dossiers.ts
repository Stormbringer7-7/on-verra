// Handlers du dossier législatif : Accueil, Dossiers, Dossier, Étape, Article, Amendement.
// Chacun assemble les morceaux rendus par les dépôts (DossiersRepository surtout, plus les votes,
// les discussions et les intérêts), puis remplit les synthèses (REMPLIR).

import type { EtatDossier, Origine, SortAmendement } from '@contrat/domain/model';

import {
  CASES,
  type Handlers,
  type LecturesDeps,
  Introuvable,
  RequeteInvalide,
  barreObligatoire,
  borner,
  parmi,
  parmiFacultatif,
  remplirPar,
  texte,
  texteFacultatif,
  trouve,
} from './commun';
import { REMPLIR } from './syntheses';

/** Dossiers à suivre de l'Accueil, scrutins de la semaine affichés au plus. */
export const LIMITE_A_SUIVRE = 6;
export const LIMITE_VOTES_SEMAINE = 12;
/** « Qui intervient » sur une étape, extraits sous un amendement. */
export const LIMITE_INTERVENANTS = 5;
export const LIMITE_EXTRAITS = 5;
/** Seule législature chargée (G6). */
export const LEGISLATURE = '17';

export const ETATS: Record<EtatDossier, string> = {
  en_cours: 'En cours',
  adopte: 'Adoptés',
  promulgue: 'Promulgués',
  rejete: 'Rejetés',
  retire: 'Retirés',
  caduc: 'Caducs',
};
export const ORIGINES: Record<Origine, string> = { gouvernement: 'Gouvernement', parlementaire: 'Parlementaires' };
const SORTS: Record<SortAmendement, true> = {
  adopte: true,
  rejete: true,
  retire: true,
  tombe: true,
  non_soutenu: true,
  irrecevable: true,
  en_attente: true,
};

/** Semaine (lundi → dimanche) qui contient le jour donné (« AAAA-MM-JJ »). */
export function semaineDe(jour: string): { debut: string; fin: string } {
  const d = new Date(`${jour}T00:00:00Z`);
  const lundi = new Date(d);
  lundi.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  return { debut: lundi.toISOString().slice(0, 10), fin: dimanche.toISOString().slice(0, 10) };
}

type HandlersDossiers = Pick<
  Handlers,
  'ConsulterAccueil' | 'ListerDossiers' | 'ConsulterDossier' | 'ConsulterEtape' | 'ConsulterArticle' | 'ConsulterAmendement'
>;

export function lecturesDossiers({ depots, synthetiseur, horloge }: LecturesDeps): HandlersDossiers {
  const r = remplirPar(synthetiseur);
  const { dossiers, scrutins, discussions, transparence } = depots;

  return {
    ConsulterAccueil: async () => {
      const { debut, fin } = semaineDe(horloge.aujourdhui());
      const [aSuivre, votes] = await Promise.all([
        dossiers.aSuivre(LIMITE_A_SUIVRE),
        scrutins.entre(debut, fin, LIMITE_VOTES_SEMAINE),
      ]);
      return REMPLIR.ConsulterAccueil(r, { semaine: { debut, fin }, dossiers: aSuivre, votes });
    },

    ListerDossiers: async (filtre) => {
      parmiFacultatif(filtre.etat, ETATS, 'État');
      parmiFacultatif(filtre.origine, ORIGINES, 'Origine');
      texteFacultatif(filtre.theme, 'Thème');
      const legislature = texteFacultatif(filtre.legislature, 'Législature', 4) ?? LEGISLATURE;
      const { facettes, dossiers: page } = await dossiers.lister(filtre, borner(filtre));
      return REMPLIR.ListerDossiers(r, { legislature, filtre, facettes, dossiers: page });
    },

    ConsulterDossier: async ({ id, amendements: demande }) => {
      texte(id, 'Identifiant du dossier');
      const sort = parmiFacultatif(demande?.sort, SORTS, 'Sort');
      const filtre = sort ? { sort } : {};
      const entete = trouve(await dossiers.entete(id), 'Dossier');
      const [parcours, ceQuiAChange, etapes, articles, amendements, votes, acteurs, interets, chiffres, sources] = await Promise.all([
        dossiers.parcours(id),
        dossiers.ceQuiAChange(id),
        dossiers.etapes(id),
        dossiers.articles(id),
        dossiers.amendements(id, filtre, borner(demande)),
        scrutins.duDossier(id),
        dossiers.acteurs(id),
        transparence.interetsDe({ type: 'dossier', id }),
        dossiers.chiffres(id),
        dossiers.sources(id),
      ]);
      return REMPLIR.ConsulterDossier(r, {
        entete,
        parcours,
        ceQuiAChange,
        etapes,
        versionsDuTexte: articles.versionsDuTexte,
        articles: articles.articles,
        amendements: { parEtape: amendements.parEtape, filtre, liste: amendements.liste },
        scrutins: votes,
        acteurs,
        interets,
        chiffres,
        sources,
      });
    },

    ConsulterEtape: async ({ dossier, cle }) => {
      texte(dossier, 'Identifiant du dossier');
      parmi(cle, CASES, 'Case du parcours');
      const etape = trouve(await dossiers.etape(dossier, cle), 'Étape');
      const [barre, votes, quiIntervient] = await Promise.all([
        barreObligatoire(depots, dossier, cle),
        scrutins.duDossier(dossier, cle),
        discussions.intervenants(dossier, cle, LIMITE_INTERVENANTS),
      ]);
      return REMPLIR.ConsulterEtape(r, { ...etape, barre, votes, quiIntervient });
    },

    ConsulterArticle: async ({ article: id, version, comparaison = 'precedente' }) => {
      texte(id, "Identifiant de l'article");
      texteFacultatif(version, 'Version');
      if (comparaison !== 'precedente' && comparaison !== 'depose') throw new RequeteInvalide(`Comparaison inconnue : ${String(comparaison)}`);
      const { dossier, ...article } = trouve(await dossiers.article(id, version ?? null, comparaison), 'Article');
      const ici = article.versions.find((v) => v.id === article.affichee.version)?.etape?.cle ?? null;
      const barre = await barreObligatoire(depots, dossier, ici);
      return REMPLIR.ConsulterArticle(r, { ...article, barre });
    },

    ConsulterAmendement: async ({ id }) => {
      texte(id, "Identifiant de l'amendement");
      const { dossier, ...amendement } = trouve(await dossiers.amendement(id), 'Amendement');
      // Le contrat exige une barre : un amendement que la source ne relie à aucun dossier n'a pas
      // d'écran (cas signalé au lot contrat : FicheAmendement.barre devrait pouvoir être null).
      if (dossier === null) throw new Introuvable("Dossier de l'amendement introuvable");
      const [barre, extraits, scrutin, interets] = await Promise.all([
        barreObligatoire(depots, dossier, amendement.amendement.etape?.cle ?? null),
        discussions.surAmendement(id, LIMITE_EXTRAITS),
        scrutins.surAmendement(id),
        transparence.interetsDe({ type: 'amendement', id }),
      ]);
      return REMPLIR.ConsulterAmendement(r, {
        ...amendement,
        barre,
        vote: scrutin ? { type: 'scrutin_public', scrutin } : amendement.vote,
        discussions: extraits,
        interets,
      });
    },
  };
}
