// Bus de maquette (EXPO_PUBLIC_SOURCE=fixtures) : chaque commande du contrat répond par les
// fixtures du canevas (`infra/fixtures`), sans réseau. On y intègre les écrans avant que les
// données réelles soient prêtes, et on les compare au canevas.
//
// Une entrée est cherchée par égalité JSON avec l'`input` d'un exemple (clés triées, `undefined`
// ignoré, comme une fois envoyée à l'API). Entrée inconnue : en mode `souple` (développement), la
// première fixture de la commande, signalée au journal ; en mode `strict`, une erreur qui le dit.

import { CommandBus, type CommandDefinition } from '../core/commands/bus';
import * as definitions from '../core/commands/definitions';
import { abortable, logging } from '../core/commands/middlewares';
import type { Logger } from '../core/ports';
import { fixtures as fixturesDuContrat, type Fixtures } from './fixtures';

export type ModeFixtures = 'souple' | 'strict';

interface Exemple {
  titre: string;
  input: unknown;
  output: unknown;
}

/** JSON canonique : clés triées, `undefined` retiré (deux entrées équivalentes ont la même clé). */
export function jsonCanonique(valeur: unknown): string {
  return JSON.stringify(valeur ?? {}, (_cle, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Erreur « pas de fixture pour cette entrée » : l'écran la montre telle quelle. */
export class FixtureAbsente extends Error {
  constructor(type: string, input: unknown, connues: string[]) {
    super(
      `Pas de donnée de maquette pour ${type} ${jsonCanonique(input)}. ` +
        `Entrées connues : ${connues.join(' ; ') || 'aucune'}.`,
    );
    this.name = 'FixtureAbsente';
  }
}

export function creerFixturesBus(
  logger: Logger,
  options: { mode?: ModeFixtures; fixtures?: Fixtures; delai?: number } = {},
): CommandBus {
  const { mode = 'strict', fixtures = fixturesDuContrat, delai = 0 } = options;
  const exemplesDe = fixtures as unknown as Record<string, Exemple[]>;

  const bus = new CommandBus().use(logging(logger)).use(abortable);
  for (const [nom, d] of Object.entries(definitions) as [string, CommandDefinition<string, unknown, unknown>][]) {
    const exemples = exemplesDe[nom] ?? [];
    const index = new Map(exemples.map((e) => [jsonCanonique(e.input), e]));
    bus.register(d, async (input) => {
      if (delai) await new Promise((r) => setTimeout(r, delai));
      let exemple = index.get(jsonCanonique(input));
      if (!exemple) {
        if (mode === 'strict' || !exemples[0]) throw new FixtureAbsente(d.type, input, [...index.keys()]);
        exemple = exemples[0];
        logger.warn(`${d.type} : pas de fixture pour ${jsonCanonique(input)}, réponse « ${exemple.titre} »`);
      }
      // Copie : un écran qui modifierait la réponse ne touche pas les fixtures.
      return JSON.parse(JSON.stringify(exemple.output));
    });
  }
  return bus;
}
