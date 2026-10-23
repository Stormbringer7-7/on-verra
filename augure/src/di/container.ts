// Racine de composition de l'app : choisit les adapters et les donne au cœur.

import { createCore, type CommandBus } from '../core';
import type { Logger, PublicationSource } from '../core/ports';
import { OnVerraRepository } from '../infra/onverra/OnVerraRepository';
import { HttpPublicationSource } from '../infra/publication/HttpPublicationSource';
import { CatalogueEnClair } from '../infra/resumes/CatalogueEnClair';
import enClair from '../infra/resumes/en-clair.json';
import { KeywordThemeClassifier } from '../infra/themes/KeywordThemeClassifier';
import { creerLocales } from './plateforme';

const consoleLogger: Logger = {
  debug: (message, data) => __DEV__ && console.debug(`[augure] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`[augure] ${message}`, data ?? ''),
};

/**
 * Publication opendata hébergée (service Docker « publication », ou /donnees derrière la version web) :
 * chaque législature est téléchargée à sa première consultation, puis mise à jour par correctifs.
 * Sans EXPO_PUBLIC_PUBLICATION_URL, en développement : le service « publication » local.
 */
const URL_DEVELOPPEMENT = 'http://localhost:8081';

function creerSource(): PublicationSource {
  const url = process.env.EXPO_PUBLIC_PUBLICATION_URL ?? (__DEV__ ? URL_DEVELOPPEMENT : undefined);
  if (!url) throw new Error('EXPO_PUBLIC_PUBLICATION_URL manquante : adresse de la publication opendata.');
  return new HttpPublicationSource(url);
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
