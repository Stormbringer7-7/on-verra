// Données de l'adaptateur mémoire, tirées des fixtures du contrat (augure/src/infra/fixtures) :
// chaque exemple { entrée, sortie } est repris sans ses synthèses (G4), qui alimentent à part le
// synthétiseur de maquette (sujet → texte). Les dépôts mémoire découpent ensuite ces sorties en
// réponses de ports ; rejouées par les handlers, elles redonnent les sorties des fixtures.
//
// Entités retirées (G2) : `retirees` simule des entités retirées de la source ou fusionnées. Un
// exemple dont l'entrée les cite est ignoré, et tout élément de liste qui les contient disparaît.

import type { InputOf, OutputOf } from '@contrat/commands/bus';
import type * as definitions from '@contrat/commands/definitions';
import type { Synthese } from '@contrat/domain/model';
import { fixtures } from '@fixtures';

import { REMPLIR } from '../../lectures/syntheses';
import type { SujetSynthese } from '../../ports';

type Definitions = typeof definitions;
export type NomCommande = keyof Definitions;
export interface ExempleMemoire<K extends NomCommande> {
  titre: string;
  input: InputOf<Definitions[K]>;
  output: OutputOf<Definitions[K]>;
}
export type Exemples = { [K in NomCommande]: ExempleMemoire<K>[] };

/** Deux textes différents pour un même sujet dans les fixtures : le premier est gardé. */
export interface ConflitSynthese {
  sujet: SujetSynthese;
  garde: Synthese;
  ecarte: Synthese;
  titre: string;
}

export interface DonneesMemoire {
  exemples: Exemples;
  syntheses: Map<string, Synthese>;
  conflits: ConflitSynthese[];
}

/** Clé stable d'un sujet (ordre des champs indifférent). */
export function cleSujet(sujet: SujetSynthese): string {
  return JSON.stringify(Object.entries(sujet).sort(([a], [b]) => a.localeCompare(b)));
}

/** Clé stable d'une valeur JSON quelconque (entrée de commande, cible). */
export function cleJson(valeur: unknown): string {
  return JSON.stringify(valeur, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/** Une valeur cite-t-elle une entité retirée (identifiant n'importe où dans l'objet) ? */
function cite(valeur: unknown, retirees: ReadonlySet<string>): boolean {
  if (typeof valeur === 'string') return retirees.has(valeur);
  if (Array.isArray(valeur)) return valeur.some((v) => cite(v, retirees));
  if (valeur && typeof valeur === 'object') return Object.values(valeur).some((v) => cite(v, retirees));
  return false;
}

/** Retire de toutes les listes les éléments qui citent une entité retirée. */
function sansRetirees<T>(valeur: T, retirees: ReadonlySet<string>): T {
  if (!retirees.size) return valeur;
  if (Array.isArray(valeur)) return valeur.filter((v) => !cite(v, retirees)).map((v) => sansRetirees(v, retirees)) as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, sansRetirees(v, retirees)])) as T;
  }
  return valeur;
}

export async function chargerDonnees(retirees: readonly string[] = []): Promise<DonneesMemoire> {
  const masquees = new Set(retirees);
  const syntheses = new Map<string, Synthese>();
  const conflits: ConflitSynthese[] = [];
  const exemples = {} as Record<NomCommande, ExempleMemoire<NomCommande>[]>;

  for (const nom of Object.keys(fixtures) as NomCommande[]) {
    const remplir = REMPLIR[nom] as (r: Parameters<(typeof REMPLIR)[NomCommande]>[0], s: unknown) => Promise<unknown>;
    exemples[nom] = [];
    for (const exemple of fixtures[nom] as ExempleMemoire<NomCommande>[]) {
      if (cite(exemple.input, masquees)) continue;
      // Parcours des synthèses de la sortie : chaque texte est noté sous son sujet, et rendu null.
      const output = await remplir(async (sujet, actuelle) => {
        const cle = cleSujet(sujet);
        if (!syntheses.has(cle)) syntheses.set(cle, actuelle);
        else if (syntheses.get(cle) !== actuelle) conflits.push({ sujet, garde: syntheses.get(cle)!, ecarte: actuelle, titre: exemple.titre });
        return null;
      }, exemple.output);
      exemples[nom].push({ titre: exemple.titre, input: exemple.input, output: sansRetirees(output, masquees) } as ExempleMemoire<NomCommande>);
    }
  }
  return { exemples: exemples as unknown as Exemples, syntheses, conflits };
}

/** Une page d'une liste connue ; `total` : celui que publie la fixture s'il dépasse la liste. */
export function paginer<T>(elements: T[], { page, taille }: { page: number; taille: number }, total = elements.length) {
  return {
    elements: elements.slice((page - 1) * taille, page * taille),
    page,
    taille,
    total,
    suivante: page * taille < total ? page + 1 : null,
  };
}

/** Premier élément d'une liste qui vérifie le prédicat, ou null (G5). */
export const premier = <T>(liste: readonly T[], predicat: (x: T) => boolean): T | null => liste.find(predicat) ?? null;
