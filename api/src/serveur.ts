// API CivicTrace (Panoptique) : une route par commande du contrat (augure/src/core/commands).
//
//   POST /dossier/consulter      {"id": "…"}            → FicheDossier (JSON)
//   POST /signalement/envoyer    {"cible": …, …}        → AccuseSignalement (seule écriture, kind « command »)
//   GET  /sante                                         → 200 quand la source de données répond
//
// Erreurs : 400 (entrée mal formée), 404 (commande ou objet inconnu), 405 (autre méthode que
// POST), 413 (corps trop gros), 500 (journalisée, message générique), toujours { erreur }.
//
// Variables : SOURCE_DONNEES (postgres | memoire), DATABASE_URL, PORT (3000), DEBUG.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

import type { CommandBus } from '@contrat/commands/bus';
import { definitionsDuContrat } from './core';

import { type Composition, composer } from './infra/composition';
import type { Logger } from './ports';

export const TAILLE_MAX_CORPS = 16_000;
const VERIFICATION_DONNEES_MS = 30_000;

/** Ce dont le serveur a besoin : un cœur à jour et un test de santé. */
export interface SourceDuCore {
  core(): Promise<CommandBus>;
  sante(): Promise<void>;
}

/** Commandes du contrat par route (`accueil/consulter`…), avec leur nature query ou command. */
const ROUTES = new Map(definitionsDuContrat().map(([, d]) => [d.type, d] as const));

/**
 * Cœur recréé (caches vidés) quand la composition signale de nouvelles données : vérifié au plus
 * toutes les 30 s, à la première requête qui suit.
 */
export function coreRechargeable(composition: Composition, logger: Logger, intervalle = VERIFICATION_DONNEES_MS): SourceDuCore {
  let core: CommandBus | null = null;
  let marque: string | null = null;
  let verifie = 0;
  return {
    async core() {
      if (core && Date.now() - verifie < intervalle) return core;
      const actuelle = await composition.marque();
      verifie = Date.now();
      if (!core || actuelle !== marque) {
        if (core) logger.warn('Nouvelle version des données : cœur recréé, caches vidés');
        marque = actuelle;
        core = composition.creerCore();
      }
      return core;
    },
    sante: () => composition.sante(),
  };
}

class ErreurHttp extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

/** Statut porté par l'erreur (Introuvable 404, RequeteInvalide 400), sinon 500. */
const statutDe = (e: unknown): number => {
  const statut = (e as { statut?: unknown } | null)?.statut;
  return typeof statut === 'number' && statut >= 400 && statut < 600 ? statut : 500;
};

/** Pourquoi une réponse manque : `code` stable pour l'app, `erreur` à afficher, `detail` technique. */
export interface CorpsErreur {
  erreur: string;
  code: 'donnees_en_preparation' | 'base_lente' | 'base_injoignable' | 'erreur_interne' | 'requete';
  detail?: string;
}

/**
 * Erreur de la base traduite pour l'utilisateur (codes SQLSTATE de Postgres). Les cas connus sont
 * passagers (503, à réessayer) : une projection pas encore construite après une mise à jour
 * (42P01 sur `lecture.*`), une requête trop longue pendant un chargement (57014), une base arrêtée
 * ou injoignable (08xxx, 57P0x, ECONNREFUSED). Le reste est un défaut de l'API (500).
 */
export function erreurBase(e: unknown): { statut: number; corps: CorpsErreur } | null {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  const texte = typeof message === 'string' ? message : '';
  if (code === '42P01') {
    const table = /relation "([^"]+)"/.exec(texte)?.[1] ?? null;
    if (table?.startsWith('lecture.'))
      return {
        statut: 503,
        corps: {
          code: 'donnees_en_preparation',
          erreur: 'Les données de cet écran sont en cours de préparation : la base vient d’être mise à jour et ses tableaux de lecture se reconstruisent. Réessayez dans quelques minutes.',
          detail: `Table pas encore construite : ${table}`,
        },
      };
  }
  if (code === '57014')
    return {
      statut: 503,
      corps: {
        code: 'base_lente',
        erreur: 'La base de données a mis trop de temps à répondre, souvent parce qu’une mise à jour des données est en cours. Réessayez dans quelques minutes.',
        detail: texte,
      },
    };
  if ((typeof code === 'string' && (code.startsWith('08') || code.startsWith('57P'))) || code === 'ECONNREFUSED' || code === 'ENOTFOUND')
    return {
      statut: 503,
      corps: { code: 'base_injoignable', erreur: 'La base de données est injoignable pour le moment. Réessayez dans quelques minutes.', detail: texte },
    };
  return null;
}

