// Résumés « En clair » rédigés à la main, relus contre le texte officiel, indexés par loi.
// Règles de rédaction (design system Panoptique) : décrire ce que le texte change, jamais
// s'il est bon ; verbe à l'infinitif, pas d'adjectif, pas de question orientée.

import type { EnClair, ScrutinResume } from '@contrat/domain/model';
import type { EnClairProvider } from '../ports';

export type Catalogue = Record<string, EnClair>;

export class CatalogueEnClair implements EnClairProvider {
  constructor(private readonly catalogue: Catalogue) {}

  async pour(scrutin: ScrutinResume): Promise<EnClair | null> {
    return this.catalogue[scrutin.uid] ?? (scrutin.loiId ? this.catalogue[scrutin.loiId] : undefined) ?? null;
  }
}
