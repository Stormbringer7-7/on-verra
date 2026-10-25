// Hémicycle : un tracé par couleur, un sous-tracé (deux arcs) par siège, rien de perdu ni d'ajouté.

import { describe, expect, it } from 'vitest';

import { disposerSieges, tracesParCouleur } from '../src/ui/components/disposition';

describe('tracesParCouleur', () => {
  const { sieges, rayonPoint } = disposerSieges(577, 358);
  const couleurs = sieges.map((_, i) => (i < 200 ? '#e11' : i < 400 ? '#11e' : '#888'));
  const traces = tracesParCouleur(sieges, couleurs, rayonPoint);

  it('regroupe les sièges par couleur, dans l’ordre de première apparition', () => {
    expect(traces.map((t) => t.couleur)).toEqual(['#e11', '#11e', '#888']);
  });

  it('garde un point par siège', () => {
    const points = traces.reduce((n, t) => n + (t.d.match(/M/g) ?? []).length, 0);
    expect(points).toBe(577);
    expect((traces[0].d.match(/M/g) ?? []).length).toBe(200);
  });

  it('place chaque point à sa position (bord gauche du cercle, à la hauteur du centre)', () => {
    const premier = traces[0].d.match(/^M([\d.-]+) ([\d.-]+)/)!;
    expect(Number(premier[1])).toBeCloseTo(sieges[0].x - rayonPoint, 1);
    expect(Number(premier[2])).toBeCloseTo(sieges[0].y, 1);
  });

  it('ignore un siège sans couleur', () => {
    expect(tracesParCouleur(sieges.slice(0, 3), ['#e11'], rayonPoint)[0].d.match(/M/g)).toHaveLength(1);
  });
});
