// Outils communs des handlers : dépendances, erreurs (404, 400), bornage de la pagination,
// validation des entrées venues du réseau et barre du dossier rappelée sur ses sous-écrans.
//
// Les handlers ne lisent que des ports (api/src/ports.ts) : ils assemblent les morceaux de DTO
// rendus par les dépôts, bornent ce que l'utilisateur demande et remplissent les synthèses
// (lectures/syntheses.ts). Un identifiant inconnu (dépôt → null) devient une erreur `Introuvable`,
// rendue en 404 par le serveur.

import type { Handler, InputOf, OutputOf } from '@contrat/commands/bus';
import type * as definitions from '@contrat/commands/definitions';
import type { BarreDossier, CleCase, DemandePage } from '@contrat/domain/model';

import type { Depots, Horloge, Pagination, Synthetiseur } from '../ports';
import type { Remplir } from './syntheses';

export interface LecturesDeps {
  depots: Depots;
  synthetiseur: Synthetiseur;
  horloge: Horloge;
}

type Definitions = typeof definitions;

/** Un handler par commande du contrat : l'oubli d'une commande ne compile pas. */
export type Handlers = { [K in keyof Definitions]: Handler<InputOf<Definitions[K]>, OutputOf<Definitions[K]>> };

/** Le synthétiseur sous la forme qu'attendent les remplisseurs de syntheses.ts. */
export const remplirPar =
  (synthetiseur: Synthetiseur): Remplir =>
  (sujet) =>
    synthetiseur.synthese(sujet);

// ---------- Erreurs ----------

/** Objet absent, retiré de la source ou fusionné : 404. */
export class Introuvable extends Error {
  readonly statut = 404;
  constructor(message: string) {
    super(message);
    this.name = 'Introuvable';
  }
}

/** Entrée mal formée (champ manquant, valeur hors vocabulaire) : 400. */
export class RequeteInvalide extends Error {
  readonly statut = 400;
  constructor(message: string) {
    super(message);
    this.name = 'RequeteInvalide';
  }
}

/** Fiche rendue par un dépôt, ou 404 si l'identifiant est inconnu (G5). */
export function trouve<T>(valeur: T | null, quoi: string): T {
  if (valeur === null || valeur === undefined) throw new Introuvable(`${quoi} introuvable`);
  return valeur;
}

// ---------- Pagination ----------

export const TAILLE_PAR_DEFAUT = 20;
export const TAILLE_MAX = 100;
const PAGE_MAX = 10_000;

const entier = (valeur: unknown, defaut: number) =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? Math.trunc(valeur) : defaut;

/** Page demandée → page ≥ 1, 1 ≤ taille ≤ 100 (20 par défaut) : ce que les dépôts reçoivent. */
export function borner(demande: DemandePage | undefined, tailleParDefaut = TAILLE_PAR_DEFAUT): Pagination {
  return {
    page: Math.min(PAGE_MAX, Math.max(1, entier(demande?.page, 1))),
    taille: Math.min(TAILLE_MAX, Math.max(1, entier(demande?.taille, tailleParDefaut))),
  };
}

/** Plafond d'une limite demandée (classements). */
export const limiter = (valeur: unknown, defaut: number, max = TAILLE_MAX) =>
  Math.min(max, Math.max(1, entier(valeur, defaut)));

// ---------- Validation des entrées ----------

/** Texte obligatoire (identifiant, requête), au plus `max` caractères. */
export function texte(valeur: unknown, nom: string, max = 200): string {
  if (typeof valeur !== 'string' || !valeur.trim()) throw new RequeteInvalide(`${nom} attendu`);
  if (valeur.length > max) throw new RequeteInvalide(`${nom} trop long`);
  return valeur;
}

/** Texte facultatif. */
export function texteFacultatif(valeur: unknown, nom: string, max = 200): string | undefined {
  return valeur === undefined || valeur === null ? undefined : texte(valeur, nom, max);
}

/** Valeur d'un vocabulaire fermé, décrit par un objet `{ valeur: libellé }` exhaustif sur le type. */
export function parmi<T extends string>(valeur: unknown, vocabulaire: Record<T, unknown>, nom: string): T {
  if (typeof valeur !== 'string' || !Object.hasOwn(vocabulaire, valeur)) {
    throw new RequeteInvalide(`${nom} inconnu : ${String(valeur)}`);
  }
  return valeur as T;
}

export function parmiFacultatif<T extends string>(valeur: unknown, vocabulaire: Record<T, unknown>, nom: string): T | undefined {
  return valeur === undefined || valeur === null ? undefined : parmi(valeur, vocabulaire, nom);
}

/** Cases des gabarits de parcours (`lecture.parcours_gabarit.cle`). */
export const CASES: Record<CleCase, true> = {
  depot: true,
  commission_1_o: true,
  seance_1_o: true,
  commission_1_s: true,
  seance_1_s: true,
  lecture_1_o: true,
  lecture_1_s: true,
  lecture_2_o: true,
  lecture_2_s: true,
  cmp: true,
  conclusions_cmp: true,
  nouvelle_lecture: true,
  lecture_definitive: true,
  cc: true,
  promulgation: true,
  jo: true,
  promulgation_jo: true,
};

// ---------- Barre du dossier ----------

/** Barre compacte du dossier, avec la case de l'écran ; null hors du périmètre de la projection. */
export async function barreDe(depots: Depots, dossier: string, ici: CleCase | null): Promise<BarreDossier | null> {
  const b = await depots.dossiers.barre(dossier);
  return b && { dossier: b.dossier, cases: b.cases, ici };
}

/**
 * Barre exigée par le contrat (article, amendement, étape) : hors projection, la barre est vide
 * (dossier nommé par son en-tête) plutôt que l'écran refusé.
 */
export async function barreObligatoire(depots: Depots, dossier: string, ici: CleCase | null): Promise<BarreDossier> {
  const b = await barreDe(depots, dossier, ici);
  if (b) return b;
  const entete = trouve(await depots.dossiers.entete(dossier), 'Dossier');
  return { dossier: { id: entete.id, titre: entete.titre }, cases: [], ici: null };
}
