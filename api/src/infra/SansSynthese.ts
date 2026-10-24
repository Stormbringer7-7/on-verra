// Seul adaptateur de production du port `Synthetiseur` : aucun LLM n'est branché, aucune synthèse
// n'est produite. L'app affiche « Pas de synthèse disponible ».

import type { Synthese } from '@contrat/domain/model';

import type { Synthetiseur } from '../ports';

export class SansSynthese implements Synthetiseur {
  async synthese(): Promise<Synthese> {
    return null;
  }
}
