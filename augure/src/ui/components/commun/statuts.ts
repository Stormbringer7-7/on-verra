// Règles d'affichage des composants partagés, sans React (testées sous Node) : statut d'un lien,
// cases visibles de la barre de parcours, état final d'un parcours terminé, texte d'une synthèse
// absente (une seule mention pour toute une liste).

import type {
  CaseCompacte,
  CaseParcours,
  CleCase,
  DeviationParcours,
  DossierLie,
  EffetDeviation,
  EtatCase,
  EtatDossier,
  Lien,
  Parcours,
  Provenance,
  Synthese,
} from '@/core';
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
  fusionne: 'Fusionné',
  irrecevable: 'Irrecevable',
  rapport_publie: 'Rapport publié',
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
 * courante, l'étape attendue (« Étape attendue : Lecture définitive AN »), sinon l'état final du
 * dossier s'il est terminé (« Promulgué le 12/03/2026 »).
 */
export function legendeBarre(cases: CaseDatee[], ici?: CleCase | null, etat: EtatDossier | null = null): string | null {
  const courante = cases.find((c) => c.courante);
  const attendue = courante ? undefined : cases.find((c) => c.attendue);
  const active = ici ? cases.find((c) => c.cle === ici) : undefined;
  const morceaux = [
    courante ? `Étape actuelle : ${courante.libelle}` : attendue ? `Étape attendue : ${attendue.libelle}` : etatFinal(cases, etat),
    active && active.cle !== courante?.cle ? `vous êtes : ${active.libelle}` : null,
  ].filter((m): m is string => m !== null);
  return morceaux.length ? morceaux.join(' · ') : null;
}

// ---------- Rail du parcours (fiche Dossier) ----------

/** Jours entre deux dates ISO (AAAA-MM-JJ). */
export const joursEntre = (de: string, a: string) => Math.round((Date.parse(a) - Date.parse(de)) / 86_400_000);

/** « 1 jour », « 12 jours », « 5 semaines », « 4 mois ». */
export function dureeLisible(jours: number): string {
  if (jours < 14) return `${jours} jour${jours > 1 ? 's' : ''}`;
  if (jours < 70) return `${Math.round(jours / 7)} semaines`;
  return `${Math.round(jours / 30.4)} mois`;
}

/** Ce que fait une déviation au parcours de droit commun, en clair. */
export const EFFET_DEVIATION: Record<EffetDeviation, string> = {
  rejoint: 'Détour, puis retour au parcours',
  termine: 'Fin du parcours',
  remplace: 'Remplace l’issue de l’étape',
  suspend: 'Parcours suspendu',
};

/** Nature d'une étape dans le droit commun, quand elle n'est pas obligatoire. */
export const NATURE_ETAPE = { obligatoire: null, conditionnelle: 'Conditionnelle', facultative: 'Facultative' } as const;

/**
 * Les dates d'une étape, en clair. `jour` : jour de référence de la projection ; `depuis` : fin
 * de la dernière étape faite, pour l'étape attendue (« En attente depuis 13 jours »).
 */
export function quandEtape(c: CaseParcours, jour: string, depuis: string | null = null): string {
  if (c.etat === 'sans_objet') return 'Sans objet';
  if (c.attendue) return depuis ? `En attente depuis ${dureeLisible(Math.max(0, joursEntre(depuis, jour)))}` : 'Étape attendue';
  if (c.etat === 'a_venir') return c.programmeeLe ? `Programmée le ${date(c.programmeeLe)}` : 'À venir';
  if (c.etat === 'inconnu') return 'Donnée non publiée';
  if (c.etat === 'en_cours') return c.debut ? `Depuis le ${date(c.debut)} · ${dureeLisible(Math.max(0, joursEntre(c.debut, jour)))}` : 'En cours';
  if (c.debut && c.fin && c.fin !== c.debut) return `Du ${date(c.debut)} au ${date(c.fin)} · ${dureeLisible(joursEntre(c.debut, c.fin) + 1)}`;
  const le = c.fin ?? c.debut;
  return le ? `Le ${date(le)}` : 'Dates non publiées';
}

