// Réglages et Mes suivis (gardés sur l'appareil) : lecture défensive du stockage, palette et taille
// du texte des réglages, phrases de « Ce qui a bougé », et rendu sur les fixtures ; aucun élément
// d'IA (lecture facile) ni de thème n'est proposé.

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SUIVIS_CAMILLE_MARS, SUIVIS_OCTOBRE } from '../src/infra/fixtures/suivis';
import { SuivreDossier } from '../src/ui/components/commun/Suivre';
import { ECHELLES, lireReglages, REGLAGES_PAR_DEFAUT, ReglagesProvider } from '../src/ui/hooks/reglages';
import { RUBRIQUES_METHODE } from '../src/ui/ecrans/Methode';
import { ContenuSuivis, joursAvant, phraseEvenement } from '../src/ui/ecrans/Suivis';
import { aLEchelle, paletteDes, ThemeProvider, usePalette } from '../src/ui/theme/ThemeProvider';
import { palettes, type } from '../src/ui/theme/tokens';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));
// Les écrans importent le gabarit `Ecran` (navigation, zones sûres) : non rendu ici, remplacé à vide.
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({}), useRoute: () => ({}), useNavigationState: () => ({}), StackActions: {} }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

const rendre = (el: ReactElement) => renderToStaticMarkup(el);
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('réglages gardés sur l’appareil', () => {
  it('lecture défensive : valeurs inconnues ou mal formées → défaut', () => {
    expect(lireReglages(null)).toEqual(REGLAGES_PAR_DEFAUT);
    expect(lireReglages({ taille: 'énorme', contraste: 'oui', theme: 'violet', dossiers: [{ id: 1 }, { id: 'd', titre: 'T' }] })).toEqual({
      ...REGLAGES_PAR_DEFAUT,
      dossiers: [{ id: 'd', titre: 'T' }],
    });
    expect(lireReglages({ taille: 'tres_grande', theme: 'clair', contraste: true, vuLe: '2026-10-01' })).toMatchObject({
      taille: 'tres_grande',
      theme: 'clair',
      contraste: true,
      vuLe: '2026-10-01',
    });
  });

  it('palette : sombre ou clair, contraste renforcé ou non', () => {
    expect(paletteDes({ theme: 'sombre', contraste: false })).toBe('dark');
    expect(paletteDes({ theme: 'sombre', contraste: true })).toBe('contraste');
    expect(paletteDes({ theme: 'clair', contraste: false })).toBe('light');
    expect(paletteDes({ theme: 'clair', contraste: true })).toBe('clairContraste');
    // Toutes les palettes ont les mêmes couleurs que la palette par défaut.
    for (const p of Object.values(palettes)) expect(Object.keys(p).sort()).toEqual(Object.keys(palettes.dark).sort());
  });

  it('taille du texte : taille et interligne mis à l’échelle, rien d’autre', () => {
    expect(aLEchelle(type.body, 1)).toBe(type.body);
    expect(aLEchelle(type.body, ECHELLES.tres_grande)).toEqual({ ...type.body, fontSize: 21, lineHeight: 33 });
  });

  it('le ThemeProvider suit les réglages', () => {
    let lue = '';
    function Sonde() {
      lue = usePalette().surface;
      return null;
    }
    rendre(
      <ReglagesProvider initial={{ theme: 'clair', contraste: true }}>
        <ThemeProvider>
          <Sonde />
        </ThemeProvider>
      </ReglagesProvider>,
    );
    expect(lue).toBe(palettes.clairContraste.surface);
  });
});

describe('Mes suivis', () => {
  it('fenêtre de 30 jours et phrases : ce qui est publié, sans interprétation', () => {
    expect(joursAvant('2026-10-24', 30)).toBe('2026-09-24');
    expect(phraseEvenement(SUIVIS_OCTOBRE.evenements[0])).toEqual({
      qui: 'Programmation énergétique 2026-2035',
      quoi: 'Conseil constit. · Saisine du conseil constitutionnel',
    });
    expect(phraseEvenement(SUIVIS_CAMILLE_MARS.evenements[0]).quoi).toMatch(/^A voté à l’inverse de son groupe : /);
  });

  it('rendu : événements, « Nouveau » depuis la dernière visite, suivis inconnus, limites', () => {
    const t = texte(rendre(<ContenuSuivis suivis={SUIVIS_OCTOBRE} vuAvant="2026-10-14" />));
    expect(t).toContain('Ce qui a bougé');
    expect(t.match(/Nouveau/g)?.length).toBe(2);
    expect(t).toContain('Un suivi n’est plus dans nos données');
    expect(t).toContain('Lois suivies');
    expect(t).toContain('Camille Exemple');
    for (const l of SUIVIS_OCTOBRE.limites) expect(t).toContain(l);
  });

  it('bouton Suivre : à bascule, libellé pour les lecteurs d’écran', () => {
    const html = rendre(
      <ReglagesProvider initial={{ dossiers: [{ id: 'dossier-energie', titre: 'Énergie' }] }}>
        <SuivreDossier id="dossier-energie" titre="Énergie" />
        <SuivreDossier id="dossier-location" titre="Location" />
      </ReglagesProvider>,
    );
    expect(html).toContain('Ne plus suivre Énergie');
    expect(html).toContain('Suivre Location');
  });
});

describe('Méthode', () => {
  it('aucune IA aujourd’hui, établi / à vérifier, revue humaine', () => {
    const t = RUBRIQUES_METHODE.flatMap((r) => r.paragraphes).join(' ');
    expect(t).toContain('Aucune IA n’est utilisée aujourd’hui');
    expect(t).toContain('« à vérifier »');
    expect(t).toContain('décision humaine');
    expect(t).not.toMatch(/✦|relus par une personne avant publication/);
  });
});