function lireCorps(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > TAILLE_MAX_CORPS) return reject(new ErreurHttp(413, 'Requête trop volumineuse'));
    const morceaux: Buffer[] = [];
    let taille = 0;
    let rejete = false;
    req.on('data', (morceau: Buffer) => {
      if (rejete) return;
      taille += morceau.length;
      if (taille > TAILLE_MAX_CORPS) {
        rejete = true;
        reject(new ErreurHttp(413, 'Requête trop volumineuse'));
      } else morceaux.push(morceau);
    });
    req.on('end', () => {
      if (rejete) return;
      const corps = Buffer.concat(morceaux).toString('utf8');
      try {
        resolve(corps ? JSON.parse(corps) : {});
      } catch {
        reject(new ErreurHttp(400, 'JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function repondre(res: ServerResponse, statut: number, corps: unknown, entetes: Record<string, string> = {}) {
  res.writeHead(statut, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...entetes,
  });
  res.end(JSON.stringify(corps));
}

export function creerServeur(source: SourceDuCore, logger: Logger): Server {
  return createServer(async (req, res) => {
    const route = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '');
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
      if (route === 'sante') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErreurHttp(405, 'GET attendu');
        await source.sante();
        return repondre(res, 200, { ok: true });
      }
      const definition = ROUTES.get(route);
      if (!definition) throw new ErreurHttp(404, `Commande inconnue : ${route}`);
      if (req.method !== 'POST') throw new ErreurHttp(405, 'POST attendu');
      const input = await lireCorps(req);
      if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ErreurHttp(400, 'Objet JSON attendu');
      const bus = await source.core();
      // La nature vient du contrat, jamais du client : SignalerErreur est une command.
      repondre(res, 200, await bus.execute({ type: definition.type, kind: definition.kind, input }));
    } catch (e) {
      const base = e instanceof ErreurHttp ? null : erreurBase(e);
      const statut = base?.statut ?? (e instanceof ErreurHttp ? e.statut : statutDe(e));
      if (statut >= 500) logger.warn(`${route} a échoué`, e);
      const corps: CorpsErreur =
        base?.corps ??
        (statut >= 500
          ? { code: 'erreur_interne', erreur: 'Erreur interne de l’API : un défaut de notre côté, noté dans le journal du serveur.' }
          : { code: 'requete', erreur: e instanceof Error ? e.message : String(e) });
      const entetes: Record<string, string> = statut === 405 ? { Allow: route === 'sante' ? 'GET' : 'POST' } : statut === 503 ? { 'Retry-After': '120' } : {};
      if (!res.headersSent) repondre(res, statut, corps, entetes);
      if (statut === 413) req.resume();
    }
  });
}

// ---------- Démarrage (node dist/serveur.mjs, tsx src/serveur.ts) ----------

function demarrer() {
  const logger: Logger = {
    debug: (message) => void (process.env.DEBUG && console.log(message)),
    warn: (message, data) => console.warn(message, data instanceof Error ? data.message : (data ?? '')),
  };
  const composition = composer(process.env, logger);
  const serveur = creerServeur(coreRechargeable(composition, logger), logger);
  const port = Number(process.env.PORT ?? 3000);
  serveur.listen(port, () => console.log(`API sur le port ${port} (données : ${composition.source})`));
  const arreter = () => serveur.close(() => composition.fermer().finally(() => process.exit(0)));
  process.on('SIGTERM', arreter);
  process.on('SIGINT', arreter);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) demarrer();
