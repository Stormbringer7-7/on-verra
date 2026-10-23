import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { FichiersSqlite } from '../infra/locales/FichiersSqlite';

/** iOS / Android : une base SQLite par législature, sur le disque de l'appareil. */
export const creerLocales = () => new FichiersSqlite();

/** Octets d'un asset embarqué (copié dans le cache de l'app par expo-asset). */
export async function lireAsset(module: number): Promise<Uint8Array> {
  const asset = await Asset.fromModule(module).downloadAsync();
  return new File(asset.localUri!).bytes();
}
