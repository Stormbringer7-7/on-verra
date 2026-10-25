// « Où en sont les textes » : briques du cœur (dates, délais constitutionnels, médiane, files,
// ordre des attentes hors du Parlement) et filtres du handler, sur des positions construites ici.

import { describe, expect, it } from 'vitest';

import { HorlogeFixe } from '../../src/infra/memoire/horloge';
import { SansSynthese } from '../../src/infra/SansSynthese';
import { ajouterJours, ajouterUnMois, delai, files, horsParlement, joursEntre, lecturesAvancement, mediane } from '../../src/lectures/avancement';
import type { Depots, PositionTexte } from '../../src/ports';

const position = (dossier: string, libelle: string, jours: number | null, extra: Partial<PositionTexte> = {}): PositionTexte => ({
  dossier,
  origine: 'parlementaire',
  etape: { cle: 'lecture_1_o', libelle, lieu: 'AN' },
  situation: 'en_attente',
  depuis: jours === null ? null : ajouterJours('2026-10-24', -jours),
  jours,
  horsParlement: null,
  ...extra,
});

describe('dates et délais', () => {
  it('un mois : même quantième, ramené à la fin du mois', () => {
    expect(ajouterUnMois('2026-10-17')).toBe('2026-11-17');
    expect(ajouterUnMois('2026-01-31')).toBe('2026-02-28');
    expect(ajouterUnMois('2026-12-15')).toBe('2027-01-15');
  });

  it('quinze jours pour promulguer, un mois au Conseil, aucun délai pour le JO', () => {
    expect(delai('promulgation', '2026-10-01')?.limite).toBe('2026-10-16');
    expect(delai('decision_cc', '2026-10-17')?.limite).toBe('2026-11-17');
    expect(delai('publication_jo', '2026-10-01')).toBeNull();
    expect(delai('promulgation', null)).toBeNull();
    expect(joursEntre('2026-10-16', '2026-10-24')).toBe(8);
  });

  it('médiane : valeur du milieu, moyenne arrondie des deux du milieu', () => {
    expect(mediane([])).toBeNull();
    expect(mediane([9, 1, 5])).toBe(5);
    expect(mediane([1, 2, 3, 10])).toBe(3);
  });
});

describe('files et attentes hors du Parlement', () => {
  it('files dans l’ordre du parcours, libellé inconnu à la fin ; médiane sans les non datés', () => {
    const f = files([
      position('a', 'Conseil constit.', 3),
      position('b', 'Dépôt', 400),
      position('c', 'Dépôt', null),
      position('d', 'Étape inconnue', 1),
      position('e', 'Dépôt', 100, { situation: 'en_examen', origine: null }),
    ]);
    expect(f.map((x) => x.etape)).toEqual(['Dépôt', 'Conseil constit.', 'Étape inconnue']);
    expect(f[0]).toMatchObject({ enExamen: 1, enAttente: 2, attenteMediane: 250, parOrigine: { parlementaire: 2, inconnue: 1 } });
    expect(f[0].plusAncien.dossier).toBe('b');
  });

  it('dépassements d’abord, puis par ancienneté ; rien n’est dépassé avant la limite', () => {
    const a = horsParlement(
      [
        position('cc', 'Conseil constit.', 7, { horsParlement: 'decision_cc', situation: 'en_examen' }),
        position('pr', 'Vote du texte de la CMP', 23, { horsParlement: 'promulgation' }),
        position('jo', 'Promulgation', 40, { horsParlement: 'publication_jo' }),
        position('x', 'Séance AN', 900),
      ],
      '2026-10-24',
    );
    expect(a.map((x) => [x.position.dossier, x.retard, x.qui])).toEqual([
      ['pr', 8, 'PR'],
      ['jo', 0, 'GOUVERNEMENT'],
      ['cc', 0, 'CC'],
    ]);
  });
});

describe('handler : filtres et pagination', () => {
  const positions = [
    position('a', 'Dépôt', 10),
    position('b', 'Dépôt', 30, { origine: 'gouvernement' }),
    position('c', 'Vote du texte de la CMP', 20, { horsParlement: 'promulgation' }),
  ];
  const depots = {
    dossiers: {
      positions: async () => ({ dateReference: '2026-10-24', indetermines: 2, positions }),
      textesEnAttente: async (ps: PositionTexte[]) =>
        ps.map(({ dossier, horsParlement: _h, ...p }) => ({ ...p, dossier: { id: dossier, titre: dossier }, dernierActe: null, prochaineEcheance: null })),
    },
  } as unknown as Depots;
  const { ConsulterAvancement } = lecturesAvancement({ depots, synthetiseur: new SansSynthese(), horloge: new HorlogeFixe() });
  const ids = async (demande: Parameters<typeof ConsulterAvancement>[0]) =>
    (await ConsulterAvancement(demande, {} as never)).textes.elements.map((t) => t.dossier.id);

  it('du plus ancien au plus récent ; files et attentes calculées sans les filtres', async () => {
    const sortie = await ConsulterAvancement({ etape: 'Dépôt' }, {} as never);
    expect(sortie.textes.elements.map((t) => t.dossier.id)).toEqual(['b', 'a']);
    expect(sortie.files.map((f) => f.etape)).toEqual(['Dépôt', 'Vote du texte de la CMP']);
    expect(sortie.horsParlement.map((h) => h.texte.dossier.id)).toEqual(['c']);
    expect(sortie.horsParlement[0].depassement).toMatchObject({ jours: 5, statut: 'a_verifier' });
    expect([sortie.total, sortie.indetermines]).toEqual([3, 2]);
  });

  it('origine, hors Parlement, page', async () => {
    expect(await ids({ origine: 'gouvernement' })).toEqual(['b']);
    expect(await ids({ horsParlement: true })).toEqual(['c']);
    const page2 = await ConsulterAvancement({ taille: 2, page: 2 }, {} as never);
    expect(page2.textes).toMatchObject({ page: 2, taille: 2, total: 3, suivante: null });
    expect(page2.textes.elements.map((t) => t.dossier.id)).toEqual(['a']);
  });

  it('entrée mal formée : 400', async () => {
    await expect(ConsulterAvancement({ origine: 'personne' as never }, {} as never)).rejects.toMatchObject({ statut: 400 });
    await expect(ConsulterAvancement({ etape: 'x'.repeat(81) }, {} as never)).rejects.toMatchObject({ statut: 400 });
  });
});
