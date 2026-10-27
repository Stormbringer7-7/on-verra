// Libellés d'un dossier dans les listes (Accueil, Dossiers) : nature, statut, ce qui vient ensuite.
// Construits depuis les faits du contrat seulement (fonctions pures, testées sous Node).

import type { DossierResume, EtatDossier, Origine } from '@/core';
import { date } from './format';

export const ORIGINES: Record<Origine, string> = { gouvernement: 'Gouvernement', parlementaire: 'Parlementaires' };

export const ETATS: Record<EtatDossier, string> = {
  en_cours: 'En cours',
  adopte: 'Adopté',
  promulgue: 'Promulgué',
  rejete: 'Rejeté',
  retire: 'Retiré',
  caduc: 'Caduc',
  fusionne: 'Fusionné',
  irrecevable: 'Irrecevable',
  rapport_publie: 'Rapport publié',
};

/** « PROJET DE LOI · GOUVERNEMENT » : type publié et origine, si elle est connue. */
export const natureDossier = (d: DossierResume) => [d.type, d.origine ? ORIGINES[d.origine] : null].filter(Boolean).join(' · ');

/** Où en est le dossier : l'étape courante tant qu'il est en cours, sinon son état. */
export function statutDossier(d: DossierResume): { libelle: string; ton: 'signal' | 'ink' | 'inkMuted' } | null {
  if (d.etat && d.etat !== 'en_cours') return { libelle: ETATS[d.etat], ton: 'inkMuted' };
  if (d.etapeCourante) return { libelle: d.etapeCourante.libelle, ton: d.etapeCourante.etat === 'en_cours' ? 'signal' : 'ink' };
  // Rien en cours : l'étape attendue du parcours, sinon l'état.
  const attendue = d.barre.find((c) => c.attendue);
  if (attendue) return { libelle: `Attendue : ${attendue.libelle}`, ton: 'ink' };
  return d.etat ? { libelle: ETATS[d.etat], ton: 'ink' } : null;
}

/** Ligne « à suivre » : la prochaine échéance datée, sinon le dernier acte publié. */
export function suiteDossier(d: DossierResume): string | null {
  const e = d.prochaineEcheance;
  if (e) return `Prochaine échéance : ${e.libelle} le ${date(e.date)}${e.etat ? ` (${e.etat})` : ''}`;
  if (d.dernierEvenement) return `${d.dernierEvenement.libelle} · ${date(d.dernierEvenement.date)}`;
  return null;
}
