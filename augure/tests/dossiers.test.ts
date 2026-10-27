// Écrans de la famille Dossier (Dossiers, Dossier, Étape, Discussions, Article, Amendement,
// Scrutin, Pourquoi ce vote) : chaque écran exécute sa query avec l'entrée qu'il construit
// (`components/dossiers/presentation.ts`) sur un bus de fixtures, et l'on vérifie les données
// qu'il lit et les règles de fond : lien à vérifier jamais présenté comme établi, synthèse absente
// dite absente, provenance partout, pas de causalité dans « Pourquoi ce vote ».

import { describe, expect, it } from 'vitest';

import { CommandBus, type Command, type CommandDefinition } from '../src/core/commands/bus';
import * as definitions from '../src/core/commands/definitions';
import type { CaseCompacte, ExplicationVote, FicheEtape, OrigineModification } from '../src/core/domain/model';
import { fixtures, type Fixtures } from '../src/infra/fixtures';
import {
  amendementEtabli,
  AVERTISSEMENT_POURQUOI,
  CAUSALITE,
  adresseAncre,
  entreeArticle,
  entreeDiscussions,
  entreeDossier,
  entreeDossiers,
  faitsArticle,
  faitsDuVote,
  nomOrateur,
  partLigne,
  personneOrateur,
  siegesScrutin,
  texteDuHtml,
  titreOrigine,
} from '../src/ui/components/dossiers/presentation';
import { casesVisibles, legendeBarre } from '../src/ui/components/commun/statuts';

// ---------- Bus de test : répond par l'exemple dont l'entrée est égale ----------

/** JSON à clés triées : l'ordre des clés d'une entrée ne compte pas. */
const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v);

function busDeFixtures(): CommandBus {
  const bus = new CommandBus();
  for (const [nom, definition] of Object.entries(definitions)) {
    const exemples = (fixtures as Fixtures)[nom as keyof Fixtures] as { input: unknown; output: unknown }[];
    // Le type de chaque définition est perdu dans la boucle : le bus est générique sur l'entrée.
    bus.register(definition as unknown as CommandDefinition<string, unknown, unknown>, async (input) => {
      const trouve = exemples.find((e) => stable(e.input) === stable(input));
      if (!trouve) throw new Error(`Pas de fixture pour ${nom} ${stable(input)}`);
      return structuredClone(trouve.output);
    });
  }
  return bus;
}

const bus = busDeFixtures();
const executer = <O>(c: Command<string, unknown, O>) => bus.execute(c);

/** Tous les objets d'une valeur (pour vérifier une règle partout). */
function objets(v: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(v)) v.forEach((x) => objets(x, acc));
  else if (v && typeof v === 'object') {
    acc.push(v as Record<string, unknown>);
    Object.values(v).forEach((x) => objets(x, acc));
  }
  return acc;
}

/** Chaque provenance a un système, un type et un identifiant natif ; l'URL est null ou réelle. */
function provenancesCompletes(v: unknown) {
  const provenances = objets(v).filter((o) => 'idNatif' in o);
  expect(provenances.length).toBeGreaterThan(0);
  for (const p of provenances) {
    expect(p.systeme).toBeTruthy();
    expect(p.type).toBeTruthy();
    expect(p.idNatif).toBeTruthy();
    expect(p.url === null || typeof p.url === 'string').toBe(true);
  }
}

// ---------- Dossiers ----------

describe('Dossiers', () => {
  it('liste les dossiers de la 17e législature sans filtre (entrée vide, page 1 implicite)', async () => {
    expect(entreeDossiers({ page: 1 })).toEqual({});
    const l = await executer(definitions.ListerDossiers(entreeDossiers({})));
    expect(l.legislature).toBe('17');
    expect(l.dossiers.elements.length).toBeGreaterThan(1);
    for (const d of l.dossiers.elements) {
      expect(d.titre).toBeTruthy();
      // Barre compacte : au plus une case courante.
      expect(d.barre.filter((c) => c.courante).length).toBeLessThanOrEqual(1);
    }
    // Aucun thème attribué : la facette est vide, l'écran masque le filtre.
    expect(l.facettes.themes).toEqual([]);
    expect(l.facettes.etats.length).toBeGreaterThan(0);
  });

  it('filtre par origine', async () => {
    const l = await executer(definitions.ListerDossiers(entreeDossiers({ origine: 'parlementaire', page: undefined })));
    expect(l.dossiers.elements.every((d) => d.origine === 'parlementaire')).toBe(true);
  });
});

