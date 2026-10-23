// Racine de composition de l'app : le bus de commandes, exécuté par l'API.

import type { CommandBus } from '../core';
import type { Logger } from '../core/ports';
import { creerApiBus } from '../infra/ApiBus';

const consoleLogger: Logger = {
  debug: (message, data) => __DEV__ && console.debug(`[augure] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`[augure] ${message}`, data ?? ''),
};

/**
 * Adresse de l'API (service Docker « api », ou /api derrière la version web et Caddy).
 * Sans EXPO_PUBLIC_API_URL, en développement : le service « api » local.
 */
const URL_DEVELOPPEMENT = 'http://localhost:8082';

export function createContainer(): CommandBus {
  const url = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? URL_DEVELOPPEMENT : undefined);
  if (!url) throw new Error("EXPO_PUBLIC_API_URL manquante : adresse de l'API.");
  return creerApiBus(url, consoleLogger);
}
