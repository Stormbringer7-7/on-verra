// Où sont les synthèses « en clair » dans chaque sortie du contrat, et de quoi chacune parle
// (`SujetSynthese`). Les dépôts rendent toujours null (G4) ; les handlers passent leur sortie
// assemblée dans `REMPLIR[commande]`, qui demande chaque champ `Synthese` au `Synthetiseur`.
//
// Le même parcours sert l'adaptateur mémoire : appliqué aux fixtures du contrat avec un `Remplir`
// qui note le texte et rend null, il en tire à la fois les données des dépôts (sans synthèse) et
// le synthétiseur de maquette (sujet → texte). Un seul endroit décrit donc les synthèses.
//
// Sujets dont le contrat ne fixe pas la clé (`changement_article.version`) :
//   - « Ce qui a changé depuis le dépôt » : version DEPUIS_LE_DEPOT ;
//   - changement d'un article pendant une étape : version = clé de la case (`commission_1_o`) ;
//   - « Pourquoi ce changement » de l'écran Article : identifiant de la version affichée, suffixé
//     de `/depose` quand elle est comparée au texte déposé.

import type { OutputOf } from '@contrat/commands/bus';
import type * as definitions from '@contrat/commands/definitions';
import type {
  AmendementResume,
  DossierResume,
  Intervention,
  OrigineModification,
  ScrutinResume,
  Synthese,
} from '@contrat/domain/model';

import type { SujetSynthese } from '../ports';

/** Donne la synthèse d'un sujet ; `actuelle` : la valeur déjà présente (null venant d'un dépôt). */
export type Remplir = (sujet: SujetSynthese, actuelle: Synthese) => Promise<Synthese>;

export const DEPUIS_LE_DEPOT = 'depuis_le_depot';

type Definitions = typeof definitions;
type Remplisseurs = { [K in keyof Definitions]: (r: Remplir, sortie: OutputOf<Definitions[K]>) => Promise<OutputOf<Definitions[K]>> };

const chacun = <T>(liste: T[], f: (x: T) => Promise<T>) => Promise.all(liste.map(f));
const tel = async <T>(_r: Remplir, sortie: T) => sortie;

// ---------- Morceaux partagés ----------

export const dossierResume = async (r: Remplir, d: DossierResume): Promise<DossierResume> => ({
  ...d,
  titreEnClair: await r({ type: 'titre_dossier', dossier: d.id }, d.titreEnClair),
});

export const amendementResume = async (r: Remplir, a: AmendementResume): Promise<AmendementResume> => ({
  ...a,
  objet: await r({ type: 'objet_amendement', amendement: a.id }, a.objet),
});

export const scrutinResume = async (r: Remplir, s: ScrutinResume): Promise<ScrutinResume> => ({
  ...s,
  enClair: await r({ type: 'scrutin', scrutin: s.id }, s.enClair),
});

export const intervention = async (r: Remplir, i: Intervention): Promise<Intervention> => ({
  ...i,
  synthese: await r({ type: 'intervention', intervention: i.id }, i.synthese),
});

/** L'amendement d'origine porte son objet en clair, qu'il soit vérifié ou seulement candidat. */
async function origine(r: Remplir, o: OrigineModification): Promise<OrigineModification> {
  if (o.type !== 'amendement') return o;
  const lien = o.amendement;
  return {
    ...o,
    amendement:
      lien.statut === 'verifie'
        ? { ...lien, cible: await amendementResume(r, lien.cible) }
        : { ...lien, candidat: await amendementResume(r, lien.candidat) },
  };
}

// ---------- Par commande ----------