// ---------- Dossier ----------

describe('Barre du dossier', () => {
  const cas = (cle: string, libelle: string, etat: CaseCompacte['etat'], plus: Partial<CaseCompacte> = {}): CaseCompacte => ({
    cle, libelle, etat, courante: false, attendue: false, deviation: false, ...plus,
  });

  it('étape actuelle si elle existe ; étape attendue sinon ; état final pour un dossier terminé ; rien de supposé', () => {
    const enCours = [cas('depot', 'Dépôt', 'faite'), cas('cmp', 'CMP', 'en_cours', { courante: true })];
    expect(legendeBarre(enCours, 'depot')).toBe('Étape actuelle : CMP · vous êtes : Dépôt');
    const attendue = [cas('depot', 'Dépôt', 'faite'), cas('lecture_definitive', 'Lecture définitive AN', 'a_venir', { attendue: true })];
    expect(legendeBarre(attendue, null)).toBe('Étape attendue : Lecture définitive AN');
    const promulgue = [cas('depot', 'Dépôt', 'faite'), cas('promulgation', 'Promulgation', 'faite'), cas('jo', 'Journal officiel', 'faite')];
    expect(legendeBarre(promulgue, 'depot')).toBe('Promulgué · vous êtes : Dépôt');
    // Ni étape actuelle, ni attendue, ni état final : la barre ne conclut rien.
    expect(legendeBarre([cas('depot', 'Dépôt', 'faite'), cas('cmp', 'CMP', 'inconnu')], null)).toBeNull();
  });
});

describe('Dossier', () => {
  it('construit l’entrée : liste d’amendements demandée seulement si filtrée ou paginée', () => {
    expect(entreeDossier('d', null, 1)).toEqual({ id: 'd' });
    expect(entreeDossier('d', 'adopte', 1)).toEqual({ id: 'd', amendements: { sort: 'adopte' } });
    expect(entreeDossier('d', null, 3)).toEqual({ id: 'd', amendements: { page: 3 } });
  });

  it('lit tous les onglets du dossier énergie, avec ses sources', async () => {
    const f = await executer(definitions.ConsulterDossier(entreeDossier('dossier-energie', null, 1)));
    expect(f.entete.titre).toBe('Programmation énergétique 2026-2035');
    expect(f.parcours?.cases.length).toBeGreaterThan(0);
    // Les cases sans objet sont masquées, la courante reste visible.
    const visibles = casesVisibles(f.parcours!.cases);
    expect(visibles.some((c) => c.cle === 'lecture_2_o')).toBe(false);
    expect(visibles.filter((c) => c.courante).map((c) => c.cle)).toEqual(['cc']);
    expect(f.etapes.length).toBeGreaterThan(0);
    expect(f.articles.length).toBeGreaterThan(0);
    expect(f.amendements.liste.elements.length).toBeGreaterThan(0);
    expect(f.scrutins.length).toBeGreaterThan(0);
    expect(f.acteurs.length).toBeGreaterThan(0);
    expect(f.sources.length).toBeGreaterThan(0);
    provenancesCompletes(f);
  });

  it('dossier location : synthèses absentes (null), auditionnée en nom publié sans fiche', async () => {
    const f = await executer(definitions.ConsulterDossier(entreeDossier('dossier-location', null, 1)));
    expect(f.entete.titreEnClair).toBeNull();
    expect(f.entete.resumeEnClair).toBeNull();
    expect(f.ceQuiAChange.every((c) => c.resume === null)).toBe(true);
    // Les articles de « Ce qui a changé » se listent par leurs faits (état, modifications).
    const faits = f.ceQuiAChange.map((c) => faitsArticle(f.articles.find((a) => a.article.id === c.article.id)));
    expect(faits.every((t) => t === null || /^(Inchangé|Modifié|Ajouté|Supprimé)/.test(t))).toBe(true);
    expect(f.parcours?.procedure).toBe('normale');
    const auditionnes = f.acteurs.find((g) => g.role === 'auditionnes')!;
    for (const a of auditionnes.acteurs) {
      expect(a.qui.type).toBe('nom_publie');
      expect(personneOrateur(a.qui)).toBeNull();
      expect(nomOrateur(a.qui)).toBe('Mme Nadia Specimen');
    }
  });

  it('intérêts : chaque rapprochement a son statut, un « à vérifier » n’a pas de cible', async () => {
    const f = await executer(definitions.ConsulterDossier(entreeDossier('dossier-energie', null, 1)));
    expect(f.interets.some((i) => i.vers.statut === 'a_verifier')).toBe(true);
    for (const i of f.interets) {
      if (i.vers.statut === 'a_verifier') {
        expect('cible' in i.vers).toBe(false);
        expect(i.vers.rapprochement.avertissement).toBeTruthy();
      }
    }
  });
});

