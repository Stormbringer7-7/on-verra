// Explorer (faits filtrés) : adresse ⇄ demande, ajout / remontée / retrait de filtres, phrase de
// contexte composée depuis les compteurs, et rendu de la vue sur les fixtures (sans filtre, art. 3,
// comparaison, scrutin et « contre son groupe », main levée, transparence, vide, département).

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  EXPLORER_ART3_GROUPE_A,
  EXPLORER_ART3_SEANCE,
  EXPLORER_CE123,
  EXPLORER_DEPARTEMENT,
  EXPLORER_ENERGIE,
  EXPLORER_ENERGIE_SORT_ADOPTE,
  EXPLORER_ENERGIE_TRANSPARENCE,
  EXPLORER_SCRUTIN_GROUPE_A,
  EXPLORER_TOUT,
  EXPLORER_VIDE,
} from '../src/infra/fixtures/faits';
import { VueExploration } from '../src/ui/components/explorer/Exploration';
import {
  ajouterFiltre,
  avecOnglet,
  comparerA,
  demandeExplorer,
  ongletsVisibles,
  paramsExplorer,
  phraseContexte,
  remonterA,
  retirerFamille,
  retirerFiltres,
  segmentsFil,
} from '../src/ui/explorer';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const vue = (e: Parameters<typeof VueExploration>[0]['e']) => texte(rendre(<VueExploration e={e} changer={() => {}} />));

describe('adresse ⇄ demande', () => {
  it('rien de vide : sans paramètre, la demande des fixtures « sans filtre »', () => {
    expect(demandeExplorer(undefined)).toEqual({});
    expect(demandeExplorer({ dossier: '  ', page: '1', onglet: 'inconnu' })).toEqual({});
  });

  it('l’ordre d’ajout n’est transmis qu’à partir de deux filtres (comme les fixtures)', () => {
    expect(demandeExplorer({ dossier: 'dossier-energie' })).toEqual(EXPLORER_ENERGIE.demande);
    expect(demandeExplorer({ dossier: 'dossier-energie', ordre: 'dossier' })).toEqual(EXPLORER_ENERGIE.demande);
    expect(demandeExplorer(paramsExplorer(EXPLORER_ART3_SEANCE.demande))).toEqual(EXPLORER_ART3_SEANCE.demande);
    expect(demandeExplorer(paramsExplorer(EXPLORER_SCRUTIN_GROUPE_A.demande))).toEqual(EXPLORER_SCRUTIN_GROUPE_A.demande);
  });

  it('aller-retour, comparaison seulement avec un groupe, page > 1', () => {
    const d = { filtres: { dossier: 'd', groupe: 'g' }, ordre: ['groupe' as const, 'dossier' as const], onglet: 'votes' as const, comparer: 'h', page: 2 };
    expect(demandeExplorer(paramsExplorer(d))).toEqual(d);
    expect(demandeExplorer({ dossier: 'd', comparer: 'h' })).toEqual({ filtres: { dossier: 'd' } });
  });
});

describe('fil de filtres', () => {
  const base = EXPLORER_ART3_SEANCE.demande;

  it('ajouter : devient le focal ; un autre dossier fait tomber étape et article', () => {
    expect(ajouterFiltre(base, 'groupe', 'groupe-a')).toEqual({ filtres: { ...base.filtres, groupe: 'groupe-a' }, ordre: ['dossier', 'etape', 'article', 'groupe'] });
    expect(ajouterFiltre({ filtres: { groupe: 'groupe-a' } }, 'dossier', 'd').ordre).toEqual(['groupe', 'dossier']);
    expect(ajouterFiltre(base, 'dossier', 'dossier-location').filtres).toEqual({ dossier: 'dossier-location' });
  });

  it('remonter garde le niveau touché ; × retire la famille ; sans dossier, plus d’étape', () => {
    expect(remonterA(base, 'dossier').filtres).toEqual({ dossier: base.filtres!.dossier });
    expect(retirerFamille(base, 'lois')).toEqual({});
    expect(retirerFiltres(base, ['dossier']).filtres).toEqual({ article: base.filtres!.article });
  });

  it('changer de filtre ramène onglet, regroupement et page au défaut ; comparer exige un groupe', () => {
    const d = { ...avecOnglet(base, 'amendements'), regrouper: 'groupe' as const, page: 3 };
    expect(ajouterFiltre(d, 'groupe', 'g')).not.toHaveProperty('onglet');
    expect(comparerA(base, 'groupe-c')).not.toHaveProperty('comparer');
    expect(comparerA(EXPLORER_ART3_GROUPE_A.demande, 'groupe-c').comparer).toBe('groupe-c');
  });

  it('un segment par famille, dans l’ordre d’ajout', () => {
    expect(segmentsFil(EXPLORER_SCRUTIN_GROUPE_A).map((s) => s.famille)).toEqual(['action', 'personnes']);
    expect(segmentsFil(EXPLORER_ART3_SEANCE)[0].filtres.map((f) => f.cle)).toEqual(['dossier', 'etape', 'article']);
  });
});

