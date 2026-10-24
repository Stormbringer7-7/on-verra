// Handlers des personnes : annuaire, classements, fiche personne (en-tête et un onglet).

import type {
  Chambre,
  ContenuOngletPersonne,
  CritereClassement,
  OngletPersonne,
  RolePersonne,
} from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, borner, limiter, parmi, parmiFacultatif, remplirPar, texte, texteFacultatif, trouve } from './commun';
import { REMPLIR } from './syntheses';

/** Lignes d'un classement par défaut ; derniers écarts au groupe montrés sur « Ses choix ». */
export const LIMITE_CLASSEMENT = 20;
export const LIMITE_DERNIERS_ECARTS = 5;

const ROLES: Record<RolePersonne, true> = { depute: true, senateur: true, gouvernement: true, elu_local: true };
const CHAMBRES: Record<Chambre, true> = { AN: true, SENAT: true };
const CRITERES: Record<CritereClassement, true> = { ecarts: true, absences: true, positions: true };
const ORDRES: Record<'asc' | 'desc', true> = { asc: true, desc: true };
const ONGLETS: Record<OngletPersonne, true> = { parcours: true, choix: true, dossiers: true, declarations: true };

export function lecturesPersonnes({
  depots,
  synthetiseur,
}: LecturesDeps): Pick<Handlers, 'ListerPersonnes' | 'ClasserPersonnes' | 'ConsulterPersonne'> {
  const r = remplirPar(synthetiseur);
  const { personnes, scrutins, transparence } = depots;

  /** Contenu de l'onglet demandé, et de lui seul. */
  async function onglet(id: string, choisi: OngletPersonne, identite: 'personne' | 'fiche_rne'): Promise<ContenuOngletPersonne> {
    switch (choisi) {
      case 'parcours': {
        const fonctions = await personnes.fonctions(id);
        return {
          onglet: 'parcours',
          fonctions,
          // Une fiche RNE seule est elle-même le mandat : pas de liste à part.
          mandatsLocauxEnCours: identite === 'fiche_rne' ? [] : fonctions.filter((f) => f.type === 'mandat_local' && f.fin === null),
        };
      }
      case 'choix': {
        const [choix, derniersEcarts] = await Promise.all([personnes.choix(id), scrutins.derniersEcarts(id, LIMITE_DERNIERS_ECARTS)]);
        return { onglet: 'choix', ...choix, derniersEcarts };
      }
      case 'dossiers': {
        const [roles, questions] = await Promise.all([personnes.roles(id), personnes.questions(id, borner(undefined))]);
        return { onglet: 'dossiers', roles, questions };
      }
      case 'declarations':
        return { onglet: 'declarations', declarations: await transparence.declarations(id) };
    }
  }

  return {
    ListerPersonnes: async (filtre) => {
      parmiFacultatif(filtre.role, ROLES, 'Rôle');
      texteFacultatif(filtre.q, 'Recherche');
      const annuaire = await personnes.annuaire(filtre, borner(filtre));
      return { filtre, ...annuaire };
    },

    ClasserPersonnes: async (demande) => {
      parmi(demande.chambre, CHAMBRES, 'Chambre');
      parmi(demande.critere, CRITERES, 'Critère');
      parmi(demande.ordre, ORDRES, 'Ordre');
      const themes = Array.isArray(demande.themes) ? demande.themes.filter((t): t is string => typeof t === 'string').slice(0, 20) : undefined;
      const classement = await personnes.classement({
        chambre: demande.chambre,
        critere: demande.critere,
        ordre: demande.ordre,
        ...(themes ? { themes } : {}),
        limite: limiter(demande.limite, LIMITE_CLASSEMENT),
      });
      return { demande, ...classement };
    },

    ConsulterPersonne: async ({ id, onglet: choisi = 'parcours' }) => {
      texte(id, 'Identifiant de la personne');
      parmi(choisi, ONGLETS, 'Onglet');
      const entete = trouve(await personnes.entete(id), 'Personne');
      const contenu = await onglet(id, choisi, entete.identite);
      return REMPLIR.ConsulterPersonne(r, { entete, contenu });
    },
  };
}
