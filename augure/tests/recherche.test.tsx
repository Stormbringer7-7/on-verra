// Recherche par familles : règles du contrat (numéros officiels, plan, assemblage), demande
// envoyée par l'écran, ce qu'ouvre un résultat, et rendu d'une section sur les fixtures.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  DISPONIBLES,
  FAMILLES_RECHERCHE,
  LIEN_PERSONNE,
  TEXTE_LONGUEUR_MAX,
  TEXTES_MAX,
  analyserNumero,
  expressions,
  expressionsInvalides,
  planRecherche,
} from '../src/core/domain/familles';
import { occurrences } from '../src/core/domain/texte';
import { fixtures } from '../src/infra/fixtures';
import { CATALOGUE } from '../src/infra/fixtures/familles';
import { ajouterExpression, demandeFamilles, libelleCompte, ficheDe, ouverture, surligner } from '../src/ui/recherche';
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

describe('expressions et personne', () => {
  it('expressions nettoyées (espaces, doublons sans casse ni accents), bornées', () => {
    expect(expressions(['  Silence   pour la France ', 'silence pour la france', '', 'Défense'])).toEqual(['Silence pour la France', 'Défense']);
    expect(expressionsInvalides(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(`Au plus ${TEXTES_MAX} expressions`);
    expect(expressionsInvalides(['x'.repeat(TEXTE_LONGUEUR_MAX + 1)])).toMatch(/^Expression trop longue/);
    expect(expressionsInvalides(['Silence pour la France'])).toBeNull();
  });

  it('mot pour mot : casse, accents et ponctuation ignorés, jamais une autre forme', () => {
    expect(occurrences('« Silence, pour la France ! »', 'silence pour la france')).toEqual([[2, 25]]);
    expect(occurrences('Les silences pour la France', 'Silence pour la France')).toEqual([]);
    expect(surligner('Il dit : silence pour la France.', ['Silence pour la France'])).toEqual([
      { texte: 'Il dit : ', surligne: false },
      { texte: 'silence pour la France', surligne: true },
      { texte: '.', surligne: false },
    ]);
    expect(surligner('Rien ici', ['absent'])).toEqual([{ texte: 'Rien ici', surligne: false }]);
  });

  it('plan : sous le filtre personne, seules les déclinaisons liées par un lien publié ; pas de numéro avec un filtre', () => {
    const plan = planRecherche({ q: '655', textes: [' plan  de financement '], personne: 'p1' }, { page: 1, taille: 20 });
    expect(plan).toMatchObject({ textes: ['plan de financement'], personne: 'p1', numero: null, taille: 3 });
    expect(plan.declinaisons).toEqual(DISPONIBLES.filter((d) => LIEN_PERSONNE[d] !== null));
    expect(plan.declinaisons).not.toContain('commissions');
    expect(planRecherche({ q: '655' }, { page: 1, taille: 20 }).numero).not.toBeNull();
  });

  it('exemple : une expression et une personne ; les déclinaisons sans lien publié le disent, sans compte', () => {
    const r = exemple('Une expression et une personne : « plan de financement » · Camille Exemple');
    expect(r.textes).toEqual(['plan de financement']);
    expect(r.personne?.nom).toBe('Camille Exemple');
    expect(r.sections.map((s) => [s.declinaison, s.resultats.elements.map((e) => e.id)])).toEqual([['interventions', ['intervention-camille-art5']]]);
    const hors = r.familles.flatMap((f) => f.declinaisons).filter((d) => d.horsPersonne !== null);
    expect(hors.map((d) => d.declinaison)).toEqual(['articles', 'groupes', 'chambres', 'commissions', 'enquetes', 'departements', 'lobbying']);
    for (const d of hors) expect(d.compte).toBeNull();
  });

  it('écran : expressions et personne dans la demande, sans clé inutile', () => {
    expect(demandeFamilles('', null, [], 1, { textes: ['Silence pour la France', ' '], personne: 'p1' })).toEqual({
      textes: ['Silence pour la France'],
      personne: 'p1',
    });
    expect(demandeFamilles('budget', null, [], 1, { textes: [], personne: null })).toEqual({ q: 'budget' });
    expect(ajouterExpression(['a b'], ' A  B ')).toEqual(['a b']);
    expect(ajouterExpression(['un', 'deux', 'trois', 'quatre', 'cinq'], 'six')).toHaveLength(TEXTES_MAX);
  });

  it('une section surligne l’expression dans l’extrait et propose « Filtrer » sur une personne', () => {
    const r = exemple('« énergie », toutes les familles');
    const deputes = r.sections.find((s) => s.declinaison === 'deputes')!;
    const html = renderToStaticMarkup(<Section s={deputes} detail={false} voirTout={() => {}} page={() => {}} filtrerPersonne={() => {}} />);
    expect(texte(html)).toContain('Filtrer');
    const interventions = exemple('Une expression et une personne : « plan de financement » · Camille Exemple').sections[0];
    const surligne = renderToStaticMarkup(
      <Section s={interventions} detail={false} voirTout={() => {}} page={() => {}} textes={['plan de financement']} />,
    );
    expect(surligne).toMatch(/background-color[^"]*"[^>]*>plan de financement</);
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
