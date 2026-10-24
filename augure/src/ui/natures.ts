// Ce que met aux voix un scrutin, selon sa nature publiée : libellé court (étiquette) et objet du
// vote (« + POUR = adopter cet amendement »).

import { NATURES_FINALES, type NatureScrutin, type ScrutinResume } from '@/core';

export const NATURES: Record<NatureScrutin, { libelle: string; objet: string }> = {
  ensemble: { libelle: 'TEXTE', objet: 'ce texte' },
  article_unique: { libelle: 'TEXTE', objet: 'ce texte' },
  article: { libelle: 'ARTICLE', objet: 'cet article' },
  amendement: { libelle: 'AMENDEMENT', objet: 'cet amendement' },
  motion: { libelle: 'MOTION', objet: 'cette motion' },
  motion_censure: { libelle: 'CENSURE', objet: 'cette motion de censure' },
  autre: { libelle: 'SCRUTIN', objet: 'ce texte' },
};

/** Vote final sur un texte (ensemble, article unique). */
export const estFinal = (s: ScrutinResume) => NATURES_FINALES.includes(s.nature);
