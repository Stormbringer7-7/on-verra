import { describe, expect, it } from 'vitest';

import { ConsulterAssemblee, ListerLegislatures } from '../src/core';
import { creerApiBus } from '../src/infra/ApiBus';

const silencieux = { debug: () => {}, warn: () => {} };

/** fetch simulé : enregistre les appels et rend la réponse donnée. */
function faux(reponse: () => Response) {
  const appels: { url: string; corps: unknown }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    appels.push({ url, corps: JSON.parse(String(init?.body)) });
    return reponse();
  }) as typeof fetch;
  return { appels, fetcher };
}

describe("bus de l'app : commandes exécutées par l'API", () => {
  it('envoie chaque commande en POST sur son type, et met les réponses en cache', async () => {
    const { appels, fetcher } = faux(() => Response.json([{ numero: '17' }]));
    const bus = creerApiBus('/api/', silencieux, fetcher);
    expect(await bus.execute(ListerLegislatures({}))).toEqual([{ numero: '17' }]);
    await bus.execute(ListerLegislatures({}));
    await bus.execute(ConsulterAssemblee({ legislature: '15' }));
    expect(appels).toEqual([
      { url: '/api/legislatures/lister', corps: {} },
      { url: '/api/assemblee/consulter', corps: { legislature: '15' } },
    ]);
  });

  it("rend le message d'erreur de l'API", async () => {
    const { fetcher } = faux(() => Response.json({ erreur: 'La 12e législature n’est pas disponible.' }, { status: 500 }));
    const bus = creerApiBus('https://exemple.fr/api', silencieux, fetcher);
    await expect(bus.execute(ConsulterAssemblee({ legislature: '12' }))).rejects.toThrow('12e législature');
  });

  it('refuse une adresse en HTTP hors de la machine', () => {
    expect(() => creerApiBus('http://exemple.fr/api', silencieux)).toThrow('HTTPS');
  });
});
