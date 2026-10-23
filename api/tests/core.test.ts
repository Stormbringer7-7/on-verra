import { describe, expect, it } from 'vitest';

import { CommandBus, defineCommand, defineQuery } from '@contrat/commands/bus';
import { queryCache } from '@contrat/commands/middlewares';
import { ordonnerDeGaucheADroite } from '@contrat/domain/hemicycle';
import type { MembreAssemblee } from '@contrat/domain/model';
import { compterEntre, debutDouzeMois } from '@contrat/domain/texte';
import { bilan, estEcart, majoritaire } from '@contrat/domain/votes';
import { KeywordThemeClassifier } from '../src/infra/KeywordThemeClassifier';

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

  it("n'enregistre pas deux handlers pour la même commande", () => {
    const bus = new CommandBus().register(Lire, async () => 0);
    expect(() => bus.register(Lire, async () => 0)).toThrow();
  });

  it('applique les middlewares dans leur ordre', async () => {
    const trace: string[] = [];
    const bus = new CommandBus()
      .use(async (c, _ctx, next) => (trace.push(`a>${c.type}`), next()))
      .use(async (_c, _ctx, next) => (trace.push('b'), next()))
      .register(Lire, async () => (trace.push('handler'), 0));
    await bus.execute(Lire({ n: 0 }));
    expect(trace).toEqual(['a>test/lire', 'b', 'handler']);
  });
});

describe('règles de vote', () => {
  it('ligne de groupe : position la plus fréquente, aucune en cas d’égalité', () => {
    expect(majoritaire({ pour: 3, contre: 1, abstention: 0 })).toBe('pour');
    expect(majoritaire({ pour: 2, contre: 2, abstention: 0 })).toBeNull();
    expect(majoritaire({ pour: 0, contre: 0, abstention: 0 })).toBeNull();
  });
  it('écart : vote exprimé différent de la ligne du groupe au moment du vote', () => {
    expect(estEcart('contre', 'pour')).toBe(true);
    expect(estEcart('pour', 'pour')).toBe(false);
    expect(estEcart('absent', 'pour')).toBe(false);
    expect(estEcart('contre', null)).toBe(false);
  });
  it('bilan : les non-votes statutaires ne sont ni des écarts ni des absences', () => {
    const v = (position: any, ecart = false) => ({ position, ecart }) as any;
    expect(bilan([v('pour'), v('contre', true), v('absent'), v('non_votant')])).toEqual({
      total: 4,
      commeGroupe: 1,
      ecarts: 1,
      absences: 1,
    });
  });
});

describe('hémicycle', () => {
  const m = (acteur: string, groupe: string | null, place: number | null): MembreAssemblee => ({
    acteur,
    prenom: '',
    nom: acteur,
    civilite: null,
    departement: null,
    circonscription: null,
    groupe,
    place,
    position: null,
  });

  it('ordonne les groupes par siège moyen, numéros croissant de droite à gauche', () => {
    const ordre = ordonnerDeGaucheADroite([m('d1', 'DROITE', 10), m('g1', 'GAUCHE', 590), m('c1', 'CENTRE', 300), m('g2', 'GAUCHE', 580)]);
    expect(ordre.map((x) => x.acteur)).toEqual(['g1', 'g2', 'c1', 'd1']);
  });
  it('place au centre un groupe dont aucun siège n’est connu', () => {
    const ordre = ordonnerDeGaucheADroite([m('d', 'D', 10), m('x', 'X', null), m('g', 'G', 590)]);
    expect(ordre.map((x) => x.acteur)).toEqual(['g', 'x', 'd']);
  });
});

describe('comptage par bornes', () => {
  it('compte les dates comprises entre deux bornes incluses', () => {
    const dates = ['2025-01-01', '2025-01-01', '2025-02-10', '2025-03-05', '2025-06-30'];
    expect(compterEntre(dates, '2025-01-01', '2025-03-05')).toBe(4);
    expect(compterEntre(dates, '2025-01-02', '2025-06-29')).toBe(2);
    expect(compterEntre(dates, '2025-07-01', '2025-12-31')).toBe(0);
  });

  it('début des 12 mois calendaires', () => {
    expect(debutDouzeMois('2026-10-12')).toBe('2025-11-01');
    expect(debutDouzeMois('2026-01-31')).toBe('2025-02-01');
  });
});

describe('thèmes', () => {
  const t = new KeywordThemeClassifier();
  it('classe par mots du titre, sans accents', () => {
    expect(t.classer('Projet de loi de finances pour 2026')).toBe('Budget');
    expect(t.classer('Projet de loi de financement de la sécurité sociale pour 2026')).toBe('Santé, social');
    expect(t.classer("Proposition de loi visant à sortir la France du piège du narcotrafic")).toBe('Sécurité, justice');
    expect(t.classer("Projet de loi autorisant l'approbation de la convention fiscale")).toBe('International');
    expect(t.classer('Texte sans mot connu')).toBe('Autres');
  });
});
