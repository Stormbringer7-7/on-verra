// Zoom (ZoomPan), hémicycle cliquable et carte des départements : calculs sans React, et rendu
// des écrans qui les portent (react-native-web + react-dom/server).
//
// Les valeurs de carte de ce fichier sont FACTICES (tests seulement) : aucun écran n'en montre.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { GroupeRef } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { CarteDepartements } from '../src/ui/components/carte/CarteDepartements';
import { CADRE_CARTE, DEPARTEMENTS, ENCARTS } from '../src/ui/components/carte/departements';
import { chemin, classeDe, classes, dansAnneau, melange, TERRITOIRES, territoireSous } from '../src/ui/components/carte/geometrie';
import { disposerSieges } from '../src/ui/components/disposition';
import { detailVote, Hemicycle } from '../src/ui/components/dossiers/Hemicycle';
import { siegesScrutin } from '../src/ui/components/dossiers/presentation';
import { choisir, libelleHemicycle, type SiegeHemicycle } from '../src/ui/components/hemicycle/HemicycleZoom';
import { borner, doubleTap, facteurMolette, plusProche, versContenu, VUE_INITIALE, zoomerEn } from '../src/ui/components/zoom/geometrie';

const B = { largeur: 400, hauteur: 200, min: 1, max: 8 };

describe('zoom : calculs', () => {
  it('le point sous le doigt reste sous le doigt', () => {
    const v = zoomerEn(VUE_INITIALE, 2, 100, 50, B);
    expect(v.echelle).toBe(2);
    expect(versContenu(v, 100, 50)).toEqual({ x: 100, y: 50 });
  });

  it('bornes : échelle entre 1 et le maximum, jamais de vide sur les bords', () => {
    expect(zoomerEn(VUE_INITIALE, 100, 0, 0, B).echelle).toBe(8);
    expect(zoomerEn(VUE_INITIALE, 0.1, 0, 0, B)).toEqual(VUE_INITIALE);
    const v = borner({ echelle: 2, x: 50, y: -1000 }, B);
    expect(v).toEqual({ echelle: 2, x: 0, y: -200 });
  });

  it('double tap : ×2,5 autour du point, puis retour à la vue entière au maximum', () => {
    const v = doubleTap(VUE_INITIALE, 200, 100, B);
    expect(v.echelle).toBe(2.5);
    expect(doubleTap({ echelle: 8, x: -100, y: -100 }, 10, 10, B)).toEqual(VUE_INITIALE);
  });

  it('molette : vers le haut zoome, vers le bas dézoome, symétrique', () => {
    expect(facteurMolette(-100)).toBeGreaterThan(1);
    expect(facteurMolette(100) * facteurMolette(-100)).toBeCloseTo(1);
  });

  it('point le plus proche dans un rayon, sinon aucun', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(plusProche(pts, 8, 1, 5)).toBe(1);
    expect(plusProche(pts, 50, 50, 5)).toBe(-1);
  });
});

describe('hémicycle : un siège touché', () => {
  const g = (id: string): GroupeRef => ({ id, abrege: id, libelle: `Groupe ${id}`, couleur: '#123456', sourceCouleur: 'officielle', chambre: 'AN' });
  const sieges: SiegeHemicycle[] = [
    { couleur: '#123456', groupe: g('A'), personne: { id: 'p1', nom: 'Camille Exemple' } },
    { couleur: '#123456', groupe: g('A') },
    { couleur: '#654321', groupe: g('B') },
  ];
  const { sieges: points, rayonPoint } = disposerSieges(3, 360);

  it('siège d’une personne → la personne ; siège de groupe → le groupe, relâché au second toucher', () => {
    const [p0, p1] = points;
    expect(choisir(sieges, points, rayonPoint, p0.x, p0.y, 1, null)).toEqual({ type: 'siege', index: 0 });
    expect(choisir(sieges, points, rayonPoint, p1.x, p1.y, 1, null)).toEqual({ type: 'groupe', id: 'A' });
    expect(choisir(sieges, points, rayonPoint, p1.x, p1.y, 1, 'A')).toBeNull();
    expect(choisir(sieges, points, rayonPoint, -500, -500, 1, null)).toBeNull();
  });

  it('scrutin : chaque siège est un parlementaire (votes nominatifs), dans l’ordre des groupes', () => {
    const f = fixtures.ConsulterScrutin[0].output;
    const camille = f.votes.find((v) => v.personne.nom === 'Camille Exemple')!;
    expect(detailVote(camille)).toBe('− CONTRE');
    expect(detailVote({ ...camille, parDelegation: true, miseAuPoint: 'Selon la mise au point publiée, voulait voter pour' })).toBe(
      '− CONTRE · par délégation · Selon la mise au point publiée, voulait voter pour',
    );
    const ordre = [...new Set(f.votes.map((v) => v.personne.groupe?.id))];
    expect(ordre).toEqual([...f.groupes].sort((a, b) => a.rang - b.rang).map((x) => x.groupe.id));
    const html = renderToStaticMarkup(<Hemicycle groupes={f.groupes} votes={f.votes} onPersonne={() => {}} />);
    expect(html).toContain('Touchez un siège pour voir qui y siège');
    expect(html).toContain('Liste des sièges, groupe par groupe');
    // Institutions : chaque député, sièges de 577 (gauche) à 1 (droite)
    const an = fixtures.ConsulterInstitution.find((e) => e.input.institution === 'an')!.output;
    if (an.type !== 'an') throw new Error('Assemblée attendue');
    expect(an.membres.map((m) => m.siege)).toEqual(an.membres.map((_, i) => 577 - i));
  });

  it('sans votes nominatifs : un siège par groupe, aucune personne inventée', () => {
    const f = fixtures.ConsulterScrutin[0].output;
    const s = siegesScrutin(f.groupes);
    expect(s.length).toBe(f.groupes.reduce((n, x) => n + x.decompte.pour + x.decompte.contre + x.decompte.abstention + x.nonVotants + x.absents, 0));
    expect(s.every((x) => !('personne' in x))).toBe(true);
    // groupes de la gauche vers la droite, comme le dit `rang`
    const ordre = [...new Set(s.map((x) => x.groupe.id))];
    expect(ordre).toEqual([...f.groupes].sort((a, b) => a.rang - b.rang).map((x) => x.groupe.id));
  });

  it('libellé lisible : chaque groupe et son nombre de sièges', () => {
    expect(libelleHemicycle(sieges, 'Hémicycle')).toBe('Hémicycle : Groupe A 2, Groupe B 1');
  });
});

