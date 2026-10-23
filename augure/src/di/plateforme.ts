import { FichiersSqlite } from '../infra/locales/FichiersSqlite';

/** iOS / Android : une base SQLite par législature, sur le disque de l'appareil. */
export const creerLocales = () => new FichiersSqlite();