describe('phrase de contexte (composée par l’app, jamais rédigée ailleurs)', () => {
  it('sans filtre : tout le Parlement et les compteurs', () => {
    expect(phraseContexte(EXPLORER_TOUT)).toBe(
      'Tout le Parlement : 14 interventions, 12 amendements, 10 votes, 2 questions, 7 éléments de transparence.',
    );
  });

  it('avec filtres : le dernier niveau de chaque famille ; vide : rien pour l’instant', () => {
    expect(phraseContexte(EXPLORER_ART3_GROUPE_A)).toBe('Art. 3 · Groupe A : 2 interventions.');
    expect(phraseContexte(EXPLORER_VIDE)).toMatch(/: rien pour l’instant\.$/);
  });

  it('onglets montrés : ceux qui ont des faits, plus l’actif', () => {
    expect(ongletsVisibles(EXPLORER_VIDE)).toEqual(['interventions']);
    expect(ongletsVisibles(EXPLORER_ART3_SEANCE)).toEqual(['interventions', 'amendements', 'personnes']);
  });
});

describe('vue', () => {
  it('sans filtre : « Parcourir », onglets avec compteurs, groupes de tête, ajouter un filtre', () => {
    const t = vue(EXPLORER_TOUT);
    expect(t).toContain('Parcourir');
    expect(t).toContain('Tout le Parlement : 14 interventions');
    expect(t).toContain('Interventions 14');
    expect(t).toContain('Transparence 7');
    expect(t).toContain('Programmation énergétique 2026-2035');
    expect(t).toContain('+ Ajouter un filtre');
    expect(t).toContain('Regrouper par');
  });

  it('art. 3 en séance : fil, focal et Fiche, élargir avec le nombre', () => {
    const html = rendre(<VueExploration e={EXPLORER_ART3_SEANCE} changer={() => {}} />);
    const t = texte(html);
    expect(t).toContain('Programmation énergétique 2026-2035 › Séance AN › Art. 3');
    expect(html).toContain('aria-label="Retirer le filtre Lois"');
    expect(t).toContain('Article');
    expect(t).toContain('Fiche');
    expect(t).toContain('Élargir');
    expect(t).toContain('Tous les articles 14');
    expect(t).toContain('Groupe A');
  });

  it('comparaison de deux groupes', () => {
    const t = vue(EXPLORER_ART3_GROUPE_A);
    expect(t).toContain('Comparaison : Groupe A et Groupe C');
    expect(t).toContain('Fermer');
  });

  it('scrutin filtré et groupe : chaque député, « contre son groupe »', () => {
    const t = vue(EXPLORER_SCRUTIN_GROUPE_A);
    expect(t).toContain('Scrutin n° 1874');
    expect(t).toContain('Camille Exemple');
    expect(t).toContain('contre son groupe');
    expect(t).toContain('Louis Prototype');
  });

  it('vote à main levée : aucun vote individuel', () => {
    const t = vue(EXPLORER_CE123);
    expect(t).toContain('Amendement CE123');
    expect(t).toContain('personne n’a de vote individuel enregistré');
  });

  it('transparence : badge HATVP, statut du rapprochement, jamais présenté comme certain', () => {
    const t = vue(EXPLORER_ENERGIE_TRANSPARENCE);
    expect(t).toContain('HATVP');
    expect(t).toContain('Déclarations et transparence');
    expect(t).toMatch(/À vérifier|Vérifié/);
  });

  it('groupe déplié : tous ses faits, retour aux groupes', () => {
    const t = vue(EXPLORER_ENERGIE_SORT_ADOPTE);
    expect(t).toContain('← Tous les groupes');
  });

  it('rien ici : élargir', () => {
    const t = vue(EXPLORER_VIDE);
    expect(t).toContain('Rien ici');
    expect(t).toContain('Tous les articles 11');
    expect(t).toContain('Tous les groupes 5');
  });

  it('département : filtre pas encore disponible, dit tel quel', () => {
    const t = vue(EXPLORER_DEPARTEMENT);
    expect(t).toContain('Filtre pas encore disponible');
    expect(t).toContain('Toute la France 25');
  });

  it('jamais d’élément de débat ni de LLM', () => {
    for (const e of [EXPLORER_TOUT, EXPLORER_ART3_SEANCE, EXPLORER_ENERGIE]) expect(vue(e)).not.toMatch(/Débattre|débat simulé/i);
  });
});
