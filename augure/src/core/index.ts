import { CommandBus } from './commands/bus';
import {
  ConsulterAssemblee,
  ConsulterChampions,
  ConsulterDepute,
  ConsulterGroupe,
  ConsulterScrutin,
  Explorer,
  ListerLegislatures,
  ListerScrutins,
  Rechercher,
  Synchroniser,
} from './commands/definitions';
import { lectures } from './commands/handlers/lectures';
import { abortable, logging, queryCache } from './commands/middlewares';
import { Partitions } from './partitions';
import type {
  EnClairProvider,
  LocalDatabases,
  Logger,
  ParlementRepository,
  PublicationSource,
  SqlDatabase,
  ThemeClassifier,
} from './ports';

export interface CoreDeps {
  source: PublicationSource;
  locales: LocalDatabases;
  /** Construit le repository d'une base de législature. */
  repository: (db: SqlDatabase) => ParlementRepository;
  themes: ThemeClassifier;
  enClair: EnClairProvider;
  logger: Logger;
}

/** Racine de composition du cœur : branche les handlers sur les ports fournis. */
export function createCore(deps: CoreDeps): CommandBus {
  const partitions = new Partitions(deps);
  const l = lectures({ partitions, repository: deps.repository, themes: deps.themes, enClair: deps.enClair });

  return new CommandBus()
    .use(logging(deps.logger))
    .use(abortable)
    .use(queryCache())
    .register(Synchroniser, l.synchroniser)
    .register(ListerLegislatures, l.legislatures)
    .register(ConsulterAssemblee, l.assemblee)
    .register(ConsulterGroupe, l.groupe)
    .register(ConsulterDepute, l.depute)
    .register(ConsulterScrutin, l.scrutin)
    .register(ListerScrutins, l.scrutins)
    .register(Rechercher, l.rechercher)
    .register(Explorer, l.explorer)
    .register(ConsulterChampions, l.champions);
}

export * from './commands/bus';
export * from './commands/definitions';
export * from './domain/model';