export const REMPLIR: Remplisseurs = {
  ConsulterAccueil: async (r, a) => ({
    ...a,
    dossiers: await chacun(a.dossiers, (d) => dossierResume(r, d)),
    votes: await chacun(a.votes, (s) => scrutinResume(r, s)),
  }),

  ListerDossiers: async (r, l) => ({
    ...l,
    dossiers: { ...l.dossiers, elements: await chacun(l.dossiers.elements, (d) => dossierResume(r, d)) },
  }),

  ConsulterDossier: async (r, f) => {
    const dossier = f.entete.id;
    return {
      ...f,
      entete: {
        ...f.entete,
        titreEnClair: await r({ type: 'titre_dossier', dossier }, f.entete.titreEnClair),
        resumeEnClair: await r({ type: 'resume_dossier', dossier }, f.entete.resumeEnClair),
      },
      ceQuiAChange: await chacun(f.ceQuiAChange, async (c) => ({
        ...c,
        resume: await r({ type: 'changement_article', article: c.article.id, version: DEPUIS_LE_DEPOT }, c.resume),
      })),
      etapes: await chacun(f.etapes, async (e) => ({
        ...e,
        resume: await r({ type: 'resume_etape', dossier, cle: e.cle }, e.resume),
      })),
      amendements: {
        ...f.amendements,
        liste: { ...f.amendements.liste, elements: await chacun(f.amendements.liste.elements, (a) => amendementResume(r, a)) },
      },
      scrutins: await chacun(f.scrutins, (s) => scrutinResume(r, s)),
    };
  },

  ConsulterEtape: async (r, e) => {
    const dossier = e.barre.dossier.id;
    const cle = e.case.cle;
    return {
      ...e,
      resume: await r({ type: 'resume_etape', dossier, cle }, e.resume),
      changements: await chacun(e.changements, async (c) => ({
        ...c,
        origine: await origine(r, c.origine),
        resume: await r({ type: 'changement_article', article: c.article.id, version: cle }, c.resume),
      })),
      votes: await chacun(e.votes, (s) => scrutinResume(r, s)),
    };
  },

  ListerInterventions: async (r, l) => ({
    ...l,
    interventions: { ...l.interventions, elements: await chacun(l.interventions.elements, (i) => intervention(r, i)) },
  }),

  ConsulterArticle: async (r, a) => {
    const { version, comparaison } = a.affichee;
    const cle = comparaison === 'depose' ? `${version}/depose` : version;
    return {
      ...a,
      affichee: {
        ...a.affichee,
        origine: a.affichee.origine && (await origine(r, a.affichee.origine)),
        pourquoi: {
          ...a.affichee.pourquoi,
          synthese: await r({ type: 'changement_article', article: a.article.id, version: cle }, a.affichee.pourquoi.synthese),
        },
      },
    };
  },

  ConsulterAmendement: async (r, a) => ({
    ...a,
    amendement: await amendementResume(r, a.amendement),
    exposeEnClair: await r({ type: 'expose_amendement', amendement: a.amendement.id }, a.exposeEnClair),
    vote: a.vote.type === 'scrutin_public' ? { ...a.vote, scrutin: await scrutinResume(r, a.vote.scrutin) } : a.vote,
  }),

  ConsulterScrutin: async (r, f) => {
    const scrutin = f.scrutin.id;
    return {
      ...f,
      scrutin: await scrutinResume(r, f.scrutin),
      sens: {
        pour: await r({ type: 'sens_du_vote', scrutin, position: 'pour' }, f.sens.pour),
        contre: await r({ type: 'sens_du_vote', scrutin, position: 'contre' }, f.sens.contre),
      },
    };
  },

  ExpliquerVote: async (r, e) => {
    const personne = e.personne.id;
    const theme = e.surLeTheme?.theme ?? null;
    return {
      ...e,
      scrutin: await scrutinResume(r, e.scrutin),
      surLeTheme: e.surLeTheme && {
        ...e.surLeTheme,
        synthese: await r({ type: 'choix_theme', personne, theme: e.surLeTheme.theme }, e.surLeTheme.synthese),
      },
      declarations: {
        ...e.declarations,
        // Sans thème, rien à ramener au thème : pas de synthèse demandée.
        auTheme: theme === null ? null : await r({ type: 'declarations_au_theme', personne, theme }, e.declarations.auTheme),
      },
    };
  },

  ListerPersonnes: tel,
  ClasserPersonnes: tel,

  ConsulterPersonne: async (r, f) => {
    if (f.contenu.onglet !== 'choix') return f;
    const personne = f.entete.id;
    const c = f.contenu;
    return {
      ...f,
      contenu: {
        ...c,
        themes: await chacun(c.themes, async (t) => ({
          ...t,
          synthese: await r({ type: 'choix_theme', personne, theme: t.theme }, t.synthese),
          dernierEcart: t.dernierEcart && (await scrutinResume(r, t.dernierEcart)),
        })),
        derniersEcarts: await chacun(c.derniersEcarts, (s) => scrutinResume(r, s)),
      },
    };
  },

  ConsulterInstitution: async (r, i) =>
    i.type !== 'gouvernement'
      ? i
      : { ...i, textesDeposes: { ...i.textesDeposes, dossiers: await chacun(i.textesDeposes.dossiers, (d) => dossierResume(r, d)) } },

  ConsulterRepresentant: tel,
  Rechercher: tel,
  SignalerErreur: tel,
};
