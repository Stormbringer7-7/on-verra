// Racine de composition : le seul endroit qui choisit les adaptateurs des ports.
//
//   SOURCE_DONNEES=postgres (défaut)  dépôts infra/pg sur DATABASE_URL, SansSynthese, horloge du jour
//   SOURCE_DONNEES=memoire            dépôts infra/memoire (fixtures du contrat), leurs synthèses
//                                     de maquette, jour de référence des fixtures (2026-10-24)
//
// Le serveur recrée le cœur (et vide ses caches) quand `marque()` change : nouveau chargement des
// données ou nouveau jour.

import type { CommandBus } from '@contrat/commands/bus';

import { createCore } from '../core';
import type { Depots, Horloge, Logger, Synthetiseur } from '../ports';
import { memoire } from './memoire';
import { ouvrirPostgres } from './PgDatabase';
import { depotsPostgres, marqueDuChargement } from './pg';
import { SansSynthese } from './SansSynthese';

export type SourceDonnees = 'postgres' | 'memoire';

export interface Composition {
  source: SourceDonnees;
  creerCore(): CommandBus;
  /** Change quand les données ou le jour changent : le cœur et ses caches sont alors recréés. */
  marque(): Promise<string | null>;
  /** Lève une erreur si la source de données ne répond pas. */
  sante(): Promise<void>;
  fermer(): Promise<void>;
}

/** Jour civil à Paris (« AAAA-MM-JJ »), pas celui de l'UTC. */
export class HorlogeSysteme implements Horloge {
  private readonly format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });

  aujourdhui(): string {
    return this.format.format(new Date());
  }
}

export const URL_PAR_DEFAUT = 'postgres://big-brother:big-brother@127.0.0.1:5433/civictrace';

export function sourceDonnees(valeur: string | undefined): SourceDonnees {
  const source = valeur?.trim() || 'postgres';
  if (source !== 'postgres' && source !== 'memoire') throw new Error(`SOURCE_DONNEES inconnue : ${source} (postgres ou memoire)`);
  return source;
}

export function composer(env: NodeJS.ProcessEnv, logger: Logger): Composition {
  const source = sourceDonnees(env.SOURCE_DONNEES);
  const coeur = (depots: Depots, synthetiseur: Synthetiseur, horloge: Horloge) => () =>
    createCore({ depots, synthetiseur, horloge, logger });

  if (source === 'memoire') {
    const m = memoire();
    return {
      source,
      creerCore: coeur(m.depots, m.synthetiseur, m.horloge),
      marque: async () => `memoire:${m.horloge.aujourdhui()}`,
      sante: async () => void (await m.donnees),
      fermer: async () => {},
    };
  }

  const { db, fermer } = ouvrirPostgres(env.DATABASE_URL ?? URL_PAR_DEFAUT);
  const horloge = new HorlogeSysteme();
  return {
    source,
    creerCore: coeur(depotsPostgres(db), new SansSynthese(), horloge),
    marque: async () => `${(await marqueDuChargement(db)) ?? 'aucun'}:${horloge.aujourdhui()}`,
    sante: async () => void (await db.first('SELECT 1')),
    fermer,
  };
}
