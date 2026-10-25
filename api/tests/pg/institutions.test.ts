// PgInstitutions sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon) :
// composition de l'AN et du Sénat au 24/10/2026, gouvernements de la 17e législature, décisions
// récentes du Conseil constitutionnel (2026-914 DC reliée à DLR5L17N54085).

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PgInstitutions } from '../../src/infra/pg/institutions';
import type { SqlDatabase, SqlParams } from '../../src/ports';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;

/** SqlDatabase minimal, session en lecture seule : aucune écriture possible depuis ces tests. */
function base(url: string): { db: SqlDatabase; fermer: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 4, options: '-c default_transaction_read_only=on -c statement_timeout=120000' });
  const all = async <T>(sql: string, params: SqlParams = {}): Promise<T[]> => {
    const noms: string[] = [];
    const text = sql.replace(/\$([A-Za-z_]\w*)/g, (_, nom: string) => {
      let i = noms.indexOf(nom);
      if (i < 0) i = noms.push(nom) - 1;
      return `$${i + 1}`;
    });
    return (await pool.query(text, noms.map((n) => params[n]))).rows as T[];
  };
  return { db: { all, first: async <T>(sql: string, params?: SqlParams) => (await all<T>(sql, params))[0] ?? null }, fermer: () => pool.end() };
}

