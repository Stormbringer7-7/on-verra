// Écrans Personnes, Personne, Institutions et Représentant d'intérêts : les commandes que lisent
// les écrans, exécutées sur un bus de fixtures du contrat, et les règles d'affichage
// (`components/personnes/regles.ts`) appliquées à leurs réponses :
//   - une fiche RNE seule n'est jamais présentée comme une personne établie ;
//   - un mandat RNE dans la frise n'est rattaché que par la revue humaine, et le dit ;
//   - un rapprochement à vérifier le dit (« À vérifier · même sujet, même période ») ;
//   - un indicateur n'est jamais résumé sans son dénominateur ni sa référence.

import { describe, expect, it } from 'vitest';

import { CommandBus, type CommandDefinition } from '../src/core/commands/bus';
import * as definitions from '../src/core/commands/definitions';
import {
  ClasserPersonnes,
  ConsulterInstitution,
  ConsulterPersonne,
  ConsulterRepresentant,
  ListerPersonnes,
} from '../src/core/commands/definitions';
import type { Indicateur } from '../src/core/domain/model';
import { fixtures } from '../src/infra/fixtures';
import {
  badgeSource,
  couleursSieges,
  filtreAnnuaire,
  frise,
  libellePeriode,
  presentationAnnuaire,
  rattachementFonction,
  resumeIndicateur,
  statutLien,
  titreCible,
  titrePersonne,
  valeursRubrique,
} from '../src/ui/components/personnes/regles';

/**
 * Bus de fixtures minimal (le `FixturesBus` de l'app appartient au lot socle) : répond à une
 * entrée égale (JSON) à celle d'un exemple, échoue sinon.
 */
function busFixtures(): CommandBus {
  const bus = new CommandBus();
  const parNom = fixtures as unknown as Record<string, { input: unknown; output: unknown }[]>;
  for (const [nom, d] of Object.entries(definitions) as [string, CommandDefinition<string, unknown, unknown>][]) {
    bus.register(d, async (input) => {
      const exemple = parNom[nom].find((e) => JSON.stringify(e.input) === JSON.stringify(input));
      if (!exemple) throw new Error(`Pas de fixture pour ${d.type} ${JSON.stringify(input)}`);
      return exemple.output;
    });
  }
  return bus;
}

const bus = busFixtures();

describe('Personnes · annuaire', () => {
  it('envoie le filtre minimal, celui des fixtures', async () => {
    expect(filtreAnnuaire('tous', '  ')).toEqual({});
    expect(filtreAnnuaire('elu_local', '')).toEqual({ role: 'elu_local' });
    const annuaire = await bus.execute(ListerPersonnes(filtreAnnuaire('tous', '')));
    expect(annuaire.personnes.elements.length).toBeGreaterThan(0);
  });

  it('présente une fiche RNE seule « selon le RNE », jamais comme une personne établie', async () => {
    const elus = await bus.execute(ListerPersonnes(filtreAnnuaire('elu_local', '')));
    const rne = elus.personnes.elements.filter((e) => e.identite === 'fiche_rne');
    expect(rne.length).toBeGreaterThan(0);
    for (const e of rne) {
      const v = presentationAnnuaire(e);
      expect(v.titre).toMatch(/^Selon le RNE : /);
      expect(v.titre).not.toBe(e.nom);
      expect(v.badge).toBe('RNE');
      expect(v.mention).toMatch(/relié à aucune personne/);
    }
    // Une personne (même élue locale, rattachée par la revue) s'affiche par son nom.
    for (const e of elus.personnes.elements.filter((x) => x.identite === 'personne')) {
      expect(presentationAnnuaire(e)).toMatchObject({ titre: e.nom, mention: null });
    }
  });

  it('badge GOUV. pour le Gouvernement (publié par l’AN), SÉNAT, AN, RNE sinon', async () => {
    const annuaire = await bus.execute(ListerPersonnes({}));
    const badges = new Map(annuaire.personnes.elements.map((e) => [e.role, badgeSource(e)]));
    expect(badges.get('gouvernement')).toBe('GOUV.');
    expect(badges.get('senateur')).toBe('SÉNAT');
    expect(badges.get('depute')).toBe('AN');
    expect(badges.get('elu_local')).toBe('RNE');
  });
});

