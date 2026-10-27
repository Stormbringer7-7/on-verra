// Carte d'un scrutin par circonscription : contours (même cadre que les départements, chaque
// circonscription dans son département), états d'une circonscription, rendu de la carte et de
// l'écran (react-native-web + react-dom/server).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CARTE_SCRUTIN_1874_CIRCONSCRIPTIONS } from '../src/infra/fixtures/territoires';
import { CarteCirconscriptions, etatDe } from '../src/ui/components/carte/CarteCirconscriptions';
import { CIRCONSCRIPTIONS } from '../src/ui/components/carte/circonscriptions';
import { CADRE_CARTE } from '../src/ui/components/carte/departements';
import { contourSous, preparer, TERRITOIRES } from '../src/ui/components/carte/geometrie';
import { LectureCarte } from '../src/ui/components/territoires/LectureCarte';

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('contours des circonscriptions', () => {
  it('561 circonscriptions, codes « département-numéro », numéros consécutifs par département', () => {
    expect(CIRCONSCRIPTIONS).toHaveLength(561);
    for (const c of CIRCONSCRIPTIONS) expect(c.code).toBe(`${c.departement}-${String(c.numero).padStart(2, '0')}`);
    const parDep = new Map<string, number[]>();
    for (const c of CIRCONSCRIPTIONS) parDep.set(c.departement, [...(parDep.get(c.departement) ?? []), c.numero]);
    for (const [dep, nums] of parDep) expect(nums, dep).toEqual(nums.map((_, i) => i + 1));
    expect(parDep.get('75')).toHaveLength(18);
    expect(parDep.get('971')).toHaveLength(4);
  });

  it('même cadre que les départements : chaque circonscription tombe dans son département', () => {
    const prets = preparer(CIRCONSCRIPTIONS);
    let hors = 0;
    for (const c of prets) {
      expect(c.boite.x0).toBeGreaterThanOrEqual(0);
      expect(c.boite.x1).toBeLessThanOrEqual(CADRE_CARTE.largeur);
      expect(c.boite.y1).toBeLessThanOrEqual(CADRE_CARTE.hauteur);
      const dep = TERRITOIRES.find((t) => t.code === c.departement)!;
      expect(dep, c.code).toBeDefined();
      // Le centre de la circonscription est dans son département (marge : contours simplifiés à part).
      if (contourSous([dep], c.centre.x, c.centre.y, 3) !== dep.code) hors++;
    }
    expect(hors).toBeLessThanOrEqual(5);
  });
});

describe('carte par circonscription', () => {
  const carte = CARTE_SCRUTIN_1874_CIRCONSCRIPTIONS;

  it('état : position du député, vacante sans député, pas de donnée sans ligne', () => {
    expect(carte.circonscriptions.map(etatDe)).toEqual(['pour', 'vacante', 'contre', 'abstention', 'contre']);
    expect(etatDe(undefined)).toBe('sans_donnee');
  });

  it('rendu : légende avec les comptes, liste et source des contours', () => {
    const t = texte(renderToStaticMarkup(<CarteCirconscriptions circonscriptions={carte.circonscriptions} onPersonne={() => {}} />));
    expect(t).toContain('Position du député');
    expect(t).toContain('Pour : 1');
    expect(t).toContain('Contre : 2');
    expect(t).toContain('Siège vacant : 1');
    expect(t).toContain('Pas de donnée : 556');
    expect(t).toContain('Voir la liste des circonscriptions');
    expect(t).toContain('Contours : Licence Ouverte — INSEE');
  });

  it('écran : la carte d’un scrutin au niveau circonscription montre les circonscriptions, pas les départements', () => {
    const t = texte(renderToStaticMarkup(<LectureCarte carte={carte} onDepartement={() => {}} onPersonne={() => {}} />));
    expect(t).toContain('Position du député');
    expect(t).not.toContain('Voir la liste des départements');
    expect(t).toContain('une circonscription sans député ce jour-là est dite vacante');
  });
});
