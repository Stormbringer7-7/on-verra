// Le bus de l'app : chaque commande du contrat est exécutée par l'API (service « api »).
// L'app ne contient aucune base ni aucun SQL : elle envoie la commande, l'API renvoie le résultat.
//
//   POST <url>/dossier/consulter      {"id": "…"}                    query : mise en cache
//   POST <url>/signalement/envoyer    {"cible": {…}, "message": "…"} command : jamais en cache,
//                                                                     vide le cache des queries
//
// Le genre (query ou command) vient de la définition (`defineQuery` / `defineCommand`) :
// `SignalerErreur` est la seule command du contrat.

import { CommandBus, type CommandDefinition } from '../core/commands/bus';
import * as definitions from '../core/commands/definitions';
import { abortable, logging, queryCache } from '../core/commands/middlewares';
import type { Logger } from '../core/ports';

/**
 * Échec d'un appel, avec sa raison lisible (`message`) et ce que l'API en dit : `code`
 * (donnees_en_preparation, base_lente, base_injoignable, erreur_interne, requete ; reseau et
 * serveur_indisponible côté app), statut HTTP, détail technique.
 */
export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly statut: number | null,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

export function creerApiBus(
  url: string,
  logger: Logger,
  // `fetch` enveloppé : appelé comme méthode, il perdrait son `this` dans les navigateurs.
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): CommandBus {
  const racine = url.trim().replace(/\/+$/, '');
  // Une adresse relative (« /api ») vise le même hôte que la version web. En http : la machine,
  // l'émulateur, ou un poste du réseau local (adresses privées RFC 1918, serveur de test).
  const locale = racine.startsWith('/') || /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?(\/|$)/.test(racine);
  if (!racine.startsWith('https://') && !locale) throw new Error("L'adresse de l'API doit être en HTTPS");

  const appeler = async (type: string, input: unknown, signal?: AbortSignal): Promise<unknown> => {
    let reponse: Response;
    try {
      reponse = await fetcher(`${racine}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input ?? {}),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ErreurApi(
        'Impossible de joindre le serveur : vérifiez votre connexion. Si elle marche, le serveur est peut-être arrêté.',
        'reseau',
        null,
        `${racine} : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      // L'API dit la raison ({ erreur, code, detail }) ; sans corps, c'est le serveur devant elle.
      if (typeof corps?.erreur === 'string') throw new ErreurApi(corps.erreur, corps.code ?? null, reponse.status, corps.detail ?? null);
      if ([502, 503, 504].includes(reponse.status))
        throw new ErreurApi('Le serveur ne répond pas pour le moment (redémarrage ou mise à jour en cours). Réessayez dans quelques minutes.', 'serveur_indisponible', reponse.status, null);
      throw new ErreurApi(`Réponse inattendue du serveur (HTTP ${reponse.status}).`, null, reponse.status, null);
    }
    return corps;
  };

  const bus = new CommandBus().use(logging(logger)).use(abortable).use(queryCache());
  for (const d of Object.values(definitions) as CommandDefinition<string, unknown, unknown>[]) {
    bus.register(d, (input, ctx) => appeler(d.type, input, ctx.signal));
  }
  return bus;
}