/** Trait du rail sous une étape, vers la suivante montrée : plein (fait), pointillé (à venir), aucun. */
export type TraitRail = 'plein' | 'pointille' | 'aucun';

export type LigneRail =
  | { type: 'etape'; etape: CaseParcours; quand: string; nature: string | null; trait: TraitRail }
  | { type: 'attente'; libelle: string; trait: TraitRail }
  | { type: 'deviation'; deviation: DeviationParcours; effet: string; premiere: boolean; derniere: boolean; trait: TraitRail }
  | { type: 'branche'; libelle: string; vers: string; trait: TraitRail }
  | { type: 'enfants'; etape: CleCase; dossiers: DossierLie[]; trait: TraitRail };

/** Attente montrée entre deux étapes à partir d'une semaine. */
const ATTENTE_MONTREE = 7;

/**
 * Lignes du rail, de haut en bas : chaque étape du modèle (les sans objet seulement quand on
 * compare au droit commun), l'attente avant elle (une semaine ou plus), puis les déviations qui ont
 * lieu à cette étape (un seul niveau de décalage), les branches du droit commun prises depuis elle,
 * et les dossiers rattachés. Une déviation qui termine ne revient pas au rail.
 */
export function lignesRail(parcours: Parcours, comparer = false): LigneRail[] {
  const montrees = parcours.cases.filter((c) => comparer || c.etat !== 'sans_objet');
  const jour = parcours.dateReference;
  const derniereFaite = [...parcours.cases].reverse().find((c) => c.etat === 'faite');
  const depuis = derniereFaite ? (derniereFaite.fin ?? derniereFaite.debut) : null;
  const traitVers = (suivante: CaseParcours | undefined): TraitRail => {
    if (!suivante) return 'aucun';
    return ['faite', 'en_cours', 'inconnu'].includes(suivante.etat) ? 'plein' : 'pointille';
  };
  const lignes: LigneRail[] = [];
  let precedente: CaseParcours | null = null;
  montrees.forEach((c, i) => {
    const trait = traitVers(montrees[i + 1]);
    if (precedente && c.etat !== 'sans_objet') {
      const de = precedente.fin ?? precedente.debut;
      const a = c.debut ?? c.fin;
      if (de && a && joursEntre(de, a) >= ATTENTE_MONTREE) {
        lignes.push({ type: 'attente', libelle: `${dureeLisible(joursEntre(de, a))} d’attente`, trait: 'plein' });
      }
    }
    lignes.push({ type: 'etape', etape: c, quand: quandEtape(c, jour, depuis), nature: NATURE_ETAPE[c.nature], trait });
    const deviations = parcours.deviations.filter((d) => d.etape === c.cle);
    deviations.forEach((d, j) =>
      lignes.push({
        type: 'deviation',
        deviation: d,
        effet: EFFET_DEVIATION[d.effet],
        premiere: j === 0,
        derniere: j === deviations.length - 1,
        trait: j === deviations.length - 1 && d.effet === 'termine' ? 'aucun' : trait,
      }),
    );
    parcours.branches
      .filter((b) => b.de === c.cle)
      .forEach((b) => {
        const vers = parcours.cases.find((x) => x.cle === b.vers);
        lignes.push({ type: 'branche', libelle: b.libelle, vers: vers ? `Puis directement : ${vers.libelle}` : 'Fin du parcours', trait });
      });
    const enfants = parcours.enfants.filter((e) => e.etape === c.cle);
    if (enfants.length) lignes.push({ type: 'enfants', etape: c.cle, dossiers: enfants, trait });
    if (c.etat !== 'sans_objet') precedente = c;
  });
  return lignes;
}

/** « 4 dossiers rattachés », « 1 dossier rattaché ». */
export const nombreRattaches = (n: number) => `${n} dossier${n > 1 ? 's' : ''} rattaché${n > 1 ? 's' : ''}`;

/** « Événement de : Projet de loi de finances pour 2026 · Nouvelle lecture ». */
export const evenementDe = (parent: DossierLie) =>
  `Événement de : ${parent.dossier.titre}${parent.etapeLibelle ? ` · ${parent.etapeLibelle}` : ''}`;
