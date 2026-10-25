// « Où en sont les textes » : phrases et libellés construits depuis `AvancementDesTextes` (fonctions
// pures, testées sous Node). On dit où, depuis quand et le délai fixé par un texte ; jamais « bloqué ».

import type { AttenteAdministrative, AttenteHorsParlement, DemandeAvancement, FileEtape, Lieu, TexteEnAttente } from '@/core';
import { dateLongue, nombre, pluriel } from './format';

export const ATTENDUS: Record<AttenteHorsParlement, string> = {
  decision_cc: 'Décision du Conseil constitutionnel',
  promulgation: 'Promulgation',
  publication_jo: 'Publication au Journal officiel',
};

/** Qui doit agir, en toutes lettres. */
export function acteur(qui: Lieu): string {
  switch (qui) {
    case 'CC':
      return 'Conseil constitutionnel';
    case 'PR':
      return 'Président de la République';
    case 'GOUVERNEMENT':
      return 'Gouvernement';
    case 'JO':
      return 'Journal officiel';
    case 'CMP':
      return 'Commission mixte paritaire';
    case 'AN':
      return 'Assemblée nationale';
    case 'SENAT':
      return 'Sénat';
  }
}

/** 12 → « 12 jours » ; 404 → « 404 jours (environ 13 mois) ». */
export function duree(jours: number): string {
  const j = pluriel(jours, 'jour');
  if (jours < 60) return j;
  return `${j} (environ ${nombre(Math.round(jours / 30.44))} mois)`;
}

/** « 12 en examen · 40 attendent la suite » (parties nulles omises). */
export function compteFile(f: Pick<FileEtape, 'enExamen' | 'enAttente'>): string {
  return [f.enExamen ? `${nombre(f.enExamen)} en examen` : null, f.enAttente ? `${nombre(f.enAttente)} ${f.enAttente > 1 ? 'attendent' : 'attend'} la suite` : null]
    .filter(Boolean)
    .join(' · ');
}

/** « Attente médiane : 404 jours (environ 13 mois) », ou null sans texte daté. */
export function medianeFile(f: Pick<FileEtape, 'attenteMediane'>): string | null {
  return f.attenteMediane === null ? null : `Attente médiane : ${duree(f.attenteMediane)}`;
}

/** Libellé accessible d'une file. */
export function libelleFile(f: FileEtape): string {
  return [f.etape, compteFile(f), medianeFile(f)].filter(Boolean).join('. ');
}

/** Où en est un texte : « En examen depuis le 8 octobre 2026 (16 jours) », « Attend la suite depuis… ». */
export function situationTexte(t: Pick<TexteEnAttente, 'situation' | 'depuis' | 'jours'>): string {
  const quoi = t.situation === 'en_examen' ? 'En examen' : 'Attend la suite';
  if (!t.depuis) return `${quoi} (date non publiée)`;
  return `${quoi} depuis le ${dateLongue(t.depuis)}${t.jours !== null ? ` (${duree(t.jours)})` : ''}`;
}

/** Délai fixé par un texte, ou la phrase qui dit qu'il n'y en a pas. */
export function texteDelai(a: Pick<AttenteAdministrative, 'delai'>): string {
  return a.delai ? `Date limite : ${dateLongue(a.delai.limite)} (${a.delai.base})` : 'Aucun délai fixé par un texte';
}

/** Entrée de la query sans champ vide ni page 1 (entrée minimale : la même que celle des fixtures). */
export function demandeTextes(d: DemandeAvancement): DemandeAvancement {
  return {
    ...(d.etape ? { etape: d.etape } : {}),
    ...(d.horsParlement ? { horsParlement: true } : {}),
    ...(d.origine ? { origine: d.origine } : {}),
    ...(d.page && d.page > 1 ? { page: d.page } : {}),
  };
}

/** Largeur relative (0 à 100) d'une file par rapport à la plus remplie. */
export function largeurFile(f: Pick<FileEtape, 'enExamen' | 'enAttente'>, max: number): number {
  return max > 0 ? ((f.enExamen + f.enAttente) / max) * 100 : 0;
}
