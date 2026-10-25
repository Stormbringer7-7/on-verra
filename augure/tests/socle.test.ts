// Socle de l'app : fil d'Ariane et onglet actif lus dans la pile, mise en forme, et ce que les
// écrans Accueil et Recherche lisent sur le FixturesBus.

import { describe, expect, it } from 'vitest';

import { ConsulterAccueil, Rechercher } from '../src/core';
import { fixtures } from '../src/infra/fixtures';
import { creerFixturesBus } from '../src/infra/FixturesBus';
import { cheminAriane, ongletActif, ONGLETS, type EtatPile } from '../src/ui/ariane';
import { dateLongue, nombre, resultatScrutin, texteSource, titreOfficielDistinct, titreScrutin, valeurIndicateur } from '../src/ui/format';
import { natureDossier, statutDossier, suiteDossier } from '../src/ui/libelles';
import { demandeRecherche } from '../src/ui/recherche';

const bus = creerFixturesBus({ debug: () => {}, warn: () => {} });

describe("fil d'Ariane", () => {
  const pile: EtatPile = {
    index: 3,
    routes: [
      { key: 'o', name: 'Onglets', state: { index: 1, routes: [{ name: 'Accueil' }, { name: 'Chiffres' }] } },
      { key: 'd', name: 'Dossier' },
      { key: 'e', name: 'Etape' },
      { key: 'a', name: 'Amendement' },
    ],
  };

  it('part de l’onglet, ajoute chaque fiche avec son titre, et sait y revenir', () => {
    const chemin = cheminAriane(pile, { d: 'Programmation énergétique', e: 'Commission AN', a: 'Amendement CE123' });
    expect(chemin.map((m) => m.libelle)).toEqual(['Chiffres', 'Programmation énergétique', 'Commission AN', 'Amendement CE123']);
    expect(chemin.map((m) => m.aller)).toEqual([
      { type: 'onglet', onglet: 'Chiffres' },
      { type: 'retirer', n: 2 },
      { type: 'retirer', n: 1 },
      { type: 'ici' },
    ]);
  });

  it('donne le nom générique d’une fiche sans titre', () => {
    expect(cheminAriane({ ...pile, index: 2 }, {}).map((m) => m.libelle)).toEqual(['Chiffres', 'Dossier', 'Étape']);
  });

  it('onglet actif : celui de la pile, sinon celui de la page ouverte par lien profond', () => {
    expect(ongletActif(pile)).toBe('Chiffres');
    expect(ongletActif({ index: 0, routes: [{ key: 'o', name: 'Onglets' }] })).toBe('Accueil');
    expect(ongletActif({ index: 0, routes: [{ key: 'p', name: 'Personne' }] })).toBe('Recherche');
    expect(ongletActif({ index: 0, routes: [{ key: 't', name: 'Textes' }] })).toBe('Chiffres');
    // Lien profond : « Onglets » sous la fiche, jamais affiché.
    expect(ongletActif({ index: 1, routes: [{ key: 'o', name: 'Onglets' }, { key: 'i', name: 'Institution' }] })).toBe('Recherche');
  });

  it('les cinq onglets du design v4, l’Actualité sur la route Accueil', () => {
    expect(ONGLETS.map((o) => o.libelle)).toEqual(['Actualité', 'Chiffres', 'Carte', 'Recherche', 'Guide']);
    expect(ONGLETS[0].cle).toBe('Accueil');
  });
});

