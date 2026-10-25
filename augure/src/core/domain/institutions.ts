// Institutions : composition de l'Assemblée et du Sénat par groupe, Gouvernement actuel et
// gouvernements de la législature, décisions récentes du Conseil constitutionnel reliées aux dossiers.

import type { DossierRef, GroupeRef, PersonneRef, Provenance } from './commun';
import type { DossierResume } from './dossiers';

export type TypeInstitution = 'an' | 'senat' | 'gouvernement' | 'cc';

export interface GroupeSiegeant {
  groupe: GroupeRef;
  sieges: number;
  /** Rang de la gauche vers la droite de l'hémicycle (0 = le plus à gauche). */
  rang: number;
}

/** Parlementaire en mandat à la date de la composition ; `personne.groupe` : son groupe ce jour-là. */
export interface Siegeant {
  personne: PersonneRef;
  /**
   * Siège publié, null sinon. AN : celui de son dernier vote en scrutin public (`numPlace`,
   * numéroté de la droite vers la gauche). Sénat : « N° de siège Hémicycle » de l'export du Sénat.
   */
  siege: number | null;
}

export interface MembreGouvernement {
  personne: PersonneRef;
  /** Fonction telle que publiée (« Ministre de la Transition énergétique »). */
  fonction: string;
  depuis: string | null;
  /** Fonction parlementaire passée la plus récente (« ancienne députée (2017-2025) »), null sinon. */
  ancienne: string | null;
}

export interface GouvernementResume {
  id: string;
  nom: string;
  debut: string | null;
  fin: string | null;
}

export interface DecisionCC {
  id: string;
  /** « 2026-914 DC », « 2026-37 QPC ». */
  numero: string;
  /** DC, QPC, autre (tel que publié). */
  type: string;
  date: string | null;
  /** Solution publiée (« Conformité », « Non conformité partielle - réserve »). */
  solution: string | null;
  /** Dossier relié par la référence de l'AN, null sinon. */
  dossier: DossierRef | null;
  url: string | null;
  provenance: Provenance;
}

export type Institution =
  | {
      type: 'an' | 'senat';
      libelle: string;
      legislature: string | null;
      /** Date de la composition (aujourd'hui, ou la fin de la législature). */
      date: string;
      sieges: number;
      /** De la gauche vers la droite ; sièges sans groupe : non-inscrits (un groupe à part). */
      groupes: GroupeSiegeant[];
      sansGroupe: number;
      /**
       * Chaque parlementaire (au plus 577 ou 348 : pas de pagination, l'hémicycle les dessine tous),
       * de la gauche vers la droite : groupe (`rang`), puis siège décroissant (AN), à défaut
       * nom (ordre alphabétique, nombres compris) ; sans groupe à la fin.
       */
      membres: Siegeant[];
    }
  | {
      type: 'gouvernement';
      libelle: string;
      actuel: (GouvernementResume & { membres: MembreGouvernement[] }) | null;
      /** Gouvernements de la législature, du plus récent au plus ancien. */
      gouvernements: GouvernementResume[];
      /** Projets de loi déposés pendant le gouvernement actuel. */
      textesDeposes: { total: number; dossiers: DossierResume[] };
    }
  | {
      type: 'cc';
      libelle: string;
      /** Saisines enregistrées dans le parcours d'un dossier, sans décision publiée. */
      saisinesEnCours: { dossier: DossierRef; date: string | null; saisissants: string | null }[];
      /** Décisions récentes, de la plus récente à la plus ancienne. */
      decisions: DecisionCC[];
    };
