// Une base par législature (clé de partition de opendata), ouverte à la demande :
// copie locale d'abord, puis mise à jour depuis la publication quand c'est possible.

import type { EtatBase, Legislature } from './domain/model';
import { instructions, planifier, type PartitionPubliee } from './domain/publication';
import type { LocalDatabases, Logger, MetaBase, PublicationSource, SqlDatabase } from './ports';

export interface PartitionsDeps {
  source: PublicationSource;
  locales: LocalDatabases;
  logger: Logger;
}

interface Preparee {
  db: SqlDatabase;
  etat: EtatBase;
}

/** "VTANR5L17V1330" → "17" */
export function legislatureDuScrutin(uid: string): string {
  const m = /L(\d+)V/.exec(uid);
  if (!m) throw new Error(`Identifiant de scrutin inattendu : ${uid}`);
  return m[1];
}

async function lireMeta(db: SqlDatabase): Promise<MetaBase> {
  const rows = await db.all<{ cle: string; valeur: string }>('SELECT cle, valeur FROM meta');
  const m = Object.fromEntries(rows.map((r) => [r.cle, r.valeur]));
  return { version: Number(m.version ?? 0), date: m.date ?? '', schema: m.schema ?? '' };
}

export class Partitions {
  private index: PartitionPubliee[] | null = null;
  private readonly preparees = new Map<string, Promise<Preparee>>();

  constructor(private readonly deps: PartitionsDeps) {}

  /** Lit l'index publié ; hors connexion, les législatures déjà présentes sur l'appareil. */
  async chargerIndex(): Promise<void> {
    const { source, locales, logger } = this.deps;
    let cause = 'aucune adresse de publication configurée';
    if (source.configured) {
      try {
        this.index = (await source.index()).legislatures;
        return;
      } catch (e) {
        cause = e instanceof Error ? e.message : String(e);
        logger.warn('Index de publication indisponible, bases locales seulement', e);
      }
    }
    const installees = await locales.installees();
    if (!installees.length) {
      // La cause (HTTP 404, erreur réseau…) dit quoi corriger : publication pas encore faite, mauvaise adresse…
      throw new Error(`Aucune base disponible : publication injoignable (${cause}) et rien sur l’appareil.`);
    }
    this.index = installees.map((legislature) => ({
      legislature, debut: '', fin: '', scrutins: 0, version: 0, manifeste: `${legislature}/manifest.json`, taille: 0,
    }));
  }

  private partitionsConnues(): PartitionPubliee[] {
    if (!this.index) throw new Error('Index non chargé : lancez Synchroniser');
    return this.index;
  }

  derniere(): string {
    const p = this.partitionsConnues().at(-1);
    if (!p) throw new Error('Aucune législature publiée');
    return p.legislature;
  }

  async legislatures(): Promise<Legislature[]> {
    const installees = new Set(await this.deps.locales.installees());
    return this.partitionsConnues().map((p) => ({
      numero: p.legislature,
      debut: p.debut,
      fin: p.fin,
      scrutins: p.scrutins,
      installee: installees.has(p.legislature) || this.preparees.has(p.legislature),
    }));
  }

  /** Base de la législature, prête à interroger (téléchargée à la première consultation). */
  async db(legislature: string): Promise<SqlDatabase> {
    return (await this.preparer(legislature)).db;
  }

  preparer(legislature: string): Promise<Preparee> {
    let p = this.preparees.get(legislature);
    if (!p) {
      p = this.ouvrir(legislature);
      this.preparees.set(legislature, p);
      // Un échec (hors connexion, publication absente) peut être retenté plus tard.
      p.catch(() => this.preparees.delete(legislature));
    }
    return p;
  }

  private async ouvrir(legislature: string): Promise<Preparee> {
    const { source, locales } = this.deps;
    let db = await locales.ouvrir(legislature);
    let meta = db ? await lireMeta(db) : null;
    const publiee = this.partitionsConnues().find((p) => p.legislature === legislature);

    if (!source.configured || !publiee || publiee.version === 0) {
      if (!db || !meta) throw new Error(`La ${legislature}e législature n'est pas disponible sur cet appareil.`);
      return { db, etat: { legislature, ...meta, origine: 'locale', nouveautes: [], avertissement: null } };
    }

    try {
      const manifeste = await source.manifeste(publiee);
      const plan = planifier(meta?.version ?? 0, meta?.schema ?? null, manifeste);
      let origine: EtatBase['origine'] = 'locale';

      if (plan.type === 'correctifs' && db) {
        for (const c of plan.liste) {
          const script = new TextDecoder().decode(await source.telecharger(publiee, c));
          // Chaque correctif vérifie sa version de départ et s'annule entièrement s'il échoue.
          await db.transaction(instructions(script));
        }
        origine = 'correctifs';
      } else if (plan.type !== 'a-jour' || !db) {
        const gzip = await source.telechargerCompresse(publiee, manifeste.base);
        await db?.close();
        db = await locales.installer(legislature, gzip);
        origine = 'complete';
      }

      meta = await lireMeta(db);
      return {
        db,
        etat: { legislature, ...meta, origine, nouveautes: origine === 'locale' ? [] : manifeste.nouveautes, avertissement: null },
      };
    } catch (e) {
      // Hors connexion ou publication indisponible : on garde la copie locale si elle existe.
      if (!db || !meta) throw e;
      const message = e instanceof Error ? e.message : String(e);
      return {
        db,
        etat: { legislature, ...meta, origine: 'locale', nouveautes: [], avertissement: `Mise à jour impossible : ${message}` },
      };
    }
  }
}
