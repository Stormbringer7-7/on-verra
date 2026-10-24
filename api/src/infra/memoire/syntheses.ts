// Synthétiseur de maquette : rend, pour un sujet, le texte « en clair » que les fixtures du
// contrat affichent (fictif, présenté comme relu) ; null sinon. Utilisé avec SOURCE_DONNEES=memoire
// seulement : en production, seul SansSynthese est branché (aucun LLM).

import type { Synthese } from '@contrat/domain/model';

import type { SujetSynthese, Synthetiseur } from '../../ports';
import { type DonneesMemoire, cleSujet } from './donnees';

export class SynthetiseurMemoire implements Synthetiseur {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  async synthese(sujet: SujetSynthese): Promise<Synthese> {
    return (await this.donnees).syntheses.get(cleSujet(sujet)) ?? null;
  }
}
