import { Asset } from 'expo-asset';

import { MemoireSqlite } from '../infra/locales/MemoireSqlite';

/** Web : expo-file-system n'existe pas, les législatures consultées sont gardées en mémoire. */
export const creerLocales = () => new MemoireSqlite();

/** Octets d'un asset embarqué : servi comme un fichier statique à côté de l'app. */
export async function lireAsset(module: number): Promise<Uint8Array> {
  const reponse = await fetch(Asset.fromModule(module).uri);
  if (!reponse.ok) throw new Error(`Asset introuvable : HTTP ${reponse.status}`);
  return new Uint8Array(await reponse.arrayBuffer());
}
