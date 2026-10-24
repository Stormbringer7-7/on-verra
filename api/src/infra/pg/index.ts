// Adaptateurs Postgres de tous les ports, sur une même base : ce que la racine de composition
// donne au cœur quand SOURCE_DONNEES=postgres. Chaque classe lit `canon` et `lecture` (G1 à G6 de
// api/src/ports.ts) ; seule PgSignalements écrit (analytique.signalement).

import type { Depots, SqlDatabase } from '../../ports';
import { PgDiscussions } from './discussions';
import { PgDossiers } from './dossiers';
import { PgInstitutions } from './institutions';
import { PgPersonnes } from './personnes';
import { PgRecherche } from './recherche';
import { PgScrutins } from './scrutins';
import { PgSignalements } from './signalements';
import { PgTransparence } from './transparence';

export function depotsPostgres(db: SqlDatabase): Depots {
  return {
    dossiers: new PgDossiers(db),
    discussions: new PgDiscussions(db),
    personnes: new PgPersonnes(db),
    scrutins: new PgScrutins(db),
    institutions: new PgInstitutions(db),
    transparence: new PgTransparence(db),
    recherche: new PgRecherche(db),
    signalements: new PgSignalements(db),
  };
}

/**
 * Marque du dernier chargement, lue sans écrire : `opendata projeter` (fin de chaque chargement)
 * supprime et recrée le schéma `lecture` dans une transaction, si bien que son oid change à chaque
 * nouvelle version des données, au moment exact où elle devient visible. null : jamais projeté.
 */
export async function marqueDuChargement(db: SqlDatabase): Promise<string | null> {
  const r = await db.first<{ marque: string | null }>(
    "SELECT (SELECT oid::text FROM pg_namespace WHERE nspname = 'lecture') AS marque",
  );
  return r?.marque ?? null;
}
