// Racine de composition de l'app : choisit les adapters et les donne au cœur.

import { createCore, type CommandBus } from '../core';
import type { Logger, PublicationSource } from '../core/ports';
import { OnVerraRepository } from '../infra/onverra/OnVerraRepository';
import { EmbeddedPublicationSource } from '../infra/publication/EmbeddedPublicationSource';
import { HttpPublicationSource } from '../infra/publication/HttpPublicationSource';
import { CatalogueEnClair } from '../infra/resumes/CatalogueEnClair';
import enClair from '../infra/resumes/en-clair.json';
import { KeywordThemeClassifier } from '../infra/themes/KeywordThemeClassifier';
import { indexEmbarque, partitionsEmbarquees } from './embarquees';
import { creerLocales, lireAsset } from './plateforme';

const consoleLogger: Logger = {
  debug: (message, data) => __DEV__ && console.debug(`[augure] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`[augure] ${message}`, data ?? ''),
};

/**
 * Par défaut, les législatures embarquées dans l'app (`npm run donnees`) : rien à héberger.
 * Avec EXPO_PUBLIC_PUBLICATION_URL, la publication hébergée : toutes les législatures, téléchargées
 * à la consultation et mises à jour par correctifs.
 */
function creerSource(): PublicationSource {
  const url = process.env.EXPO_PUBLIC_PUBLICATION_URL;
  if (url) return new HttpPublicationSource(url);
  return new EmbeddedPublicationSource(
    indexEmbarque,
    Object.fromEntries(
      Object.entries(partitionsEmbarquees).map(([leg, p]) => [leg, { manifeste: p.manifeste, base: () => lireAsset(p.asset) }]),
    ),
  );
}

export function createContainer(): CommandBus {
  return createCore({
    source: creerSource(),
    locales: creerLocales(),
    repository: (db) => new OnVerraRepository(db),
    themes: new KeywordThemeClassifier(),
    enClair: new CatalogueEnClair(enClair),
    logger: consoleLogger,
  });
}