describe.skipIf(!URL_LECTURE)('PgInstitutions (base réelle, lecture seule)', () => {
  const { db, fermer } = base(URL_LECTURE ?? '');
  afterAll(fermer);
  const depot = new PgInstitutions(db);

  it('Assemblée au 24/10/2026 : 17e législature, sièges par groupe avec leur couleur publiée', async () => {
    const an = await depot.chambre('an', '2026-10-24');
    expect(an).toMatchObject({ type: 'an', libelle: 'Assemblée nationale', legislature: '17', date: '2026-10-24' });
    expect(an.sieges).toBeGreaterThan(550);
    expect(an.sieges).toBeLessThanOrEqual(577);
    expect(an.groupes.reduce((s, g) => s + g.sieges, 0) + an.sansGroupe).toBe(an.sieges);
    expect(an.groupes.map((g) => g.rang)).toEqual(an.groupes.map((_, i) => i));
    expect(an.groupes.every((g) => g.groupe.chambre === 'AN')).toBe(true);
    const abreges = an.groupes.map((g) => g.groupe.abrege);
    expect(abreges).toEqual(expect.arrayContaining(['RN', 'EPR', 'LFI-NFP', 'SOC', 'DR', 'NI']));
    expect(new Set(abreges).size).toBe(abreges.length);
    expect(an.groupes.find((g) => g.groupe.abrege === 'RN')!.groupe.couleur).toMatch(/^#[0-9A-F]{6}$/i);
    // De gauche à droite d'après les sièges publiés (lecture.position_groupe) ; non-inscrits en dernier.
    const ordre = an.groupes.map((g) => g.groupe.abrege);
    expect(ordre.indexOf('LFI-NFP')).toBeLessThan(ordre.indexOf('SOC'));
    expect(ordre.indexOf('SOC')).toBeLessThan(ordre.indexOf('EPR'));
    expect(ordre.indexOf('EPR')).toBeLessThan(ordre.indexOf('DR'));
    expect(ordre.indexOf('DR')).toBeLessThan(ordre.indexOf('RN'));
    expect(ordre[ordre.length - 1]).toBe('NI');
  });

  it('Sénat : groupes du Sénat lui-même (pas les copies de l’AMO), un sénateur compté une fois', async () => {
    const senat = await depot.chambre('senat', '2026-10-24');
    expect(senat).toMatchObject({ type: 'senat', libelle: 'Sénat', legislature: null });
    expect(senat.sieges).toBeGreaterThan(300);
    expect(senat.sieges).toBeLessThanOrEqual(348);
    expect(senat.groupes.reduce((s, g) => s + g.sieges, 0) + senat.sansGroupe).toBe(senat.sieges);
    const ids = senat.groupes.map((g) => g.groupe.id);
    const systemes = await db.all<{ systeme: string }>(
      `SELECT DISTINCT systeme FROM canon.correspondance WHERE entite_id = ANY($ids::uuid[]) AND statut = 'VERIFIED'`,
      { ids },
    );
    expect(systemes.map((s) => s.systeme)).toEqual(['SENAT']);
  });

  it('composition nominative : chaque parlementaire une fois, avec son groupe, rangé comme les groupes', async () => {
    for (const ch of ['an', 'senat'] as const) {
      const t0 = Date.now();
      const c = await depot.chambre(ch, '2026-10-24');
      expect(Date.now() - t0, ch).toBeLessThan(5_000);
      expect(c.membres).toHaveLength(c.sieges);
      expect(new Set(c.membres.map((m) => m.personne.id)).size).toBe(c.membres.length);
      for (const g of c.groupes) expect(c.membres.filter((m) => m.personne.groupe?.id === g.groupe.id).length, g.groupe.abrege).toBe(g.sieges);
      const rangs = new Map(c.groupes.map((g) => [g.groupe.id, g.rang]));
      const suite = c.membres.map((m) => (m.personne.groupe ? (rangs.get(m.personne.groupe.id) ?? 99) : 99));
      expect(suite).toEqual([...suite].sort((a, b) => a - b));
    }
    // Sénat : le « N° de siège Hémicycle » publié pour presque tous (347 sur 348 au 25/10/2026).
    const senat = await depot.chambre('senat', '2026-10-24');
    expect(senat.membres.filter((m) => m.siege !== null).length).toBeGreaterThan(300);
  });

  it('Gouvernement au 24/10/2026 : Lecornu II, Premier ministre en tête, gouvernements de la législature', async () => {
    const g = await depot.gouvernement('2026-10-24');
    expect(g.actuel).toMatchObject({ nom: 'Gouvernement Lecornu II', debut: '2025-10-11', fin: null });
    expect(g.actuel!.membres[0]).toMatchObject({ fonction: 'Premier ministre', personne: { nom: 'Sébastien Lecornu' } });
    expect(g.actuel!.membres.length).toBeGreaterThan(20);
    // Les parlementaires « en mission » auprès d'un ministère ne sont pas membres du Gouvernement.
    expect(g.actuel!.membres.some((m) => /en mission/i.test(m.fonction))).toBe(false);
    expect(g.actuel!.membres.every((m) => m.depuis && m.depuis >= '2025-10-11')).toBe(true);
    expect(g.gouvernements.map((x) => x.nom)).toEqual(
      expect.arrayContaining(['Gouvernement Lecornu II', 'Gouvernement Lecornu', 'Gouvernement Bayrou', 'Gouvernement Barnier', 'Gouvernement Attal']),
    );
    expect(g.gouvernements.map((x) => x.nom)).not.toContain('Gouvernement Borne');
    const debuts = g.gouvernements.map((x) => x.debut ?? '');
    expect(debuts).toEqual([...debuts].sort().reverse());
    const anciens = g.actuel!.membres.filter((m) => m.ancienne);
    expect(anciens.every((m) => /^ancien(ne)? (député|sénat)/.test(m.ancienne!))).toBe(true);
  });

  it('Gouvernement à une date passée : celui alors en fonction', async () => {
    const g = await depot.gouvernement('2025-01-15');
    expect(g.actuel).toMatchObject({ nom: 'Gouvernement Bayrou', debut: '2024-12-14', fin: '2025-09-09' });
    expect(g.gouvernements[0].nom).toBe('Gouvernement Bayrou');
  });

  it('Conseil constitutionnel : DC et QPC récentes, 2026-914 DC reliée au dossier agricole', async () => {
    const cc = await depot.conseilConstitutionnel(100);
    expect(cc.decisions.every((d) => d.type === 'DC' || d.type === 'QPC')).toBe(true);
    const dates = cc.decisions.map((d) => d.date ?? '');
    expect(dates).toEqual([...dates].sort().reverse());
    const d914 = cc.decisions.find((d) => d.numero === '2026-914 DC')!;
    expect(d914).toMatchObject({
      date: '2026-08-14',
      solution: 'Non conformité partielle - réserve',
      dossier: { titre: 'Projet de loi d’urgence pour la protection et la souveraineté agricoles' },
      provenance: { systeme: 'CONSTIT', type: 'decision', idNatif: '2026-914' },
    });
    expect(d914.url).toMatch(/^https:\/\/www\.conseil-constitutionnel\.fr\//);
    expect(cc.decisions.every((d) => d.provenance.systeme === 'CONSTIT')).toBe(true);
    // Saisines en cours : ni décision, ni promulgation publiées depuis.
    for (const s of cc.saisinesEnCours) expect(s.dossier.titre).toBeTruthy();
    expect(cc.saisinesEnCours.map((s) => s.dossier.titre)).not.toContain('Prévenir les ingérences étrangères en France');
    expect((await depot.conseilConstitutionnel(3)).decisions).toHaveLength(3);
  });
});
