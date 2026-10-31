// Fiches Scrutin, Vote à main levée et Amendement v3 (planches « Scrutin », « ScrutinMainLevee »,
// « Amendement ») : modes de couleur, cases par groupe, onglets à icônes, variante non nominative
// dite une fois, première phrase de l'exposé, pas de case vide (react-native-web + react-dom/server).

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { estSuppressionArticle, type FicheAmendement, type FicheScrutin } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus } from '../src/infra/FixturesBus';
import { GrilleGroupes, positionDuGroupe } from '../src/ui/components/scrutin/Groupes';
import { consequenceAmendement, consequenceSuppression, texteAuteurs, texteAvis } from '../src/ui/components/scrutin/Faits';
import { couleurSelonMode, LegendeMode } from '../src/ui/components/scrutin/Modes';
import { ContenuAmendement, cycle, premierePhrase, quandVersion } from '../src/ui/ecrans/Amendement';
import { ContenuMainLevee, ContenuScrutin } from '../src/ui/ecrans/Scrutin';
import { CoreProvider } from '../src/ui/hooks/core';
import { THEMES } from '../src/ui/theme/Themes';

vi.mock('../src/navigation', () => ({
  useAller: () => new Proxy({}, { get: () => () => {} }),
}));
// Écran (React Navigation) : seuls Chargement et Erreur sont utiles, par `Requete`.
vi.mock('../src/ui/components/Ecran', () => ({ Chargement: () => null, Erreur: () => null, Ecran: () => null }));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({}), useRoute: () => ({}), useNavigationState: () => ({}), StackActions: {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

const bus = creerFixturesBus({ debug: () => {}, warn: () => {} });
const rendre = (el: ReactElement) =>
  renderToStaticMarkup(
    <CoreProvider bus={bus} source="fixtures">
      {el}
    </CoreProvider>,
  );
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const AN = fixtures.ConsulterScrutin.find((e) => e.output.scrutin.numero === '1874')!.output as FicheScrutin;
const SENAT = fixtures.ConsulterScrutin.find((e) => e.output.scrutin.chambre === 'SENAT')!.output as FicheScrutin;
const CE123 = fixtures.ConsulterAmendement[0].output as FicheAmendement;
const COM56 = fixtures.ConsulterAmendement[1].output as FicheAmendement;
const p = Object.values(THEMES)[0].palette;

describe('modes de couleur', () => {
  const g = AN.groupes[0].groupe;
  it('pour et contre : la position ; représentation : le groupe ; participation : le groupe sauf les absents', () => {
    expect(couleurSelonMode(p, 'pour_contre', g, 'pour')).toBe(p.votePour);
    expect(couleurSelonMode(p, 'pour_contre', g, 'absent')).toBe(p.line);
    expect(couleurSelonMode(p, 'representation', g, 'absent')).toBe(g.couleur);
    expect(couleurSelonMode(p, 'participation', g, 'contre')).toBe(g.couleur);
    expect(couleurSelonMode(p, 'participation', g, 'absent')).toBe(p.line);
    // siège vacant : jamais la couleur d'un groupe
    expect(couleurSelonMode(p, 'representation', g, null)).toBe(p.surfaceSunken);
  });

  it('légende : positions avec leur nombre, ou groupes (+ Absent en participation)', () => {
    expect(texte(renderToStaticMarkup(<LegendeMode mode="pour_contre" groupes={[]} comptes={{ pour: 3, contre: 2 }} />))).toBe('Pour 3 Contre 2');
    const groupes = AN.groupes.map((x) => x.groupe);
    const html = texte(renderToStaticMarkup(<LegendeMode mode="participation" groupes={groupes} />));
    for (const x of groupes) expect(html).toContain(x.abrege);
    expect(html.endsWith('Absent')).toBe(true);
  });
});

describe('par groupe', () => {
  it('chaque groupe : sigle, position, votants sur membres', () => {
    const html = texte(renderToStaticMarkup(<GrilleGroupes groupes={AN.groupes} />));
    for (const x of AN.groupes) {
      const votants = x.decompte.pour + x.decompte.contre + x.decompte.abstention + x.nonVotants;
      expect(html).toContain(`${votants} votants sur ${x.membres}`);
      expect(html).toContain(x.groupe.abrege);
    }
  });

  it('position : ligne, sans majorité, ou n’a pas voté (jamais inventée)', () => {
    const base = AN.groupes[0];
    expect(positionDuGroupe({ ...base, ligne: 'pour' }).texte).toBe('+ pour');
    expect(positionDuGroupe({ ...base, ligne: null }).texte).toBe('sans majorité');
    expect(positionDuGroupe({ ...base, ligne: null, nonVotants: 0, decompte: { pour: 0, contre: 0, abstention: 0 } }).texte).toBe('n’a pas voté');
  });
});

describe('fiche Scrutin', () => {
  it('AN : en-tête, décomptes, participation, onglets à icônes, renvois', () => {
    const html = texte(rendre(<ContenuScrutin fiche={AN} />));
    expect(html).toContain(`scrutin public n° ${AN.scrutin.numero}`);
    expect(html).toContain(`${AN.scrutin.decompte.pour} + pour`);
    expect(html).toMatch(/Participation \d+ \/ \d+ députés/);
    expect(html).toContain('Par groupe');
    expect(html).toContain('Hémicycle');
    expect(html).toContain('Carte');
    expect(html).toContain('Pour et contre');
    expect(html).toContain(`Ont voté autrement que leur groupe ${AN.votesDifferents.total}`);
    expect(html).toContain(`L’amendement ${AN.objet.type === 'amendement' ? AN.objet.amendement.numero : ''}`);
    expect(html).not.toMatch(/échec/i);
  });

  it('Sénat : l’onglet de l’hémicycle s’appelle « Sénat »', () => {
    const html = texte(rendre(<ContenuScrutin fiche={SENAT} />));
    expect(html).toContain('Sénat');
    expect(html).not.toContain('Hémicycle');
    expect(html).toMatch(/sénateurs/);
  });

  it('interventions de la fiche : sur l’amendement voté ; sans lien sûr, « aucune intervention reliée »', () => {
    const an = texte(rendre(<ContenuScrutin fiche={AN} />));
    expect(an).toContain(`Interventions ${AN.interventions!.total}`);
    expect(an).toContain('Les 3 interventions →');
    expect(an).toContain('Hugo Fictif');
    expect(an).toContain('rapporteure');
    const senat = texte(rendre(<ContenuScrutin fiche={SENAT} />));
    expect(SENAT.interventions).toBeNull();
    expect(senat).toContain('Aucune intervention reliée à ce vote.');
  });

  it('interventions de la séance sur ce texte : dites telles, jamais attribuées au vote', () => {
    const extraits = AN.interventions!.extraits;
    const fiche: FicheScrutin = { ...AN, objet: { type: 'texte' }, interventions: { portee: 'seance', extraits, total: 40, reunion: 'reunion-an-seance-2026-03-12' } };
    const html = texte(rendre(<ContenuScrutin fiche={fiche} />));
    expect(html).toContain('Interventions de la séance sur ce texte 40');
    expect(html).toContain('aucune n’est rattachée au vote lui-même');
    expect(html).toContain('Toute la séance →');
    expect(html).not.toContain('Les 40 interventions');
  });

  it('suppression : « pour la suppression » et la conséquence, seulement par règle sûre', () => {
    expect(estSuppressionArticle('<p style="text-align: justify;">Supprimer cet article.</p><p>&nbsp;</p>')).toBe(true);
    expect(estSuppressionArticle('<p>Supprimer cet article.&#x00A0;</p>')).toBe(true);
    expect(estSuppressionArticle('<p>Supprimer l’alinéa 2.</p>')).toBe(false);
    expect(estSuppressionArticle('<p>Supprimer cet article et le suivant.</p>')).toBe(false);
    expect(estSuppressionArticle(null)).toBe(false);
    expect(consequenceSuppression(true, '1', false)).toBe('L’article 1 reste dans le texte.');
    expect(consequenceSuppression(true, '1', true)).toBe('L’article 1 est supprimé du texte.');
    expect(consequenceSuppression(true, null, false)).toBeNull();
    expect(consequenceSuppression(true, '1', null)).toBeNull();
    expect(consequenceSuppression(false, '1', false)).toBeNull();
    expect(consequenceSuppression(undefined, '1', false)).toBeNull();

    const sans = texte(rendre(<ContenuScrutin fiche={AN} />));
    expect(sans).not.toContain('la suppression');
    expect(sans).not.toContain('reste dans le texte');
    if (AN.objet.type !== 'amendement') throw new Error('1874 : scrutin sur un amendement');
    const fiche: FicheScrutin = { ...AN, objet: { ...AN.objet, suppression: true } };
    const html = texte(rendre(<ContenuScrutin fiche={fiche} />));
    expect(html).toContain(`${AN.scrutin.decompte.pour} + pour la suppression`);
    expect(html).toContain(`${AN.scrutin.decompte.contre} − contre la suppression`);
    expect(html).toContain(`Rejeté L’article ${AN.objet.article!.numero} reste dans le texte.`);
  });
});

describe('vote à main levée', () => {
  it('le dit une fois, puis ce que l’on sait et ce qui a été dit', () => {
    const html = texte(rendre(<ContenuMainLevee fiche={CE123} />));
    expect(html.match(/Vote non nominatif/g)).toHaveLength(1);
    expect(html).toContain('vote à main levée');
    expect(html).toContain(`Auteurs ${texteAuteurs(CE123)}`);
    expect(html).toContain('Avis Commission et Gouvernement : non publiés');
    expect(html).toContain(`Interventions ${CE123.discussions.total}`);
    expect(html).not.toMatch(/hémicycle (?!ni)/i);
  });

  it('auteurs et avis en une phrase, depuis les données', () => {
    expect(texteAuteurs(CE123)).toMatch(/ et 12 cosignataires$/);
    expect(texteAvis(COM56)).toBe('Commission : favorable · Gouvernement : défavorable');
    expect(texteAuteurs(COM56)).not.toContain('cosignataire');
  });

  it('un amendement voté par scrutin public renvoie au scrutin', () => {
    const scrutin = fixtures.ConsulterScrutin[0].output.scrutin;
    const html = texte(rendre(<ContenuMainLevee fiche={{ ...CE123, vote: { type: 'scrutin_public', scrutin } }} />));
    expect(html).toContain(`Scrutin n° ${scrutin.numero}`);
    expect(html).not.toContain('Vote non nominatif');
  });
});

describe('fiche Amendement', () => {
  it('première phrase de l’exposé, sans couper « M. » ni « n° »', () => {
    expect(premierePhrase('Cet amendement vise à supprimer X. Il précise Y.')).toBe('Cet amendement vise à supprimer X.');
    expect(premierePhrase('Comme le propose M. Dupont, on supprime. La suite.')).toBe('Comme le propose M. Dupont, on supprime.');
    expect(premierePhrase('Une seule phrase sans point')).toBe('Une seule phrase sans point');
  });

  it('titre en clair, sort et mode de vote, comparaison, pourquoi, avis et vote, ce qui en a été dit', () => {
    const html = texte(rendre(<ContenuAmendement fiche={CE123} />));
    expect(html).toContain(CE123.amendement.objet!);
    expect(html).toContain('à main levée, le');
    expect(html).toContain('Version juste d’avant');
    expect(html).toContain('Avec l’amendement');
    expect(html).toContain('1re phrase de l’exposé des motifs, citée telle quelle');
    expect(html).toContain('Vote À main levée : pas de détail par élu ni par groupe');
    expect(html).toContain('Le vote à main levée');
    expect(html).toContain(`Ce qui en a été dit ${CE123.discussions.total}`);
    expect(html).toContain('Déposé');
  });

  it('versions comparées : étape et date ; discussion en commission distincte de la séance, compte rendu', () => {
    expect(quandVersion(CE123.dispositif.versions!.avant)).toBe('Dépôt · 12/01/2026');
    expect(quandVersion(CE123.dispositif.versions!.apres)).toBe('Commission AN · 04/02/2026');
    expect(quandVersion(null)).toBe('version non publiée');
    expect(quandVersion({ etape: null, date: null })).toBe('étape non reliée · date non publiée');
    expect(cycle(CE123).map((e) => [e.libelle, e.date])).toEqual([
      ['Déposé', '2026-01-30'],
      ['Discuté en commission', '2026-02-03'],
      [cycle(CE123)[2].libelle, CE123.dateSort],
    ]);
    const { discussion: _d, ...ancienne } = CE123;
    expect(cycle(ancienne).map((e) => e.libelle)).toContain('Discuté');
    const seance: FicheAmendement = {
      ...CE123,
      discussion: { commission: CE123.discussion!.commission, seance: { date: '2026-03-12', compteRendu: { ...CE123.discussion!.commission!.compteRendu!, url: 'https://exemple.test/seance' } } },
    };
    expect(cycle(seance).map((e) => e.libelle)).toEqual(['Déposé', 'Discuté en commission', 'Discuté en séance', cycle(CE123)[2].libelle]);
    const html = texte(rendre(<ContenuAmendement fiche={seance} />));
    expect(html).toContain('Dépôt · 12/01/2026');
    expect(html).toContain('Commission AN · 04/02/2026');
    expect(html).toContain('Compte rendu de la commission · 03/02/2026');
    expect(html).toContain('Compte rendu de la séance · 12/03/2026');
    expect(consequenceAmendement(CE123)).toBeNull();
    const suppression: FicheAmendement = { ...CE123, dispositif: { ...CE123.dispositif, texte: '<p>Supprimer cet article.</p>' }, amendement: { ...CE123.amendement, sort: 'rejete' } };
    expect(consequenceAmendement(suppression)).toBe(`L’article ${CE123.amendement.article!.numero} reste dans le texte.`);
    expect(texte(rendre(<ContenuMainLevee fiche={suppression} />))).toContain('reste dans le texte.');
  });

  it('pas de case vide : sans diff ni interventions ni intérêts, ces blocs ne sont pas dessinés', () => {
    const html = texte(rendre(<ContenuAmendement fiche={COM56} />));
    expect(html).not.toContain('Version juste d’avant');
    expect(html).toContain('la comparaison n’est pas possible');
    expect(html).not.toContain('Ce qui en a été dit');
    expect(html).not.toContain('Intérêts déclarés');
    expect(html).toContain('Commission : favorable · Gouvernement : défavorable');
  });
});
