// « Mes suivis » : entrées refusées (400) et identifiants inconnus rendus à part, sur la mémoire.

import { describe, expect, it } from 'vitest';

import { memoire } from '../../src/infra/memoire';
import { commande, coreDeTest } from '../support';

describe('ConsulterSuivis', () => {
  const m = memoire();
  const bus = coreDeTest(m.depots, { synthetiseur: m.synthetiseur, horloge: m.horloge });
  const suivis = (input: Parameters<typeof commande<'ConsulterSuivis'>>[1]) => bus.execute(commande('ConsulterSuivis', input));

  it('refuse une date mal formée, future ou de plus d’un an, et trop d’identifiants', async () => {
    for (const depuis of ['hier', '2026-13-01', '2026-12-01', '2025-01-01']) {
      await expect(suivis({ dossiers: [], personnes: [], depuis }), depuis).rejects.toMatchObject({ statut: 400 });
    }
    const trop = Array.from({ length: 51 }, (_, i) => `d${i}`);
    await expect(suivis({ dossiers: trop, personnes: [], depuis: '2026-10-01' })).rejects.toMatchObject({ statut: 400 });
    await expect(suivis({ dossiers: [3 as never], personnes: [], depuis: '2026-10-01' })).rejects.toMatchObject({ statut: 400 });
  });

  it('rien de suivi : aucune lecture, réponse vide', async () => {
    const s = await suivis({ dossiers: [], personnes: [], depuis: '2026-10-01' });
    expect([s.evenements, s.dossiers, s.personnes, s.inconnus]).toEqual([[], [], [], []]);
  });

  it('identifiants inconnus : rendus dans `inconnus`, jamais une erreur', async () => {
    const s = await suivis({ dossiers: ['dossier-energie', 'nulle-part'], personnes: ['personne-x'], depuis: '2026-10-01' });
    expect(s.inconnus).toEqual(['nulle-part', 'personne-x']);
    expect(s.dossiers.map((d) => d.id)).toEqual(['dossier-energie']);
    expect(s.evenements.every((e) => e.type === 'acte' && e.dossier.id === 'dossier-energie')).toBe(true);
  });
});
