// Carte et Département : libellés (votes, positions, élus hors département) et rendu sur les
// fixtures. Tout groupe a sa pastille ; une présence est toujours comparée (attendu du groupe).
// Rendu HTML par react-native-web.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CARTE_PRESENCE_AN, CARTE_SCRUTIN_1874, DEPARTEMENT_GIRONDE, DEPARTEMENT_GIRONDE_1874 } from '../src/infra/fixtures/territoires';
import { ContenuDepartement } from '../src/ui/components/territoires/ContenuDepartement';
import { LectureCarte } from '../src/ui/components/territoires/LectureCarte';
import { formaterPourcentage, texteHorsDepartement, texteVotes, valeursCarte } from '../src/ui/territoires';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('libellés des territoires', () => {
  it('votes d’un département, sans les zéros', () => {
    expect(texteVotes({ membres: 10, pour: 3, contre: 2, abstention: 1, nonVotants: 0, absents: 4 })).toBe(
      '3 pour, 2 contre, 1 abstention · 4 absents',
    );
    expect(texteVotes({ membres: 0, pour: 0, contre: 0, abstention: 0, nonVotants: 0, absents: 0 })).toBe('Aucun vote publié');
  });

  it('valeurs par code, pourcentage à la française, élus hors département', () => {
    expect(valeursCarte(CARTE_SCRUTIN_1874)).toEqual({ '33': 100, '59': 0, '69': 0, '91': 0 });
    expect(formaterPourcentage(72.5)).toBe('72,5 %');
    expect(texteHorsDepartement(0, 'AN')).toBeNull();
    expect(texteHorsDepartement(11, 'AN')).toBe('11 députés des Français établis hors de France, sans département : pas sur la carte.');
  });
});

describe('écran Carte', () => {
  it('scrutin : en-tête du vote, carte des départements, limites telles quelles', () => {
    const t = texte(rendre(<LectureCarte carte={CARTE_SCRUTIN_1874} onDepartement={() => {}} />));
    expect(t).toContain('Scrutin n° 1874');
    expect(t).toContain(CARTE_SCRUTIN_1874.libelleValeur);
    for (const l of CARTE_SCRUTIN_1874.limites) expect(t).toContain(l);
  });

  it('présence : la carte et ses limites', () => {
    const t = texte(rendre(<LectureCarte carte={CARTE_PRESENCE_AN} onDepartement={() => {}} />));
    expect(t).toContain('Participation aux scrutins publics');
    for (const l of CARTE_PRESENCE_AN.limites) expect(t).toContain(l);
  });

  it('rien à dessiner : dit pourquoi, sans carte inventée', () => {
    const t = texte(rendre(<LectureCarte carte={{ ...CARTE_SCRUTIN_1874, departements: [] }} onDepartement={() => {}} />));
    expect(t).toContain('Aucun vote nominatif publié pour ce scrutin');
  });
});

describe('écran Département', () => {
  it('élus avec pastille de groupe, participation comparée à leur groupe', () => {
    const html = rendre(<ContenuDepartement fiche={DEPARTEMENT_GIRONDE} />);
    const t = texte(html);
    expect(t).toContain('Gironde');
    expect(t).toContain('Hugo Fictif');
    expect(t).toContain('Paul Fictif');
    expect(t).toContain('Attendu');
    expect(t).toContain('Député · Gironde, 2e circ. · Groupe B');
    // une pastille par élu, de la couleur de son groupe (rendue en rgba par react-native-web)
    const rgba = (hex: string) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},1.00)`;
    for (const e of DEPARTEMENT_GIRONDE.elus) expect(html).toContain(`background-color:${rgba(e.personne.groupe!.couleur)}`);
  });

  it('avec un scrutin : le vote de chaque élu', () => {
    const t = texte(rendre(<ContenuDepartement fiche={DEPARTEMENT_GIRONDE_1874} />));
    expect(t).toContain('Sur ce vote');
    expect(t).toContain('Élus du département : 1 pour');
    expect(t).toMatch(/Hugo Fictif\s+Pour/);
  });
});