// ---------- Étape ----------

const etapes = fixtures.ConsulterEtape.map((e) => e.input);

describe('Étape', () => {
  it('répond pour chaque case des fixtures, avec barre, rang et voisines', async () => {
    for (const { dossier, cle } of etapes) {
      const f = await executer(definitions.ConsulterEtape({ dossier, cle }));
      expect(f.case.cle).toBe(cle);
      expect(f.barre.ici).toBe(cle);
      // « vous êtes : … » nomme l'étape de l'écran quand ce n'est pas l'étape actuelle
      if (!f.case.courante) expect(legendeBarre(f.barre.cases, f.barre.ici)).toContain(`vous êtes : ${f.case.libelle}`);
      expect(f.deviations.every((d) => d.etape === cle)).toBe(true);
      expect(f.enfants.every((e) => e.etape === cle)).toBe(true);
      expect(f.numero).toBeGreaterThan(0);
      expect(f.numero).toBeLessThanOrEqual(casesVisibles(f.barre.cases).length);
      for (const d of f.documents) expect(d.provenance.idNatif).toBeTruthy();
    }
  });

  it('commission AN : un changement vérifié nomme l’amendement, un changement à vérifier jamais', async () => {
    const f: FicheEtape = await executer(definitions.ConsulterEtape({ dossier: 'dossier-energie', cle: 'commission_1_o' }));
    const [verifie, aVerifier] = f.changements;
    expect(titreOrigine(verifie.origine)).toBe('Amendement CE123');
    expect(amendementEtabli(verifie.origine)?.numero).toBe('CE123');

    expect(aVerifier.origine.type === 'amendement' && aVerifier.origine.amendement.statut).toBe('a_verifier');
    expect(titreOrigine(aVerifier.origine)).toBe('Origine à vérifier');
    expect(titreOrigine(aVerifier.origine)).not.toContain('CE88');
    expect(amendementEtabli(aVerifier.origine)).toBeNull();
  });

  it('séance AN : origine non établie, votes, « Qui intervient » avec extraits et personnes reliées', async () => {
    const f = await executer(definitions.ConsulterEtape({ dossier: 'dossier-energie', cle: 'seance_1_o' }));
    const nonEtablie = f.changements.find((c) => c.origine.type === 'non_etablie')!;
    expect(titreOrigine(nonEtablie.origine)).toBe('Origine non établie');
    expect(amendementEtabli(nonEtablie.origine)).toBeNull();
    expect(f.votes.map((v) => v.numero)).toEqual(['1874', '1880']);
    expect(f.quiIntervient.total).toBeGreaterThan(f.quiIntervient.intervenants.length);
    for (const it of f.quiIntervient.intervenants) {
      expect(it.extrait?.extrait).toBeTruthy();
      expect(adresseAncre(it.extrait!.compteRendu)).toMatch(/#p-\d+$/);
      expect(personneOrateur(it.orateur)).not.toBeNull();
    }
  });

  it('commission AN et 1re lecture location : noms publiés, jamais reliés à une fiche', async () => {
    for (const cle of ['commission_1_o', 'lecture_1_o'] as const) {
      const dossier = cle === 'commission_1_o' ? 'dossier-energie' : 'dossier-location';
      const f = await executer(definitions.ConsulterEtape({ dossier, cle }));
      for (const it of f.quiIntervient.intervenants) {
        expect(it.orateur.type).toBe('nom_publie');
        expect(personneOrateur(it.orateur)).toBeNull();
      }
    }
  });

  it('étapes sans synthèse : `resume` null (affiché « Pas de synthèse disponible »)', async () => {
    const f = await executer(definitions.ConsulterEtape({ dossier: 'dossier-location', cle: 'cmp' }));
    expect(f.resume).toBeNull();
  });
});

// ---------- Discussions ----------

describe('Discussions', () => {
  it('construit la cible dans l’ordre du contrat, quel que soit l’ordre des paramètres', () => {
    expect(entreeDiscussions({ cle: 'seance_1_o', type: 'etape', dossier: 'd' } as never, 1)).toEqual({
      cible: { type: 'etape', dossier: 'd', cle: 'seance_1_o' },
    });
    expect(JSON.stringify(entreeDiscussions({ cle: 'cmp', dossier: 'd', type: 'etape' } as never, 2))).toBe(
      '{"cible":{"type":"etape","dossier":"d","cle":"cmp"},"page":2}',
    );
    expect(entreeDiscussions({ type: 'personne', id: 'p' }, 1)).toEqual({ cible: { type: 'personne', id: 'p' } });
  });

  it('sur un amendement : texte intégral, orateur en nom publié, ancre du compte rendu', async () => {
    const l = await executer(definitions.ListerInterventions(entreeDiscussions({ type: 'amendement', id: 'amdt-ce123' }, 1)));
    expect(l.libelle).toBeTruthy();
    expect(l.interventions.elements).toHaveLength(3);
    for (const i of l.interventions.elements) {
      expect(i.texte.length).toBeGreaterThan(20);
      expect(personneOrateur(i.orateur)).toBeNull();
      expect(adresseAncre(i.compteRendu)).toContain('#p-');
      expect(i.compteRendu.provenance.idNatif).toBeTruthy();
      expect(i.synthese).toBeNull();
    }
    expect(l.interventions.suivante).toBeNull();
  });

  it('sur une étape : pagination (page, total, suivante) et personnes reliées', async () => {
    // La fixture de l'étape est demandée avec `taille: 3` ; l'écran n'envoie pas de taille (20 par défaut).
    const entree = { ...entreeDiscussions({ type: 'etape', dossier: 'dossier-energie', cle: 'seance_1_o' }, 1), taille: 3 };
    const l = await executer(definitions.ListerInterventions(entree));
    expect(l.interventions.page).toBe(1);
    expect(l.interventions.total).toBe(1214);
    expect(l.interventions.suivante).toBe(2);
    expect(l.interventions.elements.every((i) => personneOrateur(i.orateur) !== null)).toBe(true);
  });
});

// ---------- Article ----------

describe('Article', () => {
  it('construit l’entrée : comparaison à la précédente implicite', () => {
    expect(entreeArticle('a', undefined, 'precedente')).toEqual({ article: 'a' });
    expect(entreeArticle('a', 'v1', 'depose')).toEqual({ article: 'a', version: 'v1', comparaison: 'depose' });
  });

  it('énergie art. 3 : versions, diff mot à mot cohérent avec le texte, amendement vérifié', async () => {
    const f = await executer(definitions.ConsulterArticle(entreeArticle('art-energie-3', 'va-e3-1', 'precedente')));
    expect(f.versions.map((v) => v.rang)).toEqual([0, 1, 2, 3, 4]);
    expect(f.affichee.version).toBe('va-e3-1');
    // Le texte affiché = segments égaux + ajoutés ; le texte comparé = égaux + supprimés.
    const garde = (types: string[]) => f.affichee.diff.filter((s) => types.includes(s.type)).map((s) => s.texte).join('');
    expect(garde(['egal', 'ajoute'])).toBe(f.affichee.texte);
    expect(garde(['egal', 'supprime'])).toContain('40 %');
    expect(titreOrigine(f.affichee.origine)).toBe('Amendement CE123');
    expect(f.affichee.pourquoi.expose).toBeTruthy();
  });

  it('location art. 2 : origine non établie, jamais attribuée à un amendement, synthèse absente', async () => {
    const f = await executer(definitions.ConsulterArticle(entreeArticle('art-location-2', undefined, 'precedente')));
    expect(f.affichee.origine?.type).toBe('non_etablie');
    expect(amendementEtabli(f.affichee.origine)).toBeNull();
    expect(titreOrigine(f.affichee.origine)).toBe('Origine non établie');
    expect(f.affichee.pourquoi.synthese).toBeNull();
    expect(f.affichee.pourquoi.expose).toBeNull();
  });

  it('règle des titres d’origine, pour toutes les formes du contrat', () => {
    const aVerifier: OrigineModification = {
      type: 'amendement',
      amendement: {
        statut: 'a_verifier',
        candidat: { id: 'x', numero: 'CE999' } as never,
        rapprochement: { statut: 'a_verifier', methode: 'attribution_en_revue', motif: 'm', avertissement: 'a' },
      },
    };
    expect(titreOrigine(aVerifier)).not.toContain('CE999');
    expect(amendementEtabli(aVerifier)).toBeNull();
    expect(titreOrigine({ type: 'compromis_cmp' })).toBe('Compromis de la CMP');
    expect(titreOrigine(null)).toBe('Texte déposé');
  });
});

// ---------- Amendement ----------

describe('Amendement', () => {
  it('texteDuHtml : exposé tel que publié par l’AN (balises, styles, entités numériques)', () => {
    const html =
      '<p style="text-align: justify;">Par cet amendement de repli, le moratoire sur les m&#x00E9;ga&#x2011;bassines ' +
      'dure &#233;tendu&nbsp;:</p><p style="text-align: justify;">L&#x2019;eau &amp; la ressource.</p>';
    expect(texteDuHtml(html)).toBe(
      'Par cet amendement de repli, le moratoire sur les méga\u2011bassines dure étendu :\nL’eau & la ressource.',
    );
    expect(texteDuHtml('a &inconnue; b &#0; c')).toBe('a &inconnue; b &#0; c');
  });

  it('CE123 (AN) : avis non publiés, main levée, ce qui a été dit, intérêts à vérifier', async () => {
    const f = await executer(definitions.ConsulterAmendement({ id: 'amdt-ce123' }));
    expect(f.amendement.numero).toBe('CE123');
    expect(f.avis).toEqual({ publies: false, liste: [] });
    expect(f.vote.type).toBe('main_levee');
    expect(f.dispositif.diff?.length).toBeGreaterThan(0);
    expect(texteDuHtml(f.dispositif.texte!)).toBe('À l’alinéa 2, substituer au taux : « 40 % » le taux : « 45 % ».');
    expect(f.discussions.extraits.length).toBeGreaterThan(0);
    expect(f.interets.every((i) => i.vers.statut === 'a_verifier')).toBe(true);
    expect(f.provenance.idNatif).toBeTruthy();
  });

  it('COM-56 (Sénat) : avis publiés avec leur source, synthèse absente', async () => {
    const f = await executer(definitions.ConsulterAmendement({ id: 'amdt-com56' }));
    expect(f.avis.publies).toBe(true);
    expect(f.avis.liste.every((a) => a.provenance.systeme === 'SENAT')).toBe(true);
    expect(f.exposeEnClair).toBeNull();
    expect(f.dispositif.diff).toBeNull();
  });
});

// ---------- Scrutin ----------

describe('Scrutin', () => {
  it('n° 1874 : hémicycle d’un point par membre, groupes de gauche à droite, positions de groupe', async () => {
    const f = await executer(definitions.ConsulterScrutin({ id: 'scrutin-an-1874' }));
    const sieges = siegesScrutin(f.groupes);
    expect(sieges).toHaveLength(f.groupes.reduce((s, g) => s + g.membres, 0));
    expect(sieges).toHaveLength(577);
    const compte = (p: string) => sieges.filter((s) => s.position === p).length;
    expect(compte('pour')).toBe(f.scrutin.decompte.pour);
    expect(compte('contre')).toBe(f.scrutin.decompte.contre);
    expect(compte('abstention')).toBe(f.scrutin.decompte.abstention);
    expect(compte('absent')).toBe(f.absents);
    // Premier siège : groupe de rang 0 ; dernier : rang maximal.
    const parRang = [...f.groupes].sort((a, b) => a.rang - b.rang);
    expect(sieges[0].groupe.id).toBe(parRang[0].groupe.id);
    expect(sieges.at(-1)!.groupe.id).toBe(parRang.at(-1)!.groupe.id);
    const a = f.groupes.find((g) => g.groupe.id === 'groupe-a')!;
    expect(a.ligne).toBe('pour');
    expect(partLigne(a)).toBe(86);
    expect(f.votesDifferents.personnes.every((v) => v.position !== v.ligneDuGroupe)).toBe(true);
    expect(f.sens.pour).toBeTruthy();
    provenancesCompletes(f);
  });

  it('Sénat n° 297 : non-votants dans l’hémicycle, sens du vote sans synthèse, pas de compte rendu', async () => {
    const f = await executer(definitions.ConsulterScrutin({ id: 'scrutin-senat-297' }));
    const sieges = siegesScrutin(f.groupes);
    expect(sieges.filter((s) => s.position === 'non_votant')).toHaveLength(f.nonVotants);
    expect(f.sens).toEqual({ pour: null, contre: null });
    expect(f.compteRendu).toBeNull();
  });
});

// ---------- Pourquoi ce vote ----------

describe('Pourquoi ce vote', () => {
  const entree = { scrutin: 'scrutin-an-1874', personne: 'camille-exemple' };

  it('rassemble les faits : vote, groupe, interventions avant, actes, parcours, déclarations, lobbying', async () => {
    const e = await executer(definitions.ExpliquerVote(entree));
    expect(e.vote.position).toBe('contre');
    expect(e.groupe?.ligne).toBe('pour');
    expect(e.interventionsAvant.length).toBeGreaterThan(0);
    expect(e.actes.length).toBeGreaterThan(0);
    expect(e.parcours.length).toBeGreaterThan(0);
    // Lobbying déclaré auprès d'une catégorie de responsables : toujours à vérifier.
    expect(e.lobbying.every((l) => l.vers.statut === 'a_verifier')).toBe(true);
    provenancesCompletes(e);
  });

  it('indicateur sur le thème : toujours avec dénominateur, référence et ce que la donnée ne dit pas', async () => {
    const e = await executer(definitions.ExpliquerVote(entree));
    const i = e.surLeTheme!.ecarts;
    expect(i.denominateur?.valeur).toBeGreaterThan(0);
    expect(i.reference.libelle).toBeTruthy();
    expect(i.ceQueLaDonneeNeDitPas.length).toBeGreaterThan(0);
  });

  it('aucune phrase de causalité, mise au point marquée comme telle', async () => {
    const e: ExplicationVote = await executer(definitions.ExpliquerVote(entree));
    const faits = faitsDuVote(e);
    expect(faits.titre).toBe('Pourquoi Camille Exemple a voté contre ?');
    expect(faits.memePosition).toBe('16 membres du Groupe A sur 140 votes exprimés ont eu la même position.');
    expect(faits.miseAuPoint).toBeNull();
    const avecMiseAuPoint = faitsDuVote({ ...e, vote: { ...e.vote, miseAuPoint: 'voulait voter pour' } });
    expect(avecMiseAuPoint.miseAuPoint).toContain('Mise au point publiée');
    expect(avecMiseAuPoint.miseAuPoint).toContain('n’est pas modifié');
    for (const phrase of [AVERTISSEMENT_POURQUOI, ...Object.values(faits), ...Object.values(avecMiseAuPoint)]) {
      if (phrase) expect(phrase).not.toMatch(CAUSALITE);
    }
    expect(CAUSALITE.test('il a voté contre parce que')).toBe(true);
  });
});
