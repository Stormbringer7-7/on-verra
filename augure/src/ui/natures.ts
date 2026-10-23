import { NATURES_FINALES, type Nature, type ScrutinResume } from '@/core';

/** Libellé (`label`) et objet du vote, pour « + POUR = adopter cet amendement ». */
export const NATURES: Record<Nature, { libelle: string; objet: string }> = {
  ensemble: { libelle: 'TEXTE', objet: 'ce texte' },
  article_unique: { libelle: 'TEXTE', objet: 'ce texte' },
  article: { libelle: 'ARTICLE', objet: 'cet article' },
  amendement: { libelle: 'AMENDEMENT', objet: 'cet amendement' },
  motion: { libelle: 'MOTION', objet: 'cette motion' },
  autre: { libelle: 'SCRUTIN', objet: 'ce texte' },
};

export const estFinal = (s: ScrutinResume) => NATURES_FINALES.includes(s.nature);

/**
 * Ce qu'on affiche d'un scrutin : le titre du texte pour un vote final, l'intitulé officiel sinon
 * (« L'amendement n° 15 de M. X à l'article premier… »), repris tel quel, sans la lecture finale.
 */
export function libelleScrutin(s: ScrutinResume): string {
  if (estFinal(s)) return s.titre;
  const t = s.intitule.replace(/\s*\([^()]*\)\.?\s*$/, '').replace(/\.$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
