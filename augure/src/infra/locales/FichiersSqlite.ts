// iOS / Android : une base SQLite par législature, dans les documents de l'app.
// Ouverte depuis le disque (une législature pèse jusqu'à ~125 Mo) : rien n'est chargé en mémoire,
// et un correctif appliqué est enregistré directement.

import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { openDatabaseAsync } from 'expo-sqlite';
import { Gunzip } from 'fflate';

import type { LocalDatabases, SqlDatabase } from '../../core/ports';
import { ExpoSqliteDatabase } from '../sql/ExpoSqliteDatabase';

const nom = (legislature: string) => `on_verra_${legislature}.db`;
const RE_NOM = /^on_verra_(\d+)\.db$/;

export class FichiersSqlite implements LocalDatabases {
  private readonly dossier = new Directory(Paths.document, 'bases');

  async installees(): Promise<string[]> {
    if (!this.dossier.exists) return [];
    return this.dossier
      .list()
      .map((f) => RE_NOM.exec(f.name)?.[1])
      .filter((leg): leg is string => !!leg)
      .sort((a, b) => Number(a) - Number(b));
  }

  async ouvrir(legislature: string): Promise<SqlDatabase | null> {
    if (!new File(this.dossier, nom(legislature)).exists) return null;
    return new ExpoSqliteDatabase(await openDatabaseAsync(nom(legislature), {}, this.dossier.uri));
  }

  async installer(legislature: string, gzip: Uint8Array): Promise<SqlDatabase> {
    if (!this.dossier.exists) this.dossier.create({ intermediates: true });
    // Décompression par morceaux vers un fichier temporaire, puis remplacement : jamais de base à moitié écrite.
    const temporaire = new File(this.dossier, `${nom(legislature)}.installation`);
    if (temporaire.exists) temporaire.delete();
    temporaire.create();
    const sortie = temporaire.open(FileMode.Truncate);
    try {
      const flux = new Gunzip((morceau) => sortie.writeBytesSync(morceau));
      flux.push(gzip, true);
    } finally {
      sortie.close();
    }
    const cible = new File(this.dossier, nom(legislature));
    if (cible.exists) cible.delete();
    await temporaire.move(cible);
    return new ExpoSqliteDatabase(await openDatabaseAsync(nom(legislature), {}, this.dossier.uri));
  }
}
