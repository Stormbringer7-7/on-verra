// ApiBus : chaque commande du contrat en POST sur son type ; queries en cache, la command
// `SignalerErreur` jamais (et elle vide le cache).

import { describe, expect, it } from 'vitest';

import { ConsulterAccueil, ConsulterInstitution, SignalerErreur } from '../src/core';
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
    const { appels, fetcher } = faux(() => Response.json({ votes: [] }));
    const bus = creerApiBus('/api/', silencieux, fetcher);
    expect(await bus.execute(ConsulterAccueil({}))).toEqual({ votes: [] });
    await bus.execute(ConsulterAccueil({}));
    await bus.execute(ConsulterInstitution({ institution: 'senat' }));
    expect(appels).toEqual([
      { url: '/api/accueil/consulter', corps: {} },
      { url: '/api/institution/consulter', corps: { institution: 'senat' } },
    ]);
  });

  it('envoie SignalerErreur à chaque fois (command), et vide le cache des queries', async () => {
    const { appels, fetcher } = faux(() => Response.json({ id: 's1', recuLe: '2026-10-24T10:00:00+02:00' }));
    const bus = creerApiBus('/api', silencieux, fetcher);
    const signalement = { cible: { type: 'dossier' as const, id: 'd1' }, message: 'Source manquante' };
    await bus.execute(ConsulterAccueil({}));
    await bus.execute(SignalerErreur(signalement));
    await bus.execute(SignalerErreur(signalement));
    await bus.execute(ConsulterAccueil({}));
    expect(appels.map((a) => a.url)).toEqual([
      '/api/accueil/consulter',
      '/api/signalement/envoyer',
      '/api/signalement/envoyer',
      '/api/accueil/consulter',
    ]);
    expect(appels[1].corps).toEqual(signalement);
  });

  it("rend le message d'erreur de l'API", async () => {
    const { fetcher } = faux(() => Response.json({ erreur: 'Institution inconnue.' }, { status: 500 }));
    const bus = creerApiBus('https://exemple.fr/api', silencieux, fetcher);
    await expect(bus.execute(ConsulterInstitution({ institution: 'cc' }))).rejects.toThrow('Institution inconnue');
  });

  it('donne la raison quand les données manquent ou que le serveur ne répond pas', async () => {
    const preparation = faux(() =>
      Response.json({ code: 'donnees_en_preparation', erreur: 'Les données de cet écran sont en cours de préparation.', detail: 'Table pas encore construite : lecture.couleur_groupe' }, { status: 503 }),
    );
    await expect(creerApiBus('https://exemple.fr/api', silencieux, preparation.fetcher).execute(ConsulterInstitution({ institution: 'an' }))).rejects.toMatchObject({
      name: 'ErreurApi',
      code: 'donnees_en_preparation',
      statut: 503,
      detail: 'Table pas encore construite : lecture.couleur_groupe',
    });
    const proxy = faux(() => new Response('Bad Gateway', { status: 502 }));
    await expect(creerApiBus('https://exemple.fr/api', silencieux, proxy.fetcher).execute(ConsulterInstitution({ institution: 'an' }))).rejects.toMatchObject({
      code: 'serveur_indisponible',
      message: expect.stringContaining('ne répond pas'),
    });
    const reseau = faux(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(creerApiBus('https://exemple.fr/api', silencieux, reseau.fetcher).execute(ConsulterInstitution({ institution: 'an' }))).rejects.toMatchObject({
      code: 'reseau',
      message: expect.stringContaining('vérifiez votre connexion'),
    });
  });

  it('refuse une adresse en HTTP hors de la machine', () => {
    expect(() => creerApiBus('http://exemple.fr/api', silencieux)).toThrow('HTTPS');
    expect(() => creerApiBus('http://192.168.1.10.exemple.fr/api', silencieux)).toThrow('HTTPS');
    expect(() => creerApiBus('http://172.32.0.1:8082', silencieux)).toThrow('HTTPS');
  });

  it('accepte une adresse en HTTP sur le réseau local (serveur de test)', () => {
    for (const url of ['http://192.168.1.139:8082', 'http://10.0.2.2:8082', 'http://172.16.0.5:8082', 'http://localhost:8082']) {
      expect(() => creerApiBus(url, silencieux)).not.toThrow();
    }
  });
});
