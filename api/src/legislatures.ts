// Législatures chargées dans Postgres (table public.legislatures, tenue par opendata) :
// une base par législature, la clé de partition d'opendata.

import type { EtatBase, Legislature, Nouveaute } from '@contrat/domain/model';

import type { SqlDatabase } from './ports';

/** "VTANR5L17V1330" → "17" */
export function legislatureDuScrutin(uid: string): string {
  const m = /L(\d+)V/.exec(uid);
  if (!m) throw new Error(`Identifiant de scrutin inattendu : ${uid}`);
  return m[1];
}

interface LigneLegislature {
  legislature: string;
  debut: string;
  fin: string;
  scrutins: number;
  version: number;
  date: string;
  schema: string;
  nouveautes: Nouveaute[];
}

export interface LegislaturesDeps {
  index: SqlDatabase;
  /** Base d'une législature (schéma « l17 »). */
  base: (legislature: string) => SqlDatabase;
}

export class Legislatures {
  private lignes: LigneLegislature[] | null = null;
  private readonly bases = new Map<string, SqlDatabase>();

  constructor(private readonly deps: LegislaturesDeps) {}

  async chargerIndex(): Promise<void> {
    const lignes = await this.deps.index.all<LigneLegislature>(
      `SELECT legislature, debut, fin, scrutins, version, date, schema, nouveautes
       FROM legislatures ORDER BY CAST(legislature AS integer)`,
    );
    if (!lignes.length) throw new Error('Aucune législature dans la base : premier import en cours.');
    this.lignes = lignes;
  }

  private async connues(): Promise<LigneLegislature[]> {
    if (!this.lignes) await this.chargerIndex();
    return this.lignes!;
  }

  async derniere(): Promise<string> {
    return (await this.connues()).at(-1)!.legislature;
  }

  async legislatures(): Promise<Legislature[]> {
    return (await this.connues()).map((l) => ({
      numero: l.legislature, debut: l.debut, fin: l.fin, scrutins: l.scrutins,
    }));
  }

  async db(legislature: string): Promise<SqlDatabase> {
    if (!(await this.connues()).some((l) => l.legislature === legislature)) {
      throw new Error(`La ${legislature}e législature n'est pas disponible.`);
    }
    let db = this.bases.get(legislature);
    if (!db) this.bases.set(legislature, (db = this.deps.base(legislature)));
    return db;
  }

  async etat(legislature: string): Promise<EtatBase> {
    const l = (await this.connues()).find((x) => x.legislature === legislature);
    if (!l) throw new Error(`La ${legislature}e législature n'est pas disponible.`);
    return {
      legislature, version: l.version, date: l.date, schema: l.schema,
      nouveautes: l.nouveautes, avertissement: null,
    };
  }
}