describe('mise en forme', () => {
  it('dates, nombres, sources, indicateurs, scrutins', () => {
    expect(dateLongue('2026-10-19')).toBe('19 octobre 2026');
    expect(dateLongue('2026-11-01')).toBe('1er novembre 2026');
    expect(nombre(1234)).toBe('1 234');
    expect(nombre(37.5, 1)).toBe('37,5');
    expect(nombre(41, 1)).toBe('41');
    expect(valeurIndicateur(12, 'points')).toBe('+12 pts');
    expect(valeurIndicateur(-0.5, 'points')).toBe('−0,5 pt');
    expect(texteSource({ systeme: 'CONSTIT', type: 'decision', idNatif: '2026-901 DC', url: null })).toBe('Conseil constit. · 2026-901 DC');
    const s = fixtures.ConsulterAccueil[0].output.votes[0];
    expect(resultatScrutin(s)).toMatch(/^(ADOPTÉ|REJETÉ|[A-ZÉ ]+) \d/);
    expect(titreScrutin({ ...s, enClair: null, intitule: 'l’article 12 du projet de loi.' })).toBe('L’article 12 du projet de loi');
  });

  it('titre officiel rappelé seulement s’il diffère du titre affiché', () => {
    const titre = 'Projet de loi d’urgence pour l’agriculture';
    // Même texte à la casse, aux espaces et aux apostrophes près : pas de rappel.
    expect(titreOfficielDistinct(titre, 'Projet de loi d\'urgence  pour l\'agriculture')).toBeNull();
    expect(titreOfficielDistinct(titre, ' PROJET DE LOI D’URGENCE\u00a0POUR L’AGRICULTURE ')).toBeNull();
    expect(titreOfficielDistinct(titre, titre)).toBeNull();
    expect(titreOfficielDistinct(titre, '')).toBeNull();
    expect(titreOfficielDistinct(titre, null)).toBeNull();
    // Un intitulé différent est rappelé tel que publié.
    const officiel = 'Projet de loi d’urgence pour la protection et la reconstruction de l’agriculture';
    expect(titreOfficielDistinct(titre, officiel)).toBe(officiel);
    // Dossier location des fixtures : titre court distinct de l'intitulé officiel, qui est rappelé.
    const d = fixtures.ConsulterDossier[1].output.entete;
    expect(titreOfficielDistinct(d.titreEnClair ?? d.titre, d.titreOfficiel)).toBe('Proposition de loi visant à réguler les meublés de tourisme');
  });
});

describe('écrans sur le FixturesBus', () => {
  it('Accueil : dossiers à suivre avec barre et échéance ou dernier acte, votes des deux chambres', async () => {
    const accueil = await bus.execute(ConsulterAccueil({}));
    expect(accueil.semaine.debut).toBe('2026-10-19');
    expect(accueil.dossiers.length).toBeGreaterThan(0);
    for (const d of accueil.dossiers) {
      expect(d.prochaineEcheance ?? d.dernierEvenement, d.id).not.toBeNull();
      expect(d.barre.length, d.id).toBeGreaterThan(0);
    }
    expect(accueil.dossiers.some((d) => d.prochaineEcheance)).toBe(true);
    expect(new Set(accueil.votes.map((v) => v.chambre))).toEqual(new Set(['AN', 'SENAT']));
  });

  it('Recherche : une section par type, chaque résultat ouvrable', async () => {
    const r = await bus.execute(Rechercher({ q: 'énergie' }));
    expect(r.sections.map((s) => s.type)).toEqual(['dossiers', 'personnes', 'amendements', 'scrutins', 'organisations']);
    for (const s of r.sections) for (const t of s.resultats.elements) expect(t.type).toBe(s.type);
    const vide = await bus.execute(Rechercher({ q: 'zzzz', type: 'dossiers' }));
    expect(vide.sections).toEqual([]);
  });
});

describe('logique des écrans', () => {
  it('Recherche : la demande a la forme exacte des fixtures (pas de clé vide)', () => {
    expect(demandeRecherche(' é ', 'tout', 1)).toBeNull();
    expect(demandeRecherche(' énergie ', 'tout', 1)).toEqual(fixtures.Rechercher[0].input);
    expect(demandeRecherche('zzzz', 'dossiers', 1)).toEqual(fixtures.Rechercher[1].input);
    expect(demandeRecherche('loi', 'scrutins', 3)).toEqual({ q: 'loi', type: 'scrutins', page: 3 });
  });

  it('Accueil : nature, statut et suite des dossiers à suivre', () => {
    const [location, , energie, medecins] = fixtures.ConsulterAccueil[0].output.dossiers;
    expect(natureDossier(energie)).toBe('Projet de loi · Gouvernement');
    expect(statutDossier(medecins)).toEqual({ libelle: 'Promulgué', ton: 'inkMuted' });
    expect(statutDossier(energie)?.libelle).toBe(energie.etapeCourante?.libelle);
    expect(suiteDossier(location)).toBe('Prochaine échéance : Lecture définitive AN · Séance publique le 05/11/2026 (Confirmé)');
    expect(suiteDossier(energie)).toBe('Conseil constitutionnel saisi par 60 députés · 17/10/2026');
  });
});
