// Horloge fixe : le jour de référence des fixtures (« aujourd'hui » du canevas) ou celui d'un test.

import { AUJOURDHUI } from '@fixtures/entites';

import type { Horloge } from '../../ports';

export class HorlogeFixe implements Horloge {
  constructor(private readonly jour: string = AUJOURDHUI) {}

  aujourdhui(): string {
    return this.jour;
  }
}
