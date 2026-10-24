// Outils des tests de l'API : cœur de test, exécution d'une commande par son nom, parcours et
// comparaison de sorties JSON, base de lecture (DATABASE_URL_LECTURE, tests sautés sans elle).

import type { Command, CommandBus, CommandDefinition, InputOf, OutputOf } from '@contrat/commands/bus';
import * as definitions from '@contrat/commands/definitions';

import { createCore } from '../src/core';
import { HorlogeFixe } from '../src/infra/memoire/horloge';
import { SansSynthese } from '../src/infra/SansSynthese';
import type { Depots, Horloge, Logger, Synthetiseur } from '../src/ports';

export type Definitions = typeof definitions;
export type NomCommande = keyof Definitions;

/** Base réelle en lecture seule (chargée par opendata) : les tests Postgres sont sautés sans elle. */
export const DATABASE_URL_LECTURE = process.env.DATABASE_URL_LECTURE;

export const silencieux: Logger = { debug: () => {}, warn: () => {} };

export function coreDeTest(
  depots: Depots,
  { synthetiseur = new SansSynthese(), horloge = new HorlogeFixe() }: { synthetiseur?: Synthetiseur; horloge?: Horloge } = {},
): CommandBus {
  return createCore({ depots, synthetiseur, horloge, logger: silencieux });
}

/** Commande du contrat construite par son nom (« ConsulterDossier »). */
export function commande<K extends NomCommande>(nom: K, input: InputOf<Definitions[K]>): Command<string, InputOf<Definitions[K]>, OutputOf<Definitions[K]>> {
  return (definitions[nom] as unknown as CommandDefinition<string, InputOf<Definitions[K]>, OutputOf<Definitions[K]>>)(input);
}

/** Nom de commande d'un type de route (« dossier/consulter » → « ConsulterDossier »). */
export const NOMS = new Map(Object.entries(definitions).map(([nom, d]) => [d.type, nom as NomCommande]));

/** Appelle `f` sur chaque objet (et tableau) d'une valeur JSON, avec son chemin. */
export function visiter(valeur: unknown, f: (objet: Record<string, unknown>, chemin: string) => void, chemin = ''): void {
  if (Array.isArray(valeur)) valeur.forEach((v, i) => visiter(v, f, `${chemin}[${i}]`));
  else if (valeur && typeof valeur === 'object') {
    f(valeur as Record<string, unknown>, chemin);
    for (const [k, v] of Object.entries(valeur)) visiter(v, f, chemin ? `${chemin}.${k}` : k);
  }
}

/** Toutes les chaînes d'une valeur JSON. */
export function chaines(valeur: unknown): string[] {
  if (typeof valeur === 'string') return [valeur];
  if (Array.isArray(valeur)) return valeur.flatMap(chaines);
  if (valeur && typeof valeur === 'object') return Object.values(valeur).flatMap(chaines);
  return [];
}

/** Chemins où deux valeurs JSON diffèrent (un tableau de longueur différente : son chemin seul). */
export function differences(a: unknown, b: unknown, chemin = ''): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [chemin];
    return a.flatMap((v, i) => differences(v, b[i], `${chemin}[${i}]`));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return cles.flatMap((k) =>
      differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], chemin ? `${chemin}.${k}` : k),
    );
  }
  return Object.is(a, b) ? [] : [chemin];
}

/** Valeur à un chemin produit par `differences` / `visiter`. */
export function a(valeur: unknown, chemin: string): unknown {
  return chemin
    .split(/\.|(?=\[)/)
    .filter(Boolean)
    .reduce<unknown>((v, morceau) => {
      if (v === null || v === undefined) return undefined;
      const indice = /^\[(\d+)\]$/.exec(morceau);
      return indice ? (v as unknown[])[Number(indice[1])] : (v as Record<string, unknown>)[morceau];
    }, valeur);
}
