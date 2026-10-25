// Cœur de l'API : un handler par commande du contrat (augure/src/core/commands/definitions),
// enregistré sur le bus avec le journal et le cache des queries. Le cœur ne connaît que des ports
// (api/src/ports.ts) : la racine de composition (infra/composition.ts) choisit les adaptateurs.

import { CommandBus, type CommandDefinition, type Handler } from '@contrat/commands/bus';
import * as definitions from '@contrat/commands/definitions';
import { logging, queryCache } from '@contrat/commands/middlewares';

import { lecturesAvancement } from './lectures/avancement';
import type { Handlers, LecturesDeps } from './lectures/commun';
import { lecturesDiscussions } from './lectures/discussions';
import { lecturesDossiers } from './lectures/dossiers';
import { lecturesInstitutions } from './lectures/institutions';
import { lecturesPersonnes } from './lectures/personnes';
import { lecturesRecherche } from './lectures/recherche';
import { lecturesScrutins } from './lectures/scrutins';
import { lecturesTransparence } from './lectures/transparence';
import type { Logger } from './ports';

export interface CoreDeps extends LecturesDeps {
  logger: Logger;
  /** Résultats de queries gardés en mémoire (vidés à chaque command et à chaque nouveau chargement). */
  cache?: number;
}

/** Tous les handlers, par nom de commande. */
export function handlers(deps: LecturesDeps): Handlers {
  return {
    ...lecturesDossiers(deps),
    ...lecturesAvancement(deps),
    ...lecturesDiscussions(deps),
    ...lecturesScrutins(deps),
    ...lecturesPersonnes(deps),
    ...lecturesInstitutions(deps),
    ...lecturesTransparence(deps),
    ...lecturesRecherche(deps),
  };
}

/**
 * Les définitions du contrat, par nom d'export. Chargé en CommonJS (tsx en développement), l'espace
 * de noms porte aussi `default` et `module.exports` : on ne garde que les définitions.
 */
export function definitionsDuContrat(): [keyof typeof definitions, CommandDefinition<string, unknown, unknown>][] {
  return Object.entries(definitions)
    .filter(([, d]) => typeof (d as { type?: unknown }).type === 'string')
    .map(([nom, d]) => [nom as keyof typeof definitions, d as CommandDefinition<string, unknown, unknown>]);
}

export function createCore(deps: CoreDeps): CommandBus {
  const bus = new CommandBus().use(logging(deps.logger)).use(queryCache(deps.cache ?? 1000));
  const h = handlers(deps);
  for (const [nom, definition] of definitionsDuContrat()) bus.register(definition, h[nom] as Handler<unknown, unknown>);
  return bus;
}
