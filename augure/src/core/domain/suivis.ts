// Mes suivis : les lois et les élus suivis restent sur l'appareil ; l'app envoie leurs identifiants
// et une date, l'API répond par ce qui a bougé depuis, sans rien garder (aucun état côté serveur,
// aucun compte). Pas de notifications : l'écran les montre à l'ouverture.

import type { DossierRef, Provenance } from './commun';
import type { DossierResume } from './dossiers';
import type { CleCase } from './parcours';
import type { EntetePersonne } from './personnes';
import type { ScrutinResume } from './scrutins';

export interface DemandeSuivis {
  /** Identifiants des dossiers suivis (au plus 50). */
  dossiers: string[];
  /** Identifiants des personnes suivies (au plus 50). */
  personnes: string[];
  /** « AAAA-MM-JJ » : ce qui a bougé à partir de ce jour (au plus un an avant aujourd'hui). */
  depuis: string;
}

/** Ce qui a bougé : un acte publié du parcours d'une loi suivie, ou un vote d'un élu suivi à l'inverse de son groupe. */
export type EvenementSuivi =
  | {
      type: 'acte';
      date: string;
      dossier: DossierRef;
      /** Case du parcours, null si l'acte n'est rangé dans aucune case. */
      cle: CleCase | null;
      /** « Conseil constit. · Saisine du conseil constitutionnel », tel que publié. */
      libelle: string;
      provenance: Provenance;
    }
  | {
      type: 'ecart';
      date: string;
      personne: { id: string; nom: string };
      scrutin: ScrutinResume;
    };

export interface Suivis {
  demande: DemandeSuivis;
  /** Du plus récent au plus ancien, au plus 50. */
  evenements: EvenementSuivi[];
  /** Les dossiers suivis connus (barre, étape courante, prochaine échéance), dans l'ordre de la demande. */
  dossiers: DossierResume[];
  /** Les personnes suivies connues, dans l'ordre de la demande. */
  personnes: EntetePersonne[];
  /** Identifiants demandés que la base ne connaît pas (retirés de la source, fusionnés, inconnus). */
  inconnus: string[];
  /** Ce que cette liste ne dit pas, à afficher tel quel. */
  limites: string[];
}
