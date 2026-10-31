// Handlers du dossier législatif : Accueil, Dossiers, Dossier, Étape, Article, Amendement.
// Chacun assemble les morceaux rendus par les dépôts (DossiersRepository surtout, plus les votes,
// les discussions et les intérêts), puis remplit les synthèses (REMPLIR).

import type { Chambre, DemandeAccueil, EtatDossier, Origine, SortAmendement } from '@contrat/domain/model';

import type { FiltreAccueil } from '../ports';

import {
  cleEtape,
  type Handlers,
  type LecturesDeps,
  Introuvable,
  RequeteInvalide,
  TAILLE_MAX,
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
  fusionne: 'Fusionnés',
  irrecevable: 'Irrecevables',
  rapport_publie: 'Rapports publiés',
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

/** Dossiers de chaque liste du jour (décidés, qui avancent) au plus. */
export const LIMITE_DU_JOUR = 20;
/** Semaines couvertes par le calendrier de l'Accueil, avant et après celle du jour choisi. */
export const SEMAINES_AUTOUR = 3;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Jour facultatif « AAAA-MM-JJ », date réelle (400 sinon). */
export function jourFacultatif(valeur: unknown): string | undefined {
  if (valeur === undefined || valeur === null) return undefined;
  const t = typeof valeur === 'string' && JOUR.test(valeur) ? Date.parse(`${valeur}T00:00:00Z`) : NaN;
  // 2026-02-30 : rejeté (Date.parse le rendrait au 2 mars, ou NaN selon le moteur).
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== valeur) {
    throw new RequeteInvalide('Jour : date « AAAA-MM-JJ » attendue');
  }
  return valeur;
}

/** Fenêtre du calendrier : du lundi trois semaines avant celle du jour au dimanche trois semaines après. */
export function fenetreDe(jour: string): { debut: string; fin: string } {
  const { debut, fin } = semaineDe(jour);
  const decaler = (j: string, n: number) => {
    const d = new Date(`${j}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return { debut: decaler(debut, -7 * SEMAINES_AUTOUR), fin: decaler(fin, 7 * SEMAINES_AUTOUR) };
}

/** Semaine (lundi → dimanche) qui contient le jour donné (« AAAA-MM-JJ »). */
export function semaineDe(jour: string): { debut: string; fin: string } {
  const d = new Date(`${jour}T00:00:00Z`);
  const lundi = new Date(d);
  lundi.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  return { debut: lundi.toISOString().slice(0, 10), fin: dimanche.toISOString().slice(0, 10) };
}

const CHAMBRES: Record<Chambre, true> = { AN: true, SENAT: true };
/** Dossiers suivis acceptés dans le filtre de l'Accueil, au plus (comme Mes suivis). */
export const MAX_DOSSIERS_FILTRE = 50;

/**
 * Filtres de l'Accueil vérifiés : chambres du vocabulaire (sans doublon), identifiants de dossiers
 * (texte, 50 au plus) ; absents : null (pas de filtre). 400 sinon.
 */
export function filtreAccueil(demande: DemandeAccueil | undefined): FiltreAccueil {
  const liste = (valeur: unknown, nom: string): unknown[] | null => {
    if (valeur === undefined || valeur === null) return null;
    if (!Array.isArray(valeur)) throw new RequeteInvalide(`${nom} : liste attendue`);
    return valeur;
  };
  const chambres = liste(demande?.chambres, 'Chambres');
  const ids = liste(demande?.dossiers, 'Dossiers');
  if (ids && ids.length > MAX_DOSSIERS_FILTRE) throw new RequeteInvalide(`Dossiers : ${MAX_DOSSIERS_FILTRE} au plus`);
  return {
    chambres: chambres && [...new Set(chambres.map((c) => parmi(c, CHAMBRES, 'Chambre')))],
    dossiers: ids && [...new Set(ids.map((id) => texte(id, 'Identifiant du dossier')))],
  };
}

type HandlersDossiers = Pick<
  Handlers,
  'ConsulterAccueil' | 'ListerDossiers' | 'ConsulterDossier' | 'ConsulterEtape' | 'ConsulterArticle' | 'ConsulterAmendement'
>;

export function lecturesDossiers({ depots, synthetiseur, horloge }: LecturesDeps): HandlersDossiers {
  const r = remplirPar(synthetiseur);
  const { dossiers, scrutins, discussions, transparence } = depots;

  return {
    ConsulterAccueil: async (demande) => {
      const aujourdhui = horloge.aujourdhui();
      const jour = jourFacultatif(demande?.jour) ?? aujourdhui;
      const filtre = filtreAccueil(demande);
      const filtreActif = filtre.chambres || filtre.dossiers ? filtre : undefined;
      const { debut, fin } = semaineDe(jour);
      const fenetre = fenetreDe(jour);
      const [aSuivre, votes, duJour, votesDuJour, reunions, actes, scrutes] = await Promise.all([
        dossiers.aSuivre(LIMITE_A_SUIVRE),
        scrutins.entre(debut, fin, LIMITE_VOTES_SEMAINE),
        dossiers.duJour(jour, LIMITE_DU_JOUR, filtreActif),
        // Filtrés ici (chambre, dossier cité) : tous ceux du jour d'abord, puis la borne.
        scrutins.entre(jour, jour, filtreActif ? TAILLE_MAX : LIMITE_VOTES_SEMAINE),
        dossiers.reunionsDuJour(jour, filtreActif),
        dossiers.joursActifs(fenetre.debut, fenetre.fin, filtreActif),
        scrutins.jours(fenetre.debut, fenetre.fin, filtreActif),
      ]);
      const votesGardes = votesDuJour
        .filter(
          (v) =>
            (!filtre.chambres || filtre.chambres.includes(v.chambre)) &&
            (!filtre.dossiers || (!!v.dossier && filtre.dossiers.includes(v.dossier.id))),
        )
        .slice(0, LIMITE_VOTES_SEMAINE);
      return REMPLIR.ConsulterAccueil(r, {
        semaine: { debut, fin },
        dossiers: aSuivre,
        votes,
        jour: { date: jour, ...duJour, votes: votesGardes, reunions },
        calendrier: { aujourdhui, fenetre, jours: [...new Set([...actes, ...scrutes])].sort() },
      });
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
        amendements: {
          parEtape: amendements.parEtape,
          ...(amendements.parSort ? { parSort: amendements.parSort } : {}),
          filtre,
          liste: amendements.liste,
        },
        scrutins: votes,
        acteurs,
        interets,
        chiffres,
        sources,
      });
    },

    ConsulterEtape: async ({ dossier, cle }) => {
      texte(dossier, 'Identifiant du dossier');
      cleEtape(cle, 'Case du parcours');
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
