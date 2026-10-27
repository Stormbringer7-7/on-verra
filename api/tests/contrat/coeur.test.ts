// Briques du cœur : bus et cache des queries, enregistrement de toutes les commandes, bornage de
// la pagination, semaine de l'Accueil, horloge, SansSynthese, paramètres SQL nommés.

import { describe, expect, it } from 'vitest';

import { CommandBus, defineCommand, defineQuery } from '@contrat/commands/bus';
import * as definitions from '@contrat/commands/definitions';
import { queryCache } from '@contrat/commands/middlewares';

import { HorlogeSysteme } from '../../src/infra/composition';
import { memoire } from '../../src/infra/memoire';
import { positionnels } from '../../src/infra/PgDatabase';
import { gaucheDroite } from '../../src/infra/pg/personnes';
import { SansSynthese } from '../../src/infra/SansSynthese';
import { borner, limiter } from '../../src/lectures/commun';
import { semaineDe } from '../../src/lectures/dossiers';
import { coreDeTest } from '../support';

describe('bus de commandes', () => {
  const Lire = defineQuery<{ n: number }, number>('test/lire');
  const Ecrire = defineCommand<{ n: number }, void>('test/ecrire');

  it('met les queries en cache et vide le cache après une command', async () => {
    let lectures = 0;
    let valeur = 1;
    const bus = new CommandBus()
      .use(queryCache())
      .register(Lire, async ({ n }) => (lectures++, n * valeur))
      .register(Ecrire, async ({ n }) => void (valeur = n));
    expect(await bus.execute(Lire({ n: 2 }))).toBe(2);
    expect(await bus.execute(Lire({ n: 2 }))).toBe(2);
    expect(lectures).toBe(1);
    await bus.execute(Ecrire({ n: 10 }));
    expect(await bus.execute(Lire({ n: 2 }))).toBe(20);
    expect(lectures).toBe(2);
  });

  it('le cœur enregistre un handler par commande du contrat', () => {
    const bus = coreDeTest(memoire().depots);
    for (const d of Object.values(definitions)) expect(bus.connait(d.type), d.type).toBe(true);
    expect(definitions.SignalerErreur.kind).toBe('command');
  });

  it("une erreur (404) n'est pas gardée en cache", async () => {
    const bus = coreDeTest(memoire().depots);
    await expect(bus.execute(definitions.ConsulterDossier({ id: 'x' }))).rejects.toMatchObject({ statut: 404 });
    await expect(bus.execute(definitions.ConsulterDossier({ id: 'x' }))).rejects.toMatchObject({ statut: 404 });
  });

  it('recherche : expressions invalides (400), personne inconnue (404)', async () => {
    const bus = coreDeTest(memoire().depots);
    const chercher = (d: object) => bus.execute(definitions.ChercherParFamilles(d as never));
    await expect(chercher({ textes: 'Silence' })).rejects.toMatchObject({ statut: 400 });
    await expect(chercher({ textes: ['a', 'b', 'c', 'd', 'e', 'f'] })).rejects.toMatchObject({ statut: 400 });
    await expect(chercher({ textes: ['x'.repeat(101)] })).rejects.toMatchObject({ statut: 400 });
    await expect(chercher({ personne: 'personne-inconnue' })).rejects.toMatchObject({ statut: 404 });
  });
});

describe('pagination bornée', () => {
  it('page ≥ 1, 1 ≤ taille ≤ 100, 20 par défaut', () => {
    expect(borner(undefined)).toEqual({ page: 1, taille: 20 });
    expect(borner({ page: 0, taille: 1000 })).toEqual({ page: 1, taille: 100 });
    expect(borner({ page: -2, taille: 0 })).toEqual({ page: 1, taille: 1 });
    expect(borner({ page: 2.7, taille: 7.9 })).toEqual({ page: 2, taille: 7 });
    expect(borner({ page: '3', taille: 'beaucoup' } as never)).toEqual({ page: 1, taille: 20 });
    expect(borner({}, 5)).toEqual({ page: 1, taille: 5 });
    expect(limiter(500, 20)).toBe(100);
  });
});

describe('dates', () => {
  it('semaine de lundi à dimanche', () => {
    expect(semaineDe('2026-10-24')).toEqual({ debut: '2026-10-19', fin: '2026-10-25' });
    expect(semaineDe('2026-10-19')).toEqual({ debut: '2026-10-19', fin: '2026-10-25' });
    expect(semaineDe('2026-10-25')).toEqual({ debut: '2026-10-19', fin: '2026-10-25' });
    expect(semaineDe('2027-01-01')).toEqual({ debut: '2026-12-28', fin: '2027-01-03' });
  });

  it('horloge système : jour civil AAAA-MM-JJ', () => {
    expect(new HorlogeSysteme().aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('adaptateurs simples', () => {
  it('SansSynthese rend toujours null', async () => {
    expect(await new SansSynthese().synthese()).toBeNull();
  });

  it('paramètres SQL nommés → positionnels, chacun une fois', () => {
    expect(positionnels('SELECT $a, $b, $a', { $a: 1, $b: 'x' })).toEqual({ text: 'SELECT $1, $2, $1', values: [1, 'x'] });
    expect(() => positionnels('SELECT $c', {})).toThrow(/manquant/);
  });
});

describe('ordre gauche-droite des groupes', () => {
  const g = (id: string, abrege = id) =>
    ({ id, abrege, libelle: abrege, couleur: '#000000', sourceCouleur: 'arbitraire', chambre: 'AN' }) as const;
  const ids = (l: { id: string }[]) => l.map((x) => x.id);

  it('positionnés par position, puis les autres dans l’ordre reçu, non-inscrits en dernier', () => {
    const recus = [g('ni', 'NI'), g('sans1'), g('droite'), g('sans2'), g('gauche'), g('centre')];
    const positions = new Map([['droite', 0.9], ['gauche', 0.05], ['centre', 0.5], ['ni', 0.4]]);
    expect(ids(gaucheDroite(recus, (x) => x, positions))).toEqual(['gauche', 'centre', 'droite', 'sans1', 'sans2', 'ni']);
  });

  it('sans aucune position (Sénat) : l’ordre reçu', () => {
    const recus = [g('b'), g('a'), g('c')];
    expect(ids(gaucheDroite(recus, (x) => x, new Map()))).toEqual(['b', 'a', 'c']);
  });
});
