// Règles d'affichage des composants partagés, sans React (testées sous Node) : statut d'un lien,
// cases visibles de la barre de parcours, état final d'un parcours terminé, texte d'une synthèse
// absente (une seule mention pour toute une liste).

import type { CaseCompacte, CleCase, EtatCase, EtatDossier, Lien, Provenance, Synthese } from '@/core';
import { date } from '../../format';

// ---------- Liens ----------

/**
 * Ce que l'UI montre d'un lien. Un lien vérifié donne sa cible comme un fait ; un lien à vérifier
 * ne donne qu'un candidat, toujours précédé de l'en-tête « À vérifier » et suivi de l'avertissement.
 */
export type PresentationLien<T> =
  | { statut: 'verifie'; entete: string; fait: T; preuve: Provenance | null }
  | { statut: 'a_verifier'; entete: string; candidat: T; avertissement: string };

export function presentationLien<T>(lien: Lien<T>, libelle?: string): PresentationLien<T> {
  const prefixe = libelle ? `${libelle} · ` : '';
  if (lien.statut === 'verifie') {
    return {
      statut: 'verifie',
      entete: `${prefixe}Vérifié · ${lien.rapprochement.motif}`,
      fait: lien.cible,
      preuve: lien.rapprochement.preuve,
    };
  }
  return {
    statut: 'a_verifier',
    entete: `${prefixe}À vérifier · ${lien.rapprochement.motif}`,
    candidat: lien.candidat,
    avertissement: lien.rapprochement.avertissement,
  };
}

/** Mention placée avant le candidat d'un lien à vérifier. */
export const MENTION_CANDIDAT = 'Rapprochement possible, non établi';

// ---------- Synthèses ----------

export const PAS_DE_SYNTHESE = 'Pas de synthèse disponible';

/** Texte affiché pour une synthèse : elle-même, ou « Pas de synthèse disponible ». */
export const texteSynthese = (s: Synthese): { texte: string; absente: boolean } =>
  s === null || s.trim() === '' ? { texte: PAS_DE_SYNTHESE, absente: true } : { texte: s, absente: false };

/** La synthèse existe (ni null, ni vide). */
export const aSynthese = (s: Synthese): s is string => s !== null && s.trim() !== '';

/**
 * Une liste dont aucune ligne n'a de synthèse : « Pas de synthèse disponible » est dit une fois
 * pour le bloc, pas répété ligne à ligne. Liste vide : rien à dire.
 */
export const aucuneSynthese = (syntheses: Synthese[]): boolean => syntheses.length > 0 && !syntheses.some(aSynthese);

// ---------- Barre de parcours ----------

/** Cases montrées : celles qui n'auront pas lieu (`sans_objet`) sont masquées. */
export const casesVisibles = <C extends CaseCompacte>(cases: C[]): C[] => cases.filter((c) => c.etat !== 'sans_objet');

/** Libellé d'état, pour les lecteurs d'écran et la légende. */
export const LIBELLES_ETATS: Record<EtatCase, string> = {
  faite: 'faite',
  en_cours: 'en cours',
  a_venir: 'à venir',
  sans_objet: 'sans objet',
  inconnu: 'état inconnu',
};

/** Rendu d'une case : plein (faite), signal (en cours), filet (à venir), contour (inconnu). */
export type RenduCase = 'plein' | 'signal' | 'vide' | 'inconnu';

export function renduCase(c: CaseCompacte): RenduCase {
  if (c.etat === 'faite') return 'plein';
  if (c.etat === 'en_cours' || c.courante) return 'signal';
  if (c.etat === 'inconnu') return 'inconnu';
  return 'vide';
}

/** Une case avec ses dates, quand la barre est complète (`CaseParcours`) ; absentes en compact. */
type CaseDatee = CaseCompacte & { debut?: string | null; fin?: string | null };

const CASES_PROMULGATION: CleCase[] = ['promulgation', 'promulgation_jo', 'jo'];

/** États d'un dossier dont le parcours est clos (hors promulgation, traitée par les cases). */
const ETATS_FINAUX: Partial<Record<EtatDossier, string>> = {
  promulgue: 'Promulgué',
  adopte: 'Adopté définitivement',
  rejete: 'Rejeté',
  retire: 'Retiré',
  caduc: 'Caduc',
};

/**
 * État final d'un dossier sans étape courante, parce que son parcours est fini : « Promulgué le
 * 12/03/2026 » (date de la case de promulgation, si la barre la donne), « Promulgué » sinon ;
 * l'état publié du dossier (adopté, rejeté, retiré, caduc) ; « Parcours terminé » quand toutes les
 * cases sont faites ou sans objet. null : dossier en cours (étape courante) ou rien ne permet de
 * conclure.
 */
export function etatFinal(cases: CaseDatee[], etat: EtatDossier | null = null): string | null {
  if (cases.some((c) => c.courante)) return null;
  const promulgation = CASES_PROMULGATION.map((cle) => cases.find((c) => c.cle === cle && c.etat === 'faite')).find(Boolean);
  if (promulgation) {
    const jour = promulgation.fin ?? promulgation.debut ?? null;
    return jour ? `Promulgué le ${date(jour)}` : 'Promulgué';
  }
  if (etat && ETATS_FINAUX[etat]) return ETATS_FINAUX[etat]!;
  if (cases.length && cases.some((c) => c.etat === 'faite') && cases.every((c) => c.etat === 'faite' || c.etat === 'sans_objet')) {
    return 'Parcours terminé';
  }
  return null;
}

/**
 * « Étape actuelle : CMP · vous êtes : Commission AN » (ce qui est connu seulement) ; sans étape
 * courante, l'état final du dossier s'il est terminé (« Promulgué le 12/03/2026 »).
 */
export function legendeBarre(cases: CaseDatee[], ici?: CleCase | null, etat: EtatDossier | null = null): string | null {
  const courante = cases.find((c) => c.courante);
  const active = ici ? cases.find((c) => c.cle === ici) : undefined;
  const morceaux = [
    courante ? `Étape actuelle : ${courante.libelle}` : etatFinal(cases, etat),
    active && active.cle !== courante?.cle ? `vous êtes : ${active.libelle}` : null,
  ].filter((m): m is string => m !== null);
  return morceaux.length ? morceaux.join(' · ') : null;
}
