// Mise en forme des faits du contrat pour l'affichage : dates, nombres, sources, indicateurs.
// Fonctions pures (testées sous Node) : aucun composant ici.

import type { Indicateur, Provenance, ScrutinResume, Systeme } from '@/core';

const MOIS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** 2026-10-12 → 12/10/2026 */
export function date(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** 2026-10-12 → 12/10/26 */
export function dateCourte(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a.slice(2)}`;
}

/** 2026-10-12 → 12/10 */
export function jourMois(iso: string): string {
  const [, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}`;
}

/** 2026-10-01 → 1er octobre 2026 ; 2026-10-19 → 19 octobre 2026 */
export function dateLongue(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  const jour = Number(j);
  return `${jour === 1 ? '1er' : jour} ${MOIS_LONGS[Number(m) - 1]} ${a}`;
}

/** 2026-10-12 → OCT. 26 */
export function mois(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${MOIS[Number(m) - 1]} ${a.slice(2)}`;
}

/** Nombre à la française : 1 234 ; 37,5. */
export function nombre(n: number, decimales = 0): string {
  const fixe = n.toFixed(decimales);
  const [entier, fraction] = fixe.split('.');
  const signe = entier.startsWith('-') ? '−' : '';
  const groupe = entier.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${groupe}${fraction && Number(fraction) !== 0 ? `,${fraction.replace(/0+$/, '')}` : ''}`;
}

/** 0.843 → 84 % */
export function pourcent(x: number | null): string {
  return x === null ? '—' : `${Math.round(x * 100)} %`;
}

/** 17 → 17E LÉGISLATURE */
export function legislature(n: string): string {
  return `${n}E LÉGISLATURE`;
}

export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
}

/** Première lettre en capitale (intitulés officiels repris tels quels : « l'article 12… »). */
export function capitale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ---------- Titres ----------

/** Forme comparable d'un titre : casse, espaces (insécables compris) et apostrophes (' ’ ‘) neutralisés. */
export const titreNormalise = (t: string): string =>
  t
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr-FR');

/**
 * Titre officiel (ou intitulé officiel) à rappeler sous le titre affiché : lui-même s'il en
 * diffère, null s'il le répète (même texte à la casse, aux espaces et aux apostrophes près) ou s'il
 * est vide.
 */
export function titreOfficielDistinct(affiche: string, officiel: string | null | undefined): string | null {
  if (!officiel || !officiel.trim()) return null;
  return titreNormalise(officiel) === titreNormalise(affiche) ? null : officiel;
}

// ---------- Sources ----------

const SYSTEMES: Record<Systeme, string> = {
  AN: 'AN',
  SENAT: 'Sénat',
  LEGIFRANCE: 'Légifrance',
  CONSTIT: 'Conseil constit.',
  HATVP: 'HATVP',
  RNE: 'RNE',
  INSEE: 'Insee',
  CIVICTRACE: 'CivicTrace',
};

export const libelleSysteme = (s: Systeme): string => SYSTEMES[s] ?? s;

/** « AN · DLR5L17N54085 » */
export function texteSource(p: Provenance): string {
  return `${libelleSysteme(p.systeme)} · ${p.idNatif}`;
}

// ---------- Indicateurs ----------

/** Valeur d'un indicateur avec son unité : « 37,5 % », « +12 pts », « 41 ». */
export function valeurIndicateur(valeur: number, unite: Indicateur['unite']): string {
  switch (unite) {
    case 'pourcentage':
      return `${nombre(valeur, 1)} %`;
    case 'points':
      return `${valeur > 0 ? '+' : ''}${nombre(valeur, 1)} pt${Math.abs(valeur) >= 2 ? 's' : ''}`;
    default:
      return nombre(valeur, 1);
  }
}

/** « Sur 21 votes en groupe », null si l'indicateur n'a pas de dénominateur. */
export function texteDenominateur(i: Indicateur): string | null {
  return i.denominateur ? `Sur ${nombre(i.denominateur.valeur)} ${i.denominateur.libelle}` : null;
}

/** « Par rapport à : son groupe sur les mêmes scrutins (62,5 %) » ; la valeur absente est dite. */
export function texteReference(i: Indicateur): string {
  const { libelle, valeur } = i.reference;
  return `Par rapport à : ${libelle}${valeur === null ? ' (pas encore calculée)' : ` (${valeurIndicateur(valeur, i.unite)})`}`;
}

// ---------- Scrutins ----------

/** « ADOPTÉ 330 – 190 », « REJETÉ 247 – 268 » ; le sort publié, sinon le décompte seul. */
export function resultatScrutin(s: ScrutinResume): string {
  const sort = s.sort ? s.sort.toUpperCase() : s.adopte === null ? null : s.adopte ? 'ADOPTÉ' : 'REJETÉ';
  const decompte = `${nombre(s.decompte.pour)} – ${nombre(s.decompte.contre)}`;
  return sort ? `${sort} ${decompte}` : decompte;
}

/** Ce qu'on affiche d'un scrutin : le sens en clair s'il existe, sinon l'intitulé officiel tel quel. */
export function titreScrutin(s: ScrutinResume): string {
  return s.enClair ?? capitale(s.intitule.replace(/\.$/, ''));
}

export const libelleChambre = (c: 'AN' | 'SENAT'): string => (c === 'AN' ? 'AN' : 'SÉNAT');
