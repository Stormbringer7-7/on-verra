// Racine de composition de l'app : le bus de commandes, selon EXPO_PUBLIC_SOURCE.
//
//   api       (défaut) chaque commande est exécutée par l'API (ApiBus, EXPO_PUBLIC_API_URL)
//   fixtures  données fictives du canevas, sans réseau (FixturesBus) ; un bandeau le dit à l'écran

import type { CommandBus } from '../core';
import type { Logger } from '../core/ports';
import { creerApiBus } from '../infra/ApiBus';
import { creerFixturesBus } from '../infra/FixturesBus';

export type SourceDonnees = 'api' | 'fixtures';

const consoleLogger: Logger = {
  debug: (message, data) => __DEV__ && console.debug(`[augure] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`[augure] ${message}`, data ?? ''),
};

/**
 * Adresse de l'API (service Docker « api », ou /api derrière la version web et Caddy).
 * Sans EXPO_PUBLIC_API_URL, en développement : le service « api » local.
 */
const URL_DEVELOPPEMENT = 'http://localhost:8082';

/** Lit EXPO_PUBLIC_SOURCE (notation pointée : Expo ne remplace que celle-ci à la compilation). */
export function lireSource(valeur: string | undefined = process.env.EXPO_PUBLIC_SOURCE): SourceDonnees {
  const v = (valeur ?? '').trim();
  if (v === '' || v === 'api') return 'api';
  if (v === 'fixtures') return 'fixtures';
  throw new Error(`EXPO_PUBLIC_SOURCE=${v} inconnue : « api » (défaut) ou « fixtures ».`);
}

export function createContainer(source: SourceDonnees = lireSource()): { bus: CommandBus; source: SourceDonnees } {
  if (source === 'fixtures') {
    // En développement, une entrée sans fixture rend la première de la commande (navigation libre) ;
    // dans une version publiée, l'écran dit qu'il n'y a pas de donnée de maquette.
    return { bus: creerFixturesBus(consoleLogger, { mode: __DEV__ ? 'souple' : 'strict' }), source };
  }
  const url = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? URL_DEVELOPPEMENT : undefined);
  if (!url) throw new Error("EXPO_PUBLIC_API_URL manquante : adresse de l'API.");
  return { bus: creerApiBus(url, consoleLogger), source };
}
