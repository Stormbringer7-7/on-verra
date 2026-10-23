/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCore } from '../src/core';
import type { Logger, PublicationSource } from '../src/core/ports';
import { OnVerraRepository } from '../src/infra/onverra/OnVerraRepository';
import { HttpPublicationSource } from '../src/infra/publication/HttpPublicationSource';
import { CatalogueEnClair } from '../src/infra/resumes/CatalogueEnClair';
import { MemoireNodeSqlite } from '../src/infra/sql/NodeSqlite';
import { KeywordThemeClassifier } from '../src/infra/themes/KeywordThemeClassifier';

/** Dossier produit par `python3 -m on_verra publier` dans le sous-module. */
export const PUBLICATION = join(__dirname, '../../on-verra/publication');
export const publicationDisponible = existsSync(join(PUBLICATION, 'index.json'));
export const URL_TEST = 'https://publication.test';

export const silencieux: Logger = { debug: () => {}, warn: () => {} };

/**
 * fetch servi par un dossier local, comme l'hébergement public : l'adapter HTTP est testé tel quel.
 * `extra` remplace des fichiers par leur chemin relatif (« 17/manifest.json »).
 */
export function fetchLocal(dossier: string, extra: Record<string, Uint8Array | string> = {}): typeof fetch {
  return (async (url: string | URL | Request) => {
    const chemin = String(url).slice(URL_TEST.length + 1);
    const contenu = extra[chemin] ?? (existsSync(join(dossier, chemin)) ? readFileSync(join(dossier, chemin)) : null);
    if (contenu === null) return new Response(null, { status: 404 });
    return new Response(typeof contenu === 'string' ? contenu : new Uint8Array(contenu));
  }) as typeof fetch;
}

export function creerCoreDeTest(options: { source?: PublicationSource; locales?: MemoireNodeSqlite } = {}) {
  const locales = options.locales ?? new MemoireNodeSqlite();
  const source = options.source ?? new HttpPublicationSource(URL_TEST, fetchLocal(PUBLICATION));
  const bus = createCore({
    source,
    locales,
    repository: (db) => new OnVerraRepository(db),
    themes: new KeywordThemeClassifier(),
    enClair: new CatalogueEnClair({}),
    logger: silencieux,
  });
  return { bus, locales };
}
