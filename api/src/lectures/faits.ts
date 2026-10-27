// Handler de l'Explorer (faits filtrés) : valide la demande, puis exécute les règles partagées
// (`@contrat/domain/explorer` : onglet et regroupement par défaut, focal, suggestions,
// élargissements, comparaison) sur le dépôt des faits, et remplit les synthèses.

import { CLES_FILTRES, FiltreInconnu, REGROUPEMENTS, TYPES_FAITS, explorerAsync, type Lecture, type ReponseLecture } from '@contrat/domain/explorer';
import type { CleFiltre, DemandeFaits, FiltresFaits, Regroupement, TypeFait } from '@contrat/domain/model';

import type { FaitsRepository } from '../ports';
import {
  cleEtapeFacultative,
  type Handlers,
  Introuvable,
  type LecturesDeps,
  RequeteInvalide,
  borner,
  parmi,
  parmiFacultatif,
  remplirPar,
  texteFacultatif,
} from './commun';
import { REMPLIR } from './syntheses';

const vocabulaire = <T extends string>(liste: readonly T[]) => Object.fromEntries(liste.map((v) => [v, true])) as Record<T, true>;
const ONGLETS = vocabulaire(TYPES_FAITS);
const CLES = vocabulaire(CLES_FILTRES);
const REGROUPEMENTS_TOUS = vocabulaire([...new Set(Object.values(REGROUPEMENTS).flat())] as Regroupement[]);
const CHAMBRES = { AN: true, SENAT: true } as const;
/** Code INSEE d'un département (« 33 », « 2A », « 974 »). */
const DEPARTEMENT = /^(\d{2}|2[AB]|\d{3})$/;

/** Les filtres reçus, vérifiés : identifiants (texte), case, chambre, code de département. */
function filtresValides(f: unknown): FiltresFaits {
  if (f === undefined || f === null) return {};
  if (typeof f !== 'object' || Array.isArray(f)) throw new RequeteInvalide('Filtres attendus');
  const brut = f as Record<string, unknown>;
  for (const cle of Object.keys(brut)) parmi(cle, CLES, 'Filtre');
  const filtres: FiltresFaits = {};
  for (const cle of ['dossier', 'article', 'groupe', 'personne', 'organe', 'scrutin', 'amendement'] as const) {
    const v = texteFacultatif(brut[cle], `Filtre ${cle}`);
    if (v !== undefined) filtres[cle] = v;
  }
  const etape = cleEtapeFacultative(brut.etape, 'Étape');
  if (etape) {
    if (!filtres.dossier) throw new RequeteInvalide('Le filtre étape demande un dossier');
    filtres.etape = etape;
  }
  const chambre = parmiFacultatif(brut.chambre, CHAMBRES, 'Chambre');
  if (chambre) filtres.chambre = chambre;
  const departement = texteFacultatif(brut.departement, 'Département', 3);
  if (departement !== undefined) {
    if (!DEPARTEMENT.test(departement)) throw new RequeteInvalide(`Département inconnu : ${departement}`);
    filtres.departement = departement;
  }
  return filtres;
}

function demandeValide(d: DemandeFaits): DemandeFaits {
  const filtres = filtresValides(d.filtres);
  if (d.ordre !== undefined && !Array.isArray(d.ordre)) throw new RequeteInvalide('Ordre des filtres attendu');
  const ordre = d.ordre?.map((c) => parmi(c, CLES, 'Filtre')) as CleFiltre[] | undefined;
  const onglet = parmiFacultatif(d.onglet, ONGLETS, 'Onglet');
  const regrouper = parmiFacultatif(d.regrouper, REGROUPEMENTS_TOUS, 'Regroupement');
  if (regrouper !== undefined) {
    if (!onglet) throw new RequeteInvalide('Le regroupement demande un onglet');
    if (!REGROUPEMENTS[onglet].includes(regrouper)) throw new RequeteInvalide(`Regroupement ${regrouper} impossible pour ${onglet}`);
  }
  const deplier = texteFacultatif(d.deplier, 'Groupe à déplier', 300);
  const comparer = texteFacultatif(d.comparer, 'Groupe comparé');
  if (comparer !== undefined && !filtres.groupe) throw new RequeteInvalide('La comparaison demande un filtre groupe');
  return { ...d, filtres, ordre, onglet: onglet as TypeFait | undefined, regrouper, deplier, comparer };
}

/** Une lecture de l'Explorer, sur le dépôt. */
const lire =
  (faits: FaitsRepository) =>
  (l: Lecture): Promise<ReponseLecture> => {
    switch (l.type) {
      case 'nommer':
        return faits.nommer(l.filtres);
      case 'compter':
        return faits.compter(l.filtres);
      case 'groupes':
        return faits.groupes(l.demande);
      case 'deplier':
        return faits.deplier(l.demande, l.cle);
      case 'suggerer':
        return faits.suggerer(l.filtres, l.cle, l.limite);
      case 'scrutin':
        return faits.scrutin(l.scrutin, l.groupe);
    }
  };

export function lecturesFaits({ depots, synthetiseur }: LecturesDeps): Pick<Handlers, 'ExplorerFaits'> {
  const r = remplirPar(synthetiseur);

  return {
    ExplorerFaits: async (demande) => {
      const valide = demandeValide(demande ?? {});
      try {
        const sortie = await explorerAsync(valide, borner(valide), lire(depots.faits));
        // La demande rendue est celle reçue (champs absents non ajoutés).
        return REMPLIR.ExplorerFaits(r, { ...sortie, demande });
      } catch (e) {
        if (e instanceof FiltreInconnu) throw new Introuvable(e.message);
        throw e;
      }
    },
  };
}
