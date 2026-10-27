// Répartition des voix d'un scrutin (écran Scrutin) : calculs sur les votes nominatifs du scrutin
// n° 1874 des fixtures, cohérence avec sa carte (fixtures Territoires), rendu des composants.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { fixtures } from '../src/infra/fixtures';
import { CarteScrutin } from '../src/ui/components/scrutin/CarteScrutin';
import { ListeNominative } from '../src/ui/components/scrutin/ListeNominative';
import { EcartsParGroupe, TableauRepartition } from '../src/ui/components/scrutin/Repartition';
import {
  cohesion,
  compter,
  ecartsParGroupe,
  filtrer,
  lignesDesGroupes,
  parDepartement,
  parGroupe,
  participation,
  partExprimee,
  textePart,
  valeursCarte,
} from '../src/ui/repartition';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));

const f = fixtures.ConsulterScrutin.find((e) => e.output.scrutin.numero === '1874')!.output;
const carte = fixtures.ConsulterCarte.find((e) => e.input.mesure === 'scrutin')!.output;
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('répartition : calculs', () => {
  it('les comptes redonnent le décompte publié, groupe par groupe', () => {
    const c = compter(f.votes);
    expect([c.pour, c.contre, c.abstention]).toEqual([f.scrutin.decompte.pour, f.scrutin.decompte.contre, f.scrutin.decompte.abstention]);
    expect(c.absent).toBe(f.absents);
    for (const l of parGroupe(f.votes, f.groupes)) {
      const g = f.groupes.find((x) => x.groupe.id === l.cle)!;
      expect([l.comptes.pour, l.comptes.contre, l.comptes.abstention, l.comptes.non_votant, l.comptes.absent], g.groupe.abrege).toEqual([
        g.decompte.pour, g.decompte.contre, g.decompte.abstention, g.nonVotants, g.absents,
      ]);
      expect(l.comptes.membres).toBe(g.membres);
    }
  });

  it('cohésion : votes exprimés qui suivent la ligne nationale du groupe, écarts = votes différents publiés', () => {
    const { suivent, ecarts } = cohesion(f.votes, lignesDesGroupes(f.groupes));
    expect(suivent.n + ecarts.length).toBe(suivent.base);
    expect(ecarts.length).toBe(f.votesDifferents.total);
    expect(ecartsParGroupe(f.votes, f.groupes).flatMap((e) => e.ecarts.map((v) => v.personne.id))).toEqual(
      expect.arrayContaining(f.votesDifferents.personnes.map((p) => p.personne.id)),
    );
  });

  it('parts toujours avec leur base ; pas de base : pas de valeur', () => {
    const c = compter(f.votes);
    expect(participation(c)).toMatchObject({ base: c.membres });
    expect(partExprimee(c, 'pour').base).toBe(c.pour + c.contre + c.abstention);
    expect(textePart({ valeur: 92.857, n: 130, base: 140 })).toBe('93 % (130 sur 140)');
    expect(textePart({ valeur: null, n: 0, base: 0 })).toBe('—');
    expect(participation(compter([])).valeur).toBeNull();
  });

  it('filtres : position, groupe, département, nom sans accents', () => {
    const camille = f.votes.find((v) => v.personne.id === 'camille-exemple')!;
    expect(filtrer(f.votes, { recherche: 'CAMILLE exemple' }).map((v) => v.personne.id)).toEqual(['camille-exemple']);
    expect(filtrer(f.votes, { departement: '91' })).toEqual([camille]);
    expect(filtrer(f.votes, { departement: '91', position: 'pour' })).toEqual([]);
    expect(filtrer(f.votes, { groupe: camille.personne.groupe!.id, position: 'contre' }).some((v) => v.personne.id === 'camille-exemple')).toBe(true);
    expect(filtrer(f.votes, { departement: 'hors' }).every((v) => v.departement === null)).toBe(true);
  });

  it('la carte calculée depuis les votes redonne celle des fixtures (part des pour)', () => {
    const valeurs = valeursCarte(f.votes, f.groupes, 'pour');
    for (const d of carte.departements) expect(valeurs[d.departement.code], d.departement.code).toBe(d.valeur);
    expect(Object.keys(valeurs).sort()).toEqual(carte.departements.map((d) => d.departement.code).sort());
    // Par département, un seul élu localisé chacun dans la maquette.
    for (const l of parDepartement(f.votes, f.groupes)) if (l.departement) expect(l.comptes.membres).toBe(1);
  });

  it('écarts au groupe sur la carte : 100 % quand le seul élu vote contre sa ligne', () => {
    const v = valeursCarte(f.votes, f.groupes, 'ecarts');
    expect(v['91']).toBe(100); // Camille, contre, ligne du groupe A : pour
    expect(v['33']).toBe(0); // Hugo, pour, ligne du groupe B : pour
  });
});

describe('répartition : rendu', () => {
  it('liste nominative : onglets avec leur nombre, noms rangés par groupe, département', () => {
    const html = texte(
      renderToStaticMarkup(<ListeNominative votes={f.votes} groupes={f.groupes} filtre={{ position: 'contre' }} changer={() => {}} onPersonne={() => {}} />),
    );
    expect(html).toContain(`Contre ${f.scrutin.decompte.contre}`);
    expect(html).toContain('Camille Exemple');
    expect(html).toContain('Essonne');
    expect(html).toContain(f.groupes[0].groupe.abrege);
    expect(html).toMatch(/Voir les \d+ autres/);
  });

  it('tableau par groupe : participation et cohésion avec leur base', () => {
    const html = texte(renderToStaticMarkup(<TableauRepartition votes={f.votes} groupes={f.groupes} choisirGroupe={() => {}} choisirDepartement={() => {}} />));
    expect(html).toContain(f.groupes[0].groupe.libelle);
    expect(html).toMatch(/Participation : \d+ % \(\d+ sur \d+\)/);
    expect(html).toMatch(/Cohésion : \d+ % \(\d+ sur \d+\)/);
  });

  it('carte du scrutin et écarts par groupe', () => {
    const c = texte(renderToStaticMarkup(<CarteScrutin chambre={f.scrutin.chambre} parCirconscription={null} votes={f.votes} groupes={f.groupes} mesure="pour" choisirMesure={() => {}} onDepartement={() => {}} />));
    expect(c).toContain('Part des « pour » parmi les votes exprimés');
    expect(c).toContain('sans département');
    const e = texte(renderToStaticMarkup(<EcartsParGroupe votes={f.votes} groupes={f.groupes} onPersonne={() => {}} />));
    expect(e).toMatch(/\d+ sur \d+ exprimés/);
  });
});