describe('Personnes · classements', () => {
  it('résume chaque ligne avec son dénominateur et sa référence', async () => {
    const c = await bus.execute(ClasserPersonnes({ chambre: 'AN', critere: 'ecarts', ordre: 'desc', themes: ['energie', 'logement'] }));
    expect(c.lignes.length).toBeGreaterThan(0);
    for (const l of c.lignes) {
      const r = resumeIndicateur(l.indicateur);
      expect(l.indicateur.denominateur).not.toBeNull();
      expect(r.denominateur).toBe(`sur ${l.indicateur.denominateur!.valeur} ${l.indicateur.denominateur!.libelle}`);
      expect(r.reference).toContain(l.indicateur.reference.libelle);
      expect(r.reference).toMatch(/: \d/);
    }
    expect(resumeIndicateur(c.lignes[0].indicateur)).toEqual({
      valeur: '14 écarts',
      denominateur: 'sur 188 votes en groupe',
      reference: 'Moyenne des députés : écarts pour 100 votes en groupe : 3,2',
    });
  });

  it('dit quand la référence n’est pas calculée ou le dénominateur absent, sans les omettre', () => {
    const i: Indicateur = {
      libelle: 'Participation',
      valeur: 71.2,
      unite: 'pourcentage',
      denominateur: null,
      reference: { libelle: 'Son groupe sur les mêmes scrutins', valeur: null },
      ceQueLaDonneeNeDitPas: [],
      periode: null,
      calcul: 'lecture.indicateur_participation',
    };
    expect(resumeIndicateur(i)).toEqual({
      valeur: '71,2 %',
      denominateur: 'dénominateur non publié',
      reference: 'Son groupe sur les mêmes scrutins (référence pas encore calculée)',
    });
  });
});

describe('Personne', () => {
  it('fiche RNE seule : en-tête « selon le RNE » et mandat non relié à une personne', async () => {
    const f = await bus.execute(ConsulterPersonne({ id: 'rne-maire-099' }));
    expect(f.entete.identite).toBe('fiche_rne');
    const t = titrePersonne(f.entete);
    expect(t.surtitre).toBe('Selon le Répertoire national des élus');
    expect(t.mention).toMatch(/pas une identité établie/);
    if (f.contenu.onglet !== 'parcours') throw new Error('onglet parcours attendu');
    for (const fn of f.contenu.fonctions) expect(rattachementFonction(fn, f.entete.identite)).toBe('Selon le RNE · non relié à une personne');
  });

  it('frise : chaque mandat RNE dit qu’il est rattaché par la revue humaine, les autres non', async () => {
    for (const id of ['camille-exemple', 'claire-exemple', 'nadia-specimen']) {
      const f = await bus.execute(ConsulterPersonne({ id }));
      expect(titrePersonne(f.entete)).toMatchObject({ surtitre: null, mention: null });
      if (f.contenu.onglet !== 'parcours') throw new Error('onglet parcours attendu');
      const rne = f.contenu.fonctions.filter((x) => x.source === 'RNE');
      expect(rne.length).toBeGreaterThan(0);
      for (const fn of f.contenu.fonctions) {
        if (fn.source === 'RNE') {
          expect(fn.rattachement?.methode).toBe('revue_humaine');
          expect(rattachementFonction(fn, 'personne')).toBe('Rattaché par la revue humaine');
        } else expect(rattachementFonction(fn, 'personne')).toBeNull();
      }
      const { barres } = frise(f.contenu.fonctions, '2026-10-24');
      for (const b of barres) {
        expect(b.gauche).toBeGreaterThanOrEqual(0);
        expect(b.gauche).toBeLessThan(1);
        expect(b.largeur).toBeGreaterThan(0);
      }
    }
  });

  it('un mandat RNE sans décision de revue n’est jamais dit rattaché', async () => {
    const f = await bus.execute(ConsulterPersonne({ id: 'nadia-specimen' }));
    if (f.contenu.onglet !== 'parcours') throw new Error('onglet parcours attendu');
    const { rattachement: _retire, ...sansRevue } = f.contenu.fonctions.find((x) => x.source === 'RNE')!;
    expect(rattachementFonction(sansRevue, 'personne')).toBe('Rattachement non établi');
  });

  it('ses choix : chaque indicateur a sa référence de comparaison et son dénominateur', async () => {
    const f = await bus.execute(ConsulterPersonne({ id: 'camille-exemple', onglet: 'choix' }));
    if (f.contenu.onglet !== 'choix') throw new Error('onglet choix attendu');
    expect(f.contenu.indicateurs.length).toBeGreaterThan(0);
    for (const i of f.contenu.indicateurs) {
      expect(i.denominateur).not.toBeNull();
      expect(i.reference.libelle.length).toBeGreaterThan(0);
      expect(resumeIndicateur(i).reference).toMatch(/: [\d,]+/);
    }
  });

  it('déclarations : rubriques telles que publiées (« Néant ») et lien vers le document original', async () => {
    const f = await bus.execute(ConsulterPersonne({ id: 'camille-exemple', onglet: 'declarations' }));
    if (f.contenu.onglet !== 'declarations') throw new Error('onglet declarations attendu');
    for (const d of f.contenu.declarations) {
      expect(d.url ?? d.provenance.url).toBeTruthy();
      for (const r of d.rubriques) {
        const v = valeursRubrique(r);
        if (r.neant) expect(v).toEqual(['Néant']);
        else expect(v.length).toBe(r.elements.length);
      }
    }
  });

  it('dossiers : les questions au Gouvernement portent leur source', async () => {
    const f = await bus.execute(ConsulterPersonne({ id: 'camille-exemple', onglet: 'dossiers' }));
    if (f.contenu.onglet !== 'dossiers') throw new Error('onglet dossiers attendu');
    expect(f.contenu.questions.elements.length).toBeGreaterThan(0);
    for (const q of f.contenu.questions.elements) expect(q.provenance.idNatif).toBeTruthy();
  });
});

