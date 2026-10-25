// Recherche par familles : règles du contrat (numéros officiels, plan, assemblage), demande
// envoyée par l'écran, ce qu'ouvre un résultat, et rendu d'une section sur les fixtures.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DISPONIBLES, FAMILLES_RECHERCHE, analyserNumero, planRecherche } from '../src/core/domain/familles';
import { fixtures } from '../src/infra/fixtures';
import { CATALOGUE } from '../src/infra/fixtures/familles';
import { demandeFamilles, libelleCompte, ficheDe, ouverture } from '../src/ui/recherche';
import { Section } from '../src/ui/components/recherche/Resultats';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const exemple = (titre: string) => fixtures.ChercherParFamilles.find((e) => e.titre === titre)!.output;

describe('numéros officiels', () => {
  it('reconnus avec ce qu’ils peuvent désigner', () => {
    expect(analyserNumero('CE123')).toEqual({ saisi: 'CE123', numero: 'CE123', cibles: ['amendements'] });
    expect(analyserNumero('com 56')?.numero).toBe('COM-56');
    expect(analyserNumero('amendement n° 655')).toMatchObject({ numero: '655', cibles: ['amendements'] });
    expect(analyserNumero('655')?.cibles).toEqual(['amendements', 'votes', 'questions']);
    expect(analyserNumero('n°655')?.numero).toBe('655');
    expect(analyserNumero('Scrutin n° 1874')).toMatchObject({ numero: '1874', cibles: ['votes'] });
    expect(analyserNumero('question 4521')?.cibles).toEqual(['questions']);
    expect(analyserNumero('rapport 1234')?.cibles).toEqual(['rapports']);
    expect(analyserNumero('énergie')).toBeNull();
    expect(analyserNumero('loi énergie 2035')).toBeNull();
  });
});

describe('plan et assemblage', () => {
  it('toutes les déclinaisons cherchables, aperçu de 2 (parcourir) ou 3 (recherche), liste paginée pour une seule', () => {
    expect(planRecherche({}, { page: 3, taille: 20 })).toMatchObject({ q: null, declinaisons: DISPONIBLES, taille: 2, page: 1, detail: false });
    expect(planRecherche({ q: 'énergie' }, { page: 1, taille: 20 }).taille).toBe(3);
    expect(planRecherche({ q: 'x', famille: 'lois' }, { page: 1, taille: 20 }).declinaisons).toEqual(['dossiers', 'articles']);
    expect(planRecherche({ q: 'x', famille: 'personnes', declinaisons: ['deputes'] }, { page: 2, taille: 20 })).toMatchObject({ detail: true, page: 2, taille: 20 });
  });

  it('les familles sont comptées sans le filtre de famille ; une déclinaison indisponible n’a pas de compte', () => {
    const tous = exemple('« énergie », toutes les familles');
    const deputes = exemple('« énergie » · Personnes › Députés');
    expect(deputes.familles).toEqual(tous.familles);
    expect(deputes.sections.map((s) => s.declinaison)).toEqual(['deputes']);
    const indispo = tous.familles.flatMap((f) => f.declinaisons).filter((d) => d.indisponible !== null);
    expect(indispo.map((d) => d.declinaison)).toEqual(['etapes', 'auditionnes', 'circonscriptions', 'rapports', 'deports']);
    for (const d of indispo) expect(d.compte).toBeNull();
  });

  it('un numéro exact remplace les sections ; ambigu, ses candidats se distinguent par leur contexte', () => {
    const exact = exemple('Un numéro : résultat exact (CE123)');
    expect(exact.numero?.candidats.map((c) => c.id)).toEqual(['amdt-ce123']);
    expect(exact.sections).toEqual([]);
    const ambigu = exemple('Un numéro ambigu : deux amendements n° 655');
    expect(ambigu.numero?.candidats).toHaveLength(2);
    expect(new Set(ambigu.numero!.candidats.map((c) => c.contexte)).size).toBe(2);
  });

  it('six familles, dans l’ordre du design ; le catalogue des fixtures couvre chaque déclinaison cherchable', () => {
    expect(FAMILLES_RECHERCHE.map((f) => f.famille)).toEqual(['lois', 'personnes', 'institutions', 'territoires', 'action', 'transparence']);
    for (const d of DISPONIBLES) expect(CATALOGUE.some((x) => x.r.declinaison === d), d).toBe(true);
  });
});

describe('écran', () => {
  it('demande : sans mot on parcourt, un numéro se cherche dès un chiffre, pas de clé inutile', () => {
    expect(demandeFamilles(' ', null, [], 1)).toEqual({});
    expect(demandeFamilles('é', null, [], 1)).toEqual({});
    expect(demandeFamilles('7', null, [], 1)).toEqual({ q: '7' });
    expect(demandeFamilles(' énergie ', 'personnes', ['deputes'], 1)).toEqual(fixtures.ChercherParFamilles[2].input);
    expect(demandeFamilles('loi', null, ['deputes'], 3)).toEqual({ q: 'loi', page: 3 });
  });

  it('toucher un résultat filtre (Explorer) ; « Fiche » ouvre l’objet seul, sinon la personne ou le dossier qu’il filtre', () => {
    const r = (id: string) => CATALOGUE.find((x) => x.r.id === id)!.r;
    for (const id of ['dossier-energie', 'ri-enr', 'assemblee-nationale', 'question-qe-4521', 'departement-33']) {
      const x = r(id);
      const o = ouverture(x);
      if (x.filtres && Object.keys(x.filtres).length) expect(o, id).toEqual({ ecran: 'explorer', filtres: x.filtres });
      else expect(o, id).toEqual(ficheDe(x));
    }
    expect(ficheDe(r('dossier-energie'))).toEqual({ ecran: 'dossier', id: 'dossier-energie' });
    expect(ficheDe(r('ri-enr'))).toEqual({ ecran: 'representant', id: 'ri-enr' });
    expect(ficheDe(r('assemblee-nationale'))).toEqual({ ecran: 'institution', institution: 'an' });
    expect(ficheDe(r('question-qe-4521'))).toEqual({ ecran: 'personne', id: 'hugo-fictif' });
    expect(ficheDe(r('departement-33'))).toBeNull();
    expect(libelleCompte({ nombre: 1000, plafonne: true }, String)).toBe('1000+');
  });

  it('une section : sa déclinaison, son nombre, ses résultats, « Voir les… » en aperçu', () => {
    const s = exemple('Parcourir : toutes les familles').sections.find((x) => x.declinaison === 'amendements')!;
    const t = texte(renderToStaticMarkup(<Section s={s} detail={false} voirTout={() => {}} page={() => {}} />));
    expect(t).toContain('Amendements');
    expect(t).toContain('4 résultats');
    expect(t).toContain('Amendement CE123');
    expect(t).toContain('Voir les 4 →');
  });
});
