// Format du dossier de publication produit par `python3 -m src publier`
// (opendata/src/publication.py) et règles de mise à jour des bases locales.
//
//   index.json               législatures publiées (une base par législature)
//   <leg>/manifest.json      version, base complète, correctifs

import type { Nouveaute } from './model';

export interface PartitionPubliee {
  legislature: string;
  debut: string;
  fin: string;
  scrutins: number;
  version: number;
  /** Chemin du manifeste, relatif à index.json (ex. "17/manifest.json"). */
  manifeste: string;
  taille: number;
}

export interface IndexPublication {
  date: string;
  legislatures: PartitionPubliee[];
}

export function lireIndex(json: unknown): IndexPublication {
  const o = json as Record<string, any>;
  if (!Array.isArray(o?.legislatures)) throw new Error('index.json invalide');
  const legislatures = o.legislatures.map((p: any): PartitionPubliee => {
    if (typeof p?.legislature !== 'string' || typeof p?.manifeste !== 'string') throw new Error('index.json invalide');
    return {
      legislature: p.legislature,
      debut: String(p.debut ?? ''),
      fin: String(p.fin ?? ''),
      scrutins: Number(p.scrutins ?? 0),
      version: Number(p.version ?? 0),
      manifeste: p.manifeste,
      taille: Number(p.taille ?? 0),
    };
  });
  legislatures.sort((a: PartitionPubliee, b: PartitionPubliee) => Number(a.legislature) - Number(b.legislature));
  return { date: String(o.date ?? ''), legislatures };
}

/** Dossier d'une partition, relatif à index.json (ex. "17/"). */
export function dossierPartition(p: PartitionPubliee): string {
  const i = p.manifeste.lastIndexOf('/');
  return i < 0 ? '' : p.manifeste.slice(0, i + 1);
}

export interface FichierPublie {
  fichier: string;
  taille: number;
  sha256: string;
}

export interface Correctif extends FichierPublie {
  de: number;
  vers: number;
}

export interface Manifeste {
  version: number;
  date: string;
  schema: string;
  base: FichierPublie;
  correctifs: Correctif[];
  nouveautes: Nouveaute[];
}

export type Plan =
  | { type: 'a-jour' }
  | { type: 'correctifs'; liste: Correctif[] }
  | { type: 'complete' };

export function lireManifeste(json: unknown): Manifeste {
  const o = json as Record<string, any>;
  const fichier = (f: any): FichierPublie => {
    if (typeof f?.fichier !== 'string' || typeof f?.sha256 !== 'string' || typeof f?.taille !== 'number') {
      throw new Error('Manifeste invalide : fichier mal décrit');
    }
    return { fichier: f.fichier, taille: f.taille, sha256: f.sha256 };
  };
  if (typeof o?.version !== 'number' || typeof o?.schema !== 'string') throw new Error('Manifeste invalide');
  return {
    version: o.version,
    date: String(o.date ?? ''),
    schema: o.schema,
    base: fichier(o.base),
    correctifs: (o.correctifs ?? []).map((c: any) => ({ ...fichier(c), de: Number(c.de), vers: Number(c.vers) })),
    nouveautes: (o.nouveautes ?? []).map((n: any) => ({
      loi: n.loi ?? null,
      titre: n.titre ?? null,
      date: String(n.date),
      evenement: String(n.evenement),
      detail: n.detail ?? null,
    })),
  };
}

/** Ce qu'il faut télécharger pour passer de la version locale à celle du manifeste. */
export function planifier(versionLocale: number, schemaLocal: string | null, m: Manifeste): Plan {
  if (m.version <= versionLocale) return { type: 'a-jour' };
  if (schemaLocal !== m.schema) return { type: 'complete' };
  const liste: Correctif[] = [];
  let v = versionLocale;
  while (v < m.version) {
    // Un maillon manquant (correctif retiré, version trop ancienne) : base complète.
    const c = m.correctifs.find((x) => x.de === v);
    if (!c) return { type: 'complete' };
    liste.push(c);
    v = c.vers;
  }
  return { type: 'correctifs', liste };
}

/** Instructions d'un correctif : une par ligne ; la transaction est gérée par l'app. */
export function instructions(script: string): string[] {
  return script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== 'BEGIN;' && l !== 'COMMIT;');
}