describe('Institutions', () => {
  it('un siège coloré par siège, aux couleurs des groupes', async () => {
    for (const institution of ['an', 'senat'] as const) {
      const i = await bus.execute(ConsulterInstitution({ institution }));
      if (i.type !== 'an' && i.type !== 'senat') throw new Error('chambre attendue');
      const couleurs = couleursSieges(i, '#000');
      expect(couleurs.length).toBe(i.sieges);
      expect(couleurs[0]).toBe([...i.groupes].sort((a, b) => a.rang - b.rang)[0].groupe.couleur);
    }
  });

  it('Gouvernement et Conseil constitutionnel : décisions reliées au dossier ou dites sans dossier', async () => {
    const g = await bus.execute(ConsulterInstitution({ institution: 'gouvernement' }));
    expect(g.type === 'gouvernement' && g.actuel?.membres.length).toBeGreaterThan(0);
    const cc = await bus.execute(ConsulterInstitution({ institution: 'cc' }));
    if (cc.type !== 'cc') throw new Error('cc attendu');
    expect(cc.decisions.some((d) => d.dossier !== null)).toBe(true);
    expect(cc.decisions.some((d) => d.dossier === null)).toBe(true);
    for (const d of cc.decisions) expect(d.provenance.systeme).toBe('CONSTIT');
  });
});

describe('Représentant d’intérêts', () => {
  it('chaque rapprochement dit son statut ; un lien à vérifier n’a pas de cible', async () => {
    const f = await bus.execute(ConsulterRepresentant({ id: 'ri-enr' }));
    expect(f.rapprochements.length).toBeGreaterThan(0);
    const statuts = f.rapprochements.map((l) => statutLien(l.vers));
    expect(statuts).toContain('Vérifié · l’action cite le texte');
    expect(statuts).toContain('À vérifier · même sujet, même période');
    for (const l of f.rapprochements) {
      if (l.vers.statut === 'a_verifier') {
        expect(statutLien(l.vers)).toMatch(/^À vérifier · /);
        expect('cible' in l.vers).toBe(false);
        expect(l.vers.rapprochement.avertissement.length).toBeGreaterThan(0);
        expect(titreCible(l.vers.candidat).length).toBeGreaterThan(0);
      } else {
        expect(statutLien(l.vers)).toMatch(/^Vérifié · /);
      }
    }
  });

  it('périodes déclarées lisibles (trimestre, année)', async () => {
    const f = await bus.execute(ConsulterRepresentant({ id: 'ri-enr' }));
    expect(f.actions.elements.map((a) => libellePeriode(a.periode))).toEqual(['T1 2026', 'T1 2026', 'T2 2026', 'T3 2026']);
    expect(f.exercice && libellePeriode(f.exercice.periode)).toBe('2026');
  });
});
