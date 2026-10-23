import { MemoireSqlite } from '../infra/locales/MemoireSqlite';

/** Web : expo-file-system n'existe pas, les législatures consultées sont gardées en mémoire. */
export const creerLocales = () => new MemoireSqlite();
