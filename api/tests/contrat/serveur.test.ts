// Serveur HTTP sur l'adaptateur mémoire : une route par commande, POST seulement, erreurs propres
// (400, 404, 405, 413), SignalerErreur exécuté comme command (cache vidé), rechargement du cœur
// quand les données changent, racine de composition.

import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandBus, CommandKind } from '@contrat/commands/bus';
import * as definitions from '@contrat/commands/definitions';
import { fixtures } from '@fixtures';

import { composer, sourceDonnees, type Composition } from '../../src/infra/composition';
import { memoire } from '../../src/infra/memoire';
import { TAILLE_MAX_CORPS, coreRechargeable, creerServeur } from '../../src/serveur';
import { coreDeTest, silencieux } from '../support';

describe('serveur HTTP (mémoire)', () => {
  const m = memoire();
  const nature: { type: string; kind: CommandKind }[] = [];
  let bus: CommandBus;
  let racine: string;
  let sante = true;
  const serveur = creerServeur(
    {
      core: async () => bus,
      sante: async () => {
        if (!sante) throw new Error('base injoignable');
      },
    },
    silencieux,
  );

  beforeAll(async () => {
    bus = coreDeTest(m.depots, { synthetiseur: m.synthetiseur, horloge: m.horloge });
    bus.use(async (c, _ctx, next) => (nature.push({ type: c.type, kind: c.kind }), next()));
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
    racine = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())));

  const poster = (route: string, corps: unknown, init: RequestInit = {}) =>
    fetch(`${racine}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof corps === 'string' ? corps : JSON.stringify(corps), ...init });

  it('une route par commande du contrat, qui rend la sortie des fixtures', async () => {
    const reponse = await poster('dossier/consulter', fixtures.ConsulterDossier[1].input);
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toContain('application/json');
    expect(await reponse.json()).toEqual(fixtures.ConsulterDossier[1].output);
    // Entrée vide : rendue (Accueil, listes) ou refusée (400), jamais « commande inconnue ».
    for (const d of Object.values(definitions)) {
      expect([200, 400], d.type).toContain((await poster(d.type, {})).status);
    }
  });

  it('identifiant inconnu : 404 et { erreur }', async () => {
    const reponse = await poster('dossier/consulter', { id: 'nulle-part' });
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: 'Dossier introuvable' });
  });

  it('route inconnue : 404 ; entrée mal formée : 400', async () => {
    expect((await poster('assemblee/consulter', {})).status).toBe(404);
    expect((await poster('dossier/consulter', {})).status).toBe(400);
    expect((await poster('dossier/consulter', '{pas du json')).status).toBe(400);
    expect((await poster('dossier/consulter', [1, 2])).status).toBe(400);
  });

  it('autre méthode que POST : 405 avec Allow', async () => {
    const reponse = await fetch(`${racine}/dossier/consulter`);
    expect(reponse.status).toBe(405);
    expect(reponse.headers.get('allow')).toBe('POST');
    expect((await fetch(`${racine}/sante`, { method: 'POST' })).status).toBe(405);
  });

  it('corps trop gros : 413', async () => {
    const message = 'x'.repeat(TAILLE_MAX_CORPS + 1);
    const reponse = await poster('signalement/envoyer', { cible: { type: 'autre', id: null }, message });
    expect(reponse.status).toBe(413);
  });

  it('SignalerErreur est une command (vide le cache), les lectures des queries', async () => {
    nature.length = 0;
    await poster('accueil/consulter', {});
    const reponse = await poster('signalement/envoyer', fixtures.SignalerErreur[0].input);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ id: expect.stringMatching(/^signalement-fictif-\d+$/) });
    expect(nature).toEqual([
      { type: 'accueil/consulter', kind: 'query' },
      { type: 'signalement/envoyer', kind: 'command' },
    ]);
    // Cache vidé par la command : la même query est rejouée.
    await poster('accueil/consulter', {});
    expect(nature.at(-1)).toEqual({ type: 'accueil/consulter', kind: 'query' });
  });

  it('/sante : 200 quand la source répond, 500 sinon', async () => {
    expect((await fetch(`${racine}/sante`)).status).toBe(200);
    sante = false;
    const reponse = await fetch(`${racine}/sante`);
    sante = true;
    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toEqual({ erreur: 'Erreur interne' });
  });

  it('OPTIONS : 204 (CORS)', async () => {
    const reponse = await fetch(`${racine}/dossier/consulter`, { method: 'OPTIONS' });
    expect(reponse.status).toBe(204);
    expect(reponse.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('rechargement du cœur', () => {
  it('recrée le cœur quand la marque des données change, pas avant', async () => {
    let marque = 'lecture:1';
    let crees = 0;
    const composition: Composition = {
      source: 'memoire',
      creerCore: () => (crees++, coreDeTest(memoire().depots)),
      marque: async () => marque,
      sante: async () => {},
      fermer: async () => {},
    };
    const source = coreRechargeable(composition, silencieux, 0);
    const premier = await source.core();
    expect(await source.core()).toBe(premier);
    marque = 'lecture:2';
    expect(await source.core()).not.toBe(premier);
    expect(crees).toBe(2);
    // Dans l'intervalle, la marque n'est pas relue.
    const lent = coreRechargeable(composition, silencieux, 60_000);
    const c = await lent.core();
    marque = 'lecture:3';
    expect(await lent.core()).toBe(c);
  });
});

describe('racine de composition', () => {
  it('SOURCE_DONNEES=memoire : le cœur rend les fixtures', async () => {
    const c = composer({ SOURCE_DONNEES: 'memoire' }, silencieux);
    expect(c.source).toBe('memoire');
    await c.sante();
    expect(await c.marque()).toBe('memoire:2026-10-24');
    expect(await c.creerCore().execute(definitions.ConsulterAccueil({}))).toEqual(fixtures.ConsulterAccueil[0].output);
  });

  it('postgres par défaut, toute autre valeur refusée', () => {
    expect(sourceDonnees(undefined)).toBe('postgres');
    expect(sourceDonnees('memoire')).toBe('memoire');
    expect(() => sourceDonnees('sqlite')).toThrow(/SOURCE_DONNEES/);
  });
});
