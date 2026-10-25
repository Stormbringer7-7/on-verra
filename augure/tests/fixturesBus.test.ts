// Bus de maquette (EXPO_PUBLIC_SOURCE=fixtures) : chaque commande du contrat répond par ses
// fixtures, entrée comparée en JSON ; entrée inconnue → première fixture (souple) ou erreur claire
// (strict). Et le choix de la source dans la racine de composition.

import { describe, expect, it } from 'vitest';

import { ConsulterAccueil, ConsulterDossier, Rechercher, SignalerErreur, type CommandDefinition } from '../src/core';
import * as definitions from '../src/core/commands/definitions';
import { lireSource } from '../src/di/container';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus, FixtureAbsente, jsonCanonique } from '../src/infra/FixturesBus';

const silencieux = { debug: () => {}, warn: () => {} };
type Exemple = { titre: string; input: unknown; output: unknown };

describe('FixturesBus', () => {
  it('répond à chaque exemple de chaque commande par sa sortie', async () => {
    const bus = creerFixturesBus(silencieux);
    for (const [nom, d] of Object.entries(definitions) as [string, CommandDefinition<string, unknown, unknown>][]) {
      const exemples = (fixtures as unknown as Record<string, Exemple[]>)[nom];
      expect(exemples?.length, nom).toBeGreaterThan(0);
      for (const e of exemples) expect(await bus.execute(d(e.input)), `${nom} « ${e.titre} »`).toEqual(e.output);
    }
  });

  it('compare les entrées en JSON : ordre des clés et `undefined` sans effet', async () => {
    const bus = creerFixturesBus(silencieux);
    const attendu = fixtures.ConsulterInstitution[1].output;
    expect(await bus.execute(definitions.ConsulterInstitution({ institution: 'senat' }))).toEqual(attendu);
    const parlementaires = fixtures.ListerDossiers[1].output;
    expect(await bus.execute(definitions.ListerDossiers({ origine: 'parlementaire', theme: undefined }))).toEqual(parlementaires);
    expect(jsonCanonique({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonCanonique({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('strict : une entrée inconnue est une erreur qui nomme la commande et les entrées connues', async () => {
    const bus = creerFixturesBus(silencieux, { mode: 'strict' });
    const echec = bus.execute(ConsulterDossier({ id: 'dossier-inconnu' }));
    await expect(echec).rejects.toBeInstanceOf(FixtureAbsente);
    await expect(bus.execute(ConsulterDossier({ id: 'dossier-inconnu' }))).rejects.toThrow(
      /Pas de donnée de maquette pour dossier\/consulter \{"id":"dossier-inconnu"\}.*dossier-energie/,
    );
  });

  it('souple (développement) : une entrée inconnue rend la première fixture, signalée au journal', async () => {
    const avertissements: string[] = [];
    const bus = creerFixturesBus({ debug: () => {}, warn: (m) => avertissements.push(m) }, { mode: 'souple' });
    expect(await bus.execute(Rechercher({ q: 'nucléaire' }))).toEqual(fixtures.Rechercher[0].output);
    expect(avertissements.join('\n')).toMatch(/recherche : pas de fixture pour \{"q":"nucléaire"\}/);
  });

  it('rend une copie : modifier la réponse ne touche pas les fixtures', async () => {
    const bus = creerFixturesBus(silencieux);
    const accueil = await bus.execute(ConsulterAccueil({}));
    accueil.dossiers.length = 0;
    expect((await bus.execute(ConsulterAccueil({}))).dossiers.length).toBe(fixtures.ConsulterAccueil[0].output.dossiers.length);
  });

  it('exécute SignalerErreur comme une command', async () => {
    expect(SignalerErreur.kind).toBe('command');
    const bus = creerFixturesBus(silencieux, { mode: 'souple' });
    const accuse = await bus.execute(SignalerErreur({ cible: { type: 'scrutin', id: 'x' }, message: 'Autre message' }));
    expect(accuse).toEqual(fixtures.SignalerErreur[0].output);
  });
});

describe('EXPO_PUBLIC_SOURCE', () => {
  it('vaut api par défaut, fixtures sur demande, et refuse une valeur inconnue', () => {
    expect(lireSource(undefined)).toBe('api');
    expect(lireSource('')).toBe('api');
    expect(lireSource('api')).toBe('api');
    expect(lireSource(' fixtures ')).toBe('fixtures');
    expect(() => lireSource('memoire')).toThrow(/EXPO_PUBLIC_SOURCE=memoire inconnue/);
  });
});
