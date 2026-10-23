import type { Logger } from '../ports';
import type { Middleware } from './bus';

/** Journal : type, durée, erreurs. */
export function logging(logger: Logger): Middleware {
  return async (command, _ctx, next) => {
    const debut = Date.now();
    try {
      const resultat = await next();
      logger.debug(`${command.type} ${Date.now() - debut} ms`);
      return resultat;
    } catch (e) {
      logger.warn(`${command.type} a échoué`, e);
      throw e;
    }
  };
}

/**
 * Cache des queries : la base ne change qu'au moment d'une command (synchronisation),
 * qui vide le cache. Une même query en cours n'est lancée qu'une fois.
 */
export function queryCache(capacite = 100): Middleware & { clear(): void } {
  const cache = new Map<string, Promise<unknown>>();
  const middleware: Middleware = async (command, _ctx, next) => {
    if (command.kind === 'command') {
      try {
        return await next();
      } finally {
        cache.clear();
      }
    }
    const cle = `${command.type}:${JSON.stringify(command.input)}`;
    const existant = cache.get(cle);
    if (existant) {
      // Plus récemment utilisé en dernier.
      cache.delete(cle);
      cache.set(cle, existant);
      return existant;
    }
    const promesse = next();
    cache.set(cle, promesse);
    if (cache.size > capacite) cache.delete(cache.keys().next().value!);
    promesse.catch(() => cache.delete(cle));
    return promesse;
  };
  return Object.assign(middleware, { clear: () => cache.clear() });
}

/** Annulation : une query abandonnée (écran quitté) ne rend pas de résultat. */
export const abortable: Middleware = async (_command, ctx, next) => {
  ctx.signal?.throwIfAborted();
  const resultat = await next();
  ctx.signal?.throwIfAborted();
  return resultat;
};