describe('carte des départements', () => {
  it('les 101 départements, plus l’outre-mer représenté au Parlement ; ni TAAF ni Clipperton', () => {
    const codes = new Set(DEPARTEMENTS.map((d) => d.code));
    const metropole = [...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((c) => c !== '20'), '2A', '2B'];
    for (const c of [...metropole, '971', '972', '973', '974', '976', '975', '977', '978', '986', '987', '988']) expect(codes.has(c), c).toBe(true);
    expect(codes.has('984')).toBe(false);
    expect(codes.has('989')).toBe(false);
    for (const d of DEPARTEMENTS) expect(d.anneaux.length, d.code).toBeGreaterThan(0);
  });

  it('tout est dans le cadre ; l’outre-mer dans son encart, la métropole à gauche des encarts', () => {
    const debutEncarts = Math.min(...ENCARTS.map((e) => e.x));
    for (const t of TERRITOIRES) {
      expect(t.boite.x0, t.code).toBeGreaterThanOrEqual(0);
      expect(t.boite.y0, t.code).toBeGreaterThanOrEqual(0);
      expect(t.boite.x1, t.code).toBeLessThanOrEqual(CADRE_CARTE.largeur);
      expect(t.boite.y1, t.code).toBeLessThanOrEqual(CADRE_CARTE.hauteur);
      if (t.encart) {
        const e = ENCARTS.find((x) => x.code === t.code)!;
        expect(t.boite.x0 >= e.x && t.boite.x1 <= e.x + e.largeur && t.boite.y0 >= e.y && t.boite.y1 <= e.y + e.hauteur, t.code).toBe(true);
      } else expect(t.boite.x1, t.code).toBeLessThan(debutEncarts);
    }
  });

  it('Lambert-93 : Brest à l’ouest de Strasbourg, Lille au nord de Perpignan', () => {
    const centre = (c: string) => TERRITOIRES.find((t) => t.code === c)!.centre;
    expect(centre('29').x).toBeLessThan(centre('67').x);
    expect(centre('59').y).toBeLessThan(centre('66').y);
  });

  it('un toucher désigne le bon département, y compris Paris (avec marge)', () => {
    const gironde = TERRITOIRES.find((t) => t.code === '33')!;
    // un sommet du contour, poussé vers le centre : à l'intérieur
    const [x, y] = [gironde.anneaux[0][0] * 0.9 + gironde.centre.x * 0.1, gironde.anneaux[0][1] * 0.9 + gironde.centre.y * 0.1];
    expect(dansAnneau(gironde.anneaux[0], gironde.centre.x, gironde.centre.y) || territoireSous(x, y) === '33').toBe(true);
    const paris = TERRITOIRES.find((t) => t.code === '75')!;
    expect(territoireSous(paris.centre.x, paris.centre.y, 2)).toBe('75');
    expect(territoireSous(-50, -50)).toBeNull();
  });

  it('tracé SVG : un sous-chemin fermé par anneau', () => {
    expect(chemin([[0, 0, 10, 0, 10, 10]])).toBe('M0 0L10 0L10 10Z');
  });

  it('échelle séquentielle : classes d’égale amplitude, valeur rangée dans sa classe', () => {
    const cl = classes([0, 50, 100], ['#000001', '#000002', '#000003', '#000004']);
    expect(cl.map((c) => [c.min, c.max])).toEqual([
      [0, 25],
      [25, 50],
      [50, 75],
      [75, 100],
    ]);
    expect(classeDe(60, cl).couleur).toBe('#000003');
    expect(classes([], ['#000001'])).toEqual([]);
    expect(melange('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('rendu : sans valeur, chaque département est « pas de donnée » ; légende et liste disponibles', () => {
    const html = renderToStaticMarkup(<CarteDepartements valeurs={{ '33': 12, '75': 40 }} titre="Valeur factice (test)" />);
    expect(html).toContain('Valeur factice (test)');
    expect(html).toContain('Pas de donnée');
    expect(html).toContain('Voir la liste des départements');
  });
});
