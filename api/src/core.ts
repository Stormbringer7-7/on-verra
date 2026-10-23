// Racine de composition côté serveur : les handlers du contrat (augure/src/core/commands/definitions)
// branchés sur Postgres. L'app n'a plus qu'un client HTTP de ce bus.

import { CommandBus } from '@contrat/commands/bus';
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
} from '@contrat/commands/definitions';
import { logging, queryCache } from '@contrat/commands/middlewares';

import { Legislatures, type LegislaturesDeps } from './legislatures';
import { lectures } from './lectures';
import type { EnClairProvider, Logger, ParlementRepository, SqlDatabase, ThemeClassifier } from './ports';

export interface CoreDeps extends LegislaturesDeps {
  repository: (db: SqlDatabase) => ParlementRepository;
  themes: ThemeClassifier;
  enClair: EnClairProvider;
  logger: Logger;
}

export function createCore(deps: CoreDeps): CommandBus {
  const l = lectures({
    legislatures: new Legislatures(deps),
    repository: deps.repository,
    themes: deps.themes,
    enClair: deps.enClair,
  });

  return new CommandBus()
    .use(logging(deps.logger))
    .use(queryCache(1000))
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
