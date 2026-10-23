// Le cœur complet sur la vraie publication on-verra (sous-module), avec les adapters Node.
// Préalable : `python3 -m on_verra importer && python3 -m on_verra publier` dans on-verra/.

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { gzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ConsulterAssemblee,
  ConsulterChampions,
  ConsulterDepute,
  ConsulterGroupe,
  ConsulterScrutin,
  Explorer,
  ListerLegislatures,
  ListerScrutins,
  Rechercher,
  Synchroniser,
  type Assemblee,
} from '../src/core';
import { EmbeddedPublicationSource } from '../src/infra/publication/EmbeddedPublicationSource';
import { HttpPublicationSource } from '../src/infra/publication/HttpPublicationSource';
import { MemoireNodeSqlite } from '../src/infra/sql/NodeSqlite';
import { creerCoreDeTest, fetchLocal, PUBLICATION, publicationDisponible, URL_TEST } from './support';

describe.skipIf(!publicationDisponible)('données on-verra', () => {
  const { bus, locales } = creerCoreDeTest();
  let assemblee: Assemblee;

  beforeAll(async () => {
    const etat = await bus.execute(Synchroniser({}));
    expect(etat).toMatchObject({ legislature: '17', origine: 'complete' });
    assemblee = await bus.execute(ConsulterAssemblee({}));
  }, 120_000);

  it('liste les législatures publiées, seule la plus récente est installée au démarrage', async () => {
    const l = await bus.execute(ListerLegislatures({}));
    expect(l.map((x) => x.numero)).toEqual(['14', '15', '16', '17']);
    expect(l.filter((x) => x.installee).map((x) => x.numero)).toEqual(['17']);
    expect(locales.installations).toEqual(['17']);
  });

  it("dessine l'Assemblée du dernier scrutin, groupes ordonnés de la gauche vers la droite", () => {
    expect(assemblee.legislature).toBe('17');
    expect(assemblee.scrutin).not.toBeNull();
    expect(assemblee.membres.length).toBeGreaterThan(550);
    expect(assemblee.membres.length).toBeLessThanOrEqual(577);
    const ordre = assemblee.groupes.map((g) => g.abrege);
    expect(ordre[0]).toBe('LFI-NFP');
    expect(ordre.at(-1)).toBe('RN');
    expect(ordre.indexOf('SOC')).toBeLessThan(ordre.indexOf('EPR'));
    // Effectifs cohérents avec la liste des membres, groupes contigus.
    expect(assemblee.groupes.reduce((s, g) => s + g.sieges, 0)).toBe(assemblee.membres.filter((m) => m.groupe).length);
    const sequence = assemblee.membres.map((m) => m.groupe).filter((g, i, t) => g !== t[i - 1]);
    expect(new Set(sequence).size).toBe(sequence.length);
  });

  it('chaque membre a une position sur le dernier scrutin (vote ou absent)', () => {
    const s = assemblee.scrutin!;
    const compte = (p: string) => assemblee.membres.filter((m) => m.position === p).length;
    expect(compte('pour')).toBe(s.decompte.pour);
    expect(compte('contre')).toBe(s.decompte.contre);
    expect(assemblee.membres.every((m) => m.position !== null)).toBe(true);
  });

  it("télécharge une ancienne législature à sa consultation, avec ses propres groupes", async () => {
    const a15 = await bus.execute(ConsulterAssemblee({ legislature: '15' }));
    const abreges = a15.groupes.map((g) => g.abrege);
    expect(abreges).toContain('LAREM');
    expect(abreges).not.toContain('EPR');
    expect(locales.installations).toEqual(['17', '15']);
  }, 60_000);

  it('fiche groupe : effectif, présence, vote uni, derniers votes', async () => {
    const rn = assemblee.groupes.at(-1)!;
    const fiche = await bus.execute(ConsulterGroupe({ ref: rn.ref, legislature: '17' }));
    expect(fiche.sieges).toBe(rn.sieges);
    expect(fiche.stats.presence).toBeGreaterThan(0);
    expect(fiche.stats.presence).toBeLessThanOrEqual(1);
    expect(fiche.stats.voteUni).toBeGreaterThan(0.5);
    expect(fiche.derniersVotes.length).toBeGreaterThan(0);
    expect(fiche.membres).toHaveLength(fiche.sieges);
  }, 60_000);

  it("fiche d'un groupe disparu : montré à son dernier jour d'existence", async () => {
    // AD (07-09/2024) → UDR (09/2024-09/2025) → UDDPLR : AD a disparu avant tout scrutin public.
    const ad = await bus.execute(ConsulterGroupe({ ref: 'PO845520', legislature: '17' }));
    expect(ad).toMatchObject({ date: '2024-09-11', derniersVotes: [] });
    expect(ad.sieges).toBeGreaterThan(10);
    const udr = await bus.execute(ConsulterGroupe({ ref: 'PO847173', legislature: '17' }));
    expect(udr.date <= '2025-09-04').toBe(true);
    expect(udr.sieges).toBeGreaterThan(10);
    }, 60_000);

  it('fiche scrutin : décompte, groupes, absents, lien officiel', async () => {
    const s = assemblee.scrutin!;
    const fiche = await bus.execute(ConsulterScrutin({ uid: s.uid }));
    const somme = fiche.groupes.reduce((t, g) => t + g.decompte.pour, 0);
    expect(somme).toBe(s.decompte.pour);
    expect(fiche.absents).toBe(assemblee.membres.filter((m) => m.position === 'absent').length);
    expect(fiche.lienOfficiel).toBe(`https://www.assemblee-nationale.fr/dyn/17/scrutins/${s.numero}`);
  });

  it("fiche député : 12 mois de votes, écarts mesurés au groupe du moment du vote", async () => {
    const membre = assemblee.membres.find((m) => m.position === 'pour')!;
    const fiche = await bus.execute(ConsulterDepute({ acteur: membre.acteur, legislature: '17' }));
    expect(fiche.votes.length).toBeGreaterThan(1000); // tous les scrutins : amendements compris
    expect(fiche.bilan.total).toBe(fiche.votes.length);
    expect(fiche.periode.fin).toBe(assemblee.date);
    for (const v of fiche.votes) {
      expect(v.scrutin.date >= fiche.periode.debut && v.scrutin.date <= fiche.periode.fin).toBe(true);
      if (v.ecart) expect(v.position).not.toBe(v.ligneGroupe);
    }
    const scrutin = await bus.execute(ConsulterScrutin({ uid: assemblee.scrutin!.uid, depute: membre.acteur }));
    expect(scrutin.depute?.position).toBe('pour');
  }, 60_000);

  it('liste les votes finaux par défaut, les autres natures sur demande', async () => {
    const majeurs = await bus.execute(ListerScrutins({ niveau: 'majeure', limite: 5 }));
    expect(majeurs.length).toBe(5);
    expect(majeurs.every((s) => s.niveau === 'majeure' && ['ensemble', 'article_unique'].includes(s.nature))).toBe(true);
    expect(majeurs[0].date >= majeurs[4].date).toBe(true);

    const amendements = await bus.execute(ListerScrutins({ natures: ['amendement'], resultat: 'adopte', limite: 10 }));
    expect(amendements).toHaveLength(10);
    expect(amendements.every((s) => s.nature === 'amendement' && s.sort?.startsWith('adopt'))).toBe(true);
    expect(amendements[0].intitule).toMatch(/amendement/i);
  });

  it('fiche groupe enrichie : écarts internes, alliances, présence mensuelle, thèmes, membres', async () => {
    const soc = assemblee.groupes.find((g) => g.abrege === 'SOC')!;
    const fiche = await bus.execute(ConsulterGroupe({ ref: soc.ref, legislature: '17' }));
    expect(fiche.stats.ecartsInternes).toBeGreaterThan(0);
    expect(fiche.stats.ecartsInternes).toBeLessThan(0.5);
    expect(fiche.stats.motions.total).toBeGreaterThan(10);
    // Le plus proche des socialistes est un groupe de gauche, pas le RN.
    expect(['ECOS', 'GDR', 'LFI-NFP', 'LIOT']).toContain(fiche.alliances[0].groupe.abrege);
    expect(fiche.presenceMensuelle.length).toBe(12);
    expect(fiche.presenceMensuelle[0].mois < fiche.presenceMensuelle[11].mois).toBe(true);
    expect(fiche.composition.femmes + fiche.composition.hommes).toBe(fiche.sieges);
    expect(fiche.themes.length).toBeGreaterThan(3);
    expect(fiche.membres.every((m) => m.presence === null || (m.presence >= 0 && m.presence <= 1))).toBe(true);
  }, 60_000);

  it('catalogue : députés, groupes, thèmes et territoires de la législature', async () => {
    const c = await bus.execute(Explorer({}));
    expect(c.deputes.length).toBeGreaterThan(577); // départs et remplaçants compris
    expect(c.groupes.reduce((s, g) => s + g.sieges, 0)).toBeGreaterThan(550);
    expect(c.themes.reduce((s, t) => s + t.scrutins, 0)).toBe(c.scrutins);
    expect(c.territoires.find((t) => t.departement === 'Paris')?.deputes).toBe(18);
  }, 60_000);

  it('liste les scrutins d’un thème', async () => {
    const budget = await bus.execute(ListerScrutins({ theme: 'Budget', natures: ['amendement'], limite: 5 }));
    expect(budget).toHaveLength(5);
    expect(budget.every((s) => s.nature === 'amendement')).toBe(true);
  }, 60_000);

  it('champions : activité par député et par thème sur 12 mois', async () => {
    const debut = Date.now();
    const c = await bus.execute(ConsulterChampions({}));
    console.info(`Champions calculés en ${Date.now() - debut} ms`);
    expect(c.deputes.length).toBe(assemblee.membres.length);
    expect(c.themes.length).toBeGreaterThan(5);
    for (const d of c.deputes.slice(0, 50)) {
      for (const t of Object.values(d.parTheme)) {
        expect(t.absences).toBeLessThanOrEqual(t.scrutins);
        expect(t.ecarts).toBeLessThanOrEqual(t.exprimes);
        expect(t.pour).toBeLessThanOrEqual(t.exprimes);
      }
    }
    const total = (d: (typeof c.deputes)[number]) => Object.values(d.parTheme).reduce((s, t) => s + t.exprimes, 0);
    expect(Math.max(...c.deputes.map(total))).toBeGreaterThan(500);
  }, 120_000);

  it('recherche sans tenir compte des accents ni de la casse, dans une législature', async () => {
    const r = await bus.execute(Rechercher({ texte: 'melenchon', legislature: '15' }));
    expect(r.deputes.some((d) => d.nom === 'Mélenchon' && d.legislature === '15')).toBe(true);
    const lois = await bus.execute(Rechercher({ texte: 'SECURITE SOCIALE' }));
    expect(lois.scrutins.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!publicationDisponible)('synchronisation par correctifs', () => {
  const manifeste = JSON.parse(readFileSync(join(PUBLICATION, '17/manifest.json'), 'utf8'));
  const v = manifeste.version;

  /** Publication fictive v+1 de la 17e : un correctif au format on-verra (vérification de la version de départ). */
  function publicationSuivante(versionDeDepart: number) {
    const script = [
      'BEGIN;',
      'CREATE TEMP TABLE verification_version (ok INTEGER CHECK (ok = 1));',
      `INSERT INTO verification_version SELECT COALESCE((SELECT valeur FROM meta WHERE cle = 'version') = '${versionDeDepart}', 0);`,
      `UPDATE meta SET valeur = '${v + 1}' WHERE cle = 'version';`,
      'DROP TABLE verification_version;',
      'COMMIT;',
    ].join('\n');
    const gz = gzipSync(new TextEncoder().encode(script));
    const correctif = { fichier: `maj-${v}-${v + 1}.sql.gz`, taille: gz.length, sha256: bytesToHex(sha256(gz)), de: v, vers: v + 1 };
    const suivant = { ...manifeste, version: v + 1, correctifs: [correctif], nouveautes: [] };
    return fetchLocal(PUBLICATION, { '17/manifest.json': JSON.stringify(suivant), [`17/${correctif.fichier}`]: gz });
  }

  /** Bases locales comme sur un appareil où la 17e a déjà été installée. */
  async function appareilEnVersion(): Promise<MemoireNodeSqlite> {
    const { bus, locales } = creerCoreDeTest();
    await bus.execute(Synchroniser({}));
    return locales;
  }

  it('applique le correctif à la base locale', async () => {
    const locales = await appareilEnVersion();
    const { bus } = creerCoreDeTest({ locales, source: new HttpPublicationSource(URL_TEST, publicationSuivante(v)) });
    expect(await bus.execute(Synchroniser({}))).toMatchObject({ origine: 'correctifs', version: v + 1, avertissement: null });
    expect(locales.installations).toEqual(['17']); // pas de retéléchargement de la base complète
  }, 120_000);

  it('garde la base locale si le correctif ne part pas de sa version', async () => {
    const locales = await appareilEnVersion();
    const { bus } = creerCoreDeTest({ locales, source: new HttpPublicationSource(URL_TEST, publicationSuivante(v + 7)) });
    const etat = await bus.execute(Synchroniser({}));
    expect(etat.version).toBe(v);
    expect(etat.avertissement).toMatch(/Mise à jour impossible/);
    expect((await bus.execute(ConsulterAssemblee({}))).membres.length).toBeGreaterThan(550);
  }, 120_000);

  it('démarre hors connexion avec les bases déjà sur l’appareil', async () => {
    const locales = await appareilEnVersion();
    const horsLigne = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const { bus } = creerCoreDeTest({ locales, source: new HttpPublicationSource(URL_TEST, horsLigne) });
    expect(await bus.execute(Synchroniser({}))).toMatchObject({ legislature: '17', origine: 'locale' });
    expect((await bus.execute(ListerLegislatures({}))).map((l) => l.numero)).toEqual(['17']);
  }, 120_000);

  it('ouvre la base embarquée dans l’app (assets/donnees)', async () => {
    const dossier = join(__dirname, '../assets/donnees');
    const lire = (chemin: string) => JSON.parse(readFileSync(join(dossier, chemin), 'utf8'));
    const source = new EmbeddedPublicationSource(lire('index.json'), {
      '17': { manifeste: lire('17/manifest.json'), base: async () => new Uint8Array(readFileSync(join(dossier, '17/on_verra.db.gz'))) },
    });
    const { bus } = creerCoreDeTest({ source });
    expect(await bus.execute(Synchroniser({}))).toMatchObject({ legislature: '17', origine: 'complete', avertissement: null });
    expect((await bus.execute(ConsulterAssemblee({}))).membres.length).toBeGreaterThan(550);
  }, 120_000);

  it('refuse un fichier dont l’empreinte ne correspond pas', async () => {
    const corrompu = { ...manifeste, base: { ...manifeste.base, sha256: '0'.repeat(64) } };
    const source = new HttpPublicationSource(URL_TEST, fetchLocal(PUBLICATION, { '17/manifest.json': JSON.stringify(corrompu) }));
    const { bus } = creerCoreDeTest({ source });
    await expect(bus.execute(Synchroniser({}))).rejects.toThrow(/SHA-256/);
  }, 60_000);
});
