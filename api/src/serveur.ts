// API de « Nos administrés ont du talent » : une route par commande du contrat.
//
//   POST /assemblee/consulter   {"legislature": "17"}   → Assemblee (JSON)
//   GET  /sante                                          → 200 quand la base répond
//
// Variables : DATABASE_URL (Postgres), PORT (3000).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { CommandBus } from '@contrat/commands/bus';

import { createCore } from './core';
import { CatalogueEnClair } from './infra/CatalogueEnClair';
import enClair from './infra/en-clair.json';
import { KeywordThemeClassifier } from './infra/KeywordThemeClassifier';
import { OnVerraRepository } from './infra/OnVerraRepository';
import { Connexions } from './infra/PgDatabase';
import type { Logger } from './ports';

const TAILLE_MAX_CORPS = 16_000;
const VERIFICATION_IMPORT_MS = 30_000;

const logger: Logger = {
  debug: (message) => process.env.DEBUG && console.log(message),
  warn: (message, data) => console.warn(message, data instanceof Error ? data.message : (data ?? '')),
};

const connexions = new Connexions(process.env.DATABASE_URL ?? 'postgres://big-brother@localhost:5432/big-brother');
const index = connexions.base();
const themes = new KeywordThemeClassifier();
const resumes = new CatalogueEnClair(enClair);

const creerCore = () =>
  createCore({
    index,
    base: (legislature) => connexions.base(`l${legislature}`),
    repository: (db) => new OnVerraRepository(db),
    themes,
    enClair: resumes,
    logger,
  });

// Le cœur garde index de recherche et résultats en mémoire : il est recréé quand opendata
// a chargé une nouvelle version (public.legislatures.charge_le).
let core: CommandBus = creerCore();
let chargement: string | null = null;
let verifie = 0;

async function coreAJour(): Promise<CommandBus> {
  if (Date.now() - verifie < VERIFICATION_IMPORT_MS) return core;
  verifie = Date.now();
  try {
    const r = await index.first<{ dernier: string | null }>('SELECT CAST(MAX(charge_le) AS text) AS dernier FROM legislatures');
    if (r?.dernier !== chargement) {
      if (chargement !== null) logger.warn('Nouvelle version des données : caches vidés');
      chargement = r?.dernier ?? null;
      core = creerCore();
    }
  } catch (e) {
    verifie = 0;
    throw e;
  }
  return core;
}

function lireCorps(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.setEncoding('utf8');
    req.on('data', (morceau: string) => {
      corps += morceau;
      if (corps.length > TAILLE_MAX_CORPS) reject(new ErreurHttp(413, 'Requête trop volumineuse'));
    });
    req.on('end', () => {
      try {
        resolve(corps ? JSON.parse(corps) : {});
      } catch {
        reject(new ErreurHttp(400, 'JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string) {
    super(message);
  }
}

function repondre(res: ServerResponse, statut: number, corps: unknown) {
  res.writeHead(statut, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(corps));
}

const serveur = createServer(async (req, res) => {
  const type = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }
    if (type === 'sante') {
      await index.first('SELECT 1');
      return repondre(res, 200, { ok: true });
    }
    if (req.method !== 'POST') throw new ErreurHttp(405, 'POST attendu');
    const input = await lireCorps(req);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ErreurHttp(400, 'Objet JSON attendu');
    const bus = await coreAJour();
    if (!bus.connait(type)) throw new ErreurHttp(404, `Commande inconnue : ${type}`);
    repondre(res, 200, await bus.execute({ type, kind: 'query', input }));
  } catch (e) {
    const statut = e instanceof ErreurHttp ? e.statut : 500;
    if (statut === 500) logger.warn(`${type} a échoué`, e);
    repondre(res, statut, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.PORT ?? 3000);
serveur.listen(port, () => console.log(`API sur le port ${port}`));

const arreter = () => serveur.close(() => connexions.fermer().finally(() => process.exit(0)));
process.on('SIGTERM', arreter);
process.on('SIGINT', arreter);
