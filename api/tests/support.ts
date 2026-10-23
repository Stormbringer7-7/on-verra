import { CatalogueEnClair } from '../src/infra/CatalogueEnClair';
import { KeywordThemeClassifier } from '../src/infra/KeywordThemeClassifier';
import { OnVerraRepository } from '../src/infra/OnVerraRepository';
import { Connexions } from '../src/infra/PgDatabase';
import { createCore } from '../src/core';
import type { Logger } from '../src/ports';

/** Postgres du docker compose (exposé sur la machine en 5433), ou DATABASE_URL. */
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://big-brother:big-brother@127.0.0.1:5433/big-brother';

export const silencieux: Logger = { debug: () => {}, warn: () => {} };

async function joignable(): Promise<boolean> {
  const c = new Connexions(DATABASE_URL);
  try {
    return (await c.base().all('SELECT 1 FROM legislatures LIMIT 1')).length > 0;
  } catch {
    return false;
  } finally {
    await c.fermer();
  }
}

/** Données chargées dans Postgres : sinon les tests de données sont sautés. */
export const baseDisponible = await joignable();

export function creerCoreDeTest() {
  const connexions = new Connexions(DATABASE_URL);
  const bus = createCore({
    index: connexions.base(),
    base: (legislature) => connexions.base(`l${legislature}`),
    repository: (db) => new OnVerraRepository(db),
    themes: new KeywordThemeClassifier(),
    enClair: new CatalogueEnClair({}),
    logger: silencieux,
  });
  return { bus, fermer: () => connexions.fermer() };
}
