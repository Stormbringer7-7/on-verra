// Règles d'affichage des écrans Personnes, Personne, Institutions et Représentant d'intérêts,
// sans React : ce que disent les libellés, pour qu'un test les vérifie sur les fixtures du contrat.
//
//   - une fiche RNE seule (`identite: 'fiche_rne'`) s'affiche « selon le RNE », jamais comme une
//     personne établie ;
//   - un mandat RNE dans la frise dit qu'il est rattaché par la revue humaine ;
//   - un indicateur n'est jamais résumé sans son dénominateur ni sa référence ;
//   - un rapprochement lobbying dit son statut (« Vérifié · … », « À vérifier · … »).

import type {
  CibleInteret,
  ElementAnnuaire,
  EntetePersonne,
  FonctionDatee,
  Indicateur,
  Institution,
  Lien,
  Periode,
  RolePersonne,
  RubriqueDeclaree,
  TypeInstitution,
} from '@/core';

// ---------- Dates ----------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** 2026-10-12 → 12/10/2026 */
export function jour(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** 2022-08-12 → août 2022 */
export function moisAnnee(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${MOIS[Number(m) - 1]} ${a}`;
}

/** 2025-05-12 → 05/2025 */
export function moisCourt(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${m}/${a}`;
}

/** Année décimale (frise) : 2022-06-22 → 2022,47. */
export function anneeDecimale(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return a + (m - 1) / 12 + (j - 1) / 365;
}

/** Période d'un exercice déclaré : « T1 2026 », « 2026 », sinon « 01/01/2026 – 30/06/2026 ». */
export function libellePeriode(p: Periode): string {
  if (!p.fin) return `depuis ${jour(p.debut)}`;
  const [a1, m1, j1] = p.debut.split('-').map(Number);
  const [a2, m2] = p.fin.split('-').map(Number);
  if (a1 === a2 && j1 === 1 && m1 === 1 && m2 === 12) return String(a1);
  if (a1 === a2 && j1 === 1 && (m1 - 1) % 3 === 0 && m2 === m1 + 2) return `T${(m1 - 1) / 3 + 1} ${a1}`;
  return `${jour(p.debut)} – ${jour(p.fin)}`;
}

// ---------- Nombres ----------

/** 1412 → « 1 412 » ; 3.2 → « 3,2 ». */
export function nombre(n: number): string {
  const [ent, dec] = String(Math.round(n * 10) / 10).split('.');
  const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${groupes},${dec}` : groupes;
}

/** Valeur d'un indicateur avec son unité. */
export function valeurIndicateur(i: Pick<Indicateur, 'valeur' | 'unite'>): string {
  if (i.unite === 'pourcentage') return `${nombre(i.valeur)} %`;
  if (i.unite === 'points') return `${i.valeur > 0 ? '+' : ''}${nombre(i.valeur)} pts`;
  return nombre(i.valeur);
}

/**
 * Résumé d'une ligne de classement : la valeur, sur combien, par rapport à quoi. Jamais un chiffre
 * seul : le dénominateur et la référence sont toujours dans le texte.
 */
export function resumeIndicateur(i: Indicateur): { valeur: string; denominateur: string; reference: string } {
  const unite = i.unite === 'nombre' && i.libelle.toLowerCase().startsWith('écarts') ? (i.valeur > 1 ? ' écarts' : ' écart') : '';
  return {
    valeur: `${valeurIndicateur(i)}${unite}`,
    denominateur: i.denominateur ? `sur ${nombre(i.denominateur.valeur)} ${i.denominateur.libelle}` : 'dénominateur non publié',
    reference:
      i.reference.valeur === null
        ? `${i.reference.libelle} (référence pas encore calculée)`
        : `${i.reference.libelle} : ${nombre(i.reference.valeur)}${i.unite === 'pourcentage' ? ' %' : ''}`,
  };
}

/** Part de la barre d'une ligne de classement (0 à 1), rapportée à son dénominateur. */
export function partIndicateur(i: Indicateur): number {
  if (i.unite === 'pourcentage') return Math.max(0, Math.min(1, i.valeur / 100));
  if (i.denominateur && i.denominateur.valeur > 0) return Math.max(0, Math.min(1, i.valeur / i.denominateur.valeur));
  return 0;
}

// ---------- Annuaire ----------

export const ROLES: { cle: RolePersonne | 'tous'; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'depute', libelle: 'Députés' },
  { cle: 'senateur', libelle: 'Sénateurs' },
  { cle: 'gouvernement', libelle: 'Gouvernement' },
  { cle: 'elu_local', libelle: 'Élus locaux' },
];

const EFFECTIF: Record<RolePersonne, [string, string]> = {
  depute: ['député', 'députés'],
  senateur: ['sénateur', 'sénateurs'],
  gouvernement: ['membre du Gouvernement', 'membres du Gouvernement'],
  elu_local: ['élu local', 'élus locaux'],
};

/** « 577 députés, 348 sénateurs, 36 membres du Gouvernement, 2 élus locaux ». */
export function libelleEffectifs(effectifs: { role: RolePersonne; nombre: number }[]): string {
  return effectifs.map((e) => `${nombre(e.nombre)} ${EFFECTIF[e.role][e.nombre > 1 ? 1 : 0]}`).join(', ');
}

/** Badge de la source : le Gouvernement est publié par l'AMO (AN) mais se lit « GOUV. ». */
export function badgeSource(e: Pick<ElementAnnuaire, 'role' | 'source'>): string {
  if (e.role === 'gouvernement') return 'GOUV.';
  return e.source === 'SENAT' ? 'SÉNAT' : e.source;
}

export interface PresentationAnnuaire {
  /** Nom, précédé de « Selon le RNE » pour une fiche RNE seule. */
  titre: string;
  sousTitre: string | null;
  badge: string;
  /** Mention à afficher sous la ligne (fiche RNE seule), null sinon. */
  mention: string | null;
}

/**
 * Une ligne de l'annuaire. Une fiche RNE seule n'est pas une personne : c'est un mandat tel que le
 * RNE le publie, que la revue n'a relié à aucune personne. Elle ne se présente donc jamais comme
 * une personne établie (pas de pastille de groupe, mention « selon le RNE »).
 */
export function presentationAnnuaire(e: ElementAnnuaire): PresentationAnnuaire {
  if (e.identite === 'fiche_rne') {
    return {
      titre: `Selon le RNE : ${e.nom}`,
      sousTitre: e.fonction,
      badge: 'RNE',
      mention: 'Mandat tel que publié par le Répertoire national des élus, relié à aucune personne : homonymes possibles.',
    };
  }
  return { titre: e.nom, sousTitre: e.fonction, badge: badgeSource(e), mention: null };
}

/** Filtre envoyé à `ListerPersonnes` : seulement les clés renseignées (le cache compare en JSON). */
export function filtreAnnuaire(role: RolePersonne | 'tous', q: string): { role?: RolePersonne; q?: string } {
  const filtre: { role?: RolePersonne; q?: string } = {};
  if (role !== 'tous') filtre.role = role;
  if (q.trim()) filtre.q = q.trim();
  return filtre;
}

// ---------- Fiche personne ----------

/** Titre de l'en-tête : « Selon le RNE » pour une fiche RNE seule. */
export function titrePersonne(e: Pick<EntetePersonne, 'identite' | 'nom'>): { surtitre: string | null; nom: string; mention: string | null } {
  if (e.identite === 'fiche_rne') {
    return {
      surtitre: 'Selon le Répertoire national des élus',
      nom: e.nom,
      mention:
        'Cette fiche reprend un mandat tel que le RNE le publie. Aucune revue ne l’a relié à une personne : ce n’est pas une identité établie, et des homonymes sont possibles.',
    };
  }
  return { surtitre: null, nom: e.nom, mention: null };
}

/** Badge de source d'une fonction : « AN », « SÉNAT », « RNE », « GOUV. ». */
export function badgeFonction(f: Pick<FonctionDatee, 'source' | 'type'>): string {
  if (f.type === 'membre_gouvernement') return 'GOUV.';
  return f.source === 'SENAT' ? 'SÉNAT' : f.source;
}

/**
 * Comment la fonction est rattachée à la fiche. Un mandat RNE ne l'est que par la revue humaine :
 * on le dit. Sur une fiche RNE seule, le mandat est la fiche elle-même (« selon le RNE »).
 */
export function rattachementFonction(f: FonctionDatee, identite: EntetePersonne['identite']): string | null {
  if (f.source !== 'RNE') return null;
  if (identite === 'fiche_rne') return 'Selon le RNE · non relié à une personne';
  if (f.rattachement?.methode === 'revue_humaine') return 'Rattaché par la revue humaine';
  // Ne devrait pas arriver (le dépôt n'expose pas un mandat RNE sans décision de revue).
  return 'Rattachement non établi';
}

/** Dates d'une fonction : « 2022 – en cours », « 2014 – 2020 », « 2026 ». */
export function datesFonction(f: Pick<FonctionDatee, 'debut' | 'fin'>): string {
  const a = f.debut ? f.debut.slice(0, 4) : '?';
  if (f.fin === null) return `${a} – en cours`;
  const z = f.fin.slice(0, 4);
  return a === z ? a : `${a} – ${z}`;
}

export interface BarreFrise {
  /** Début et largeur, en part de la frise (0 à 1). */
  gauche: number;
  largeur: number;
  enCours: boolean;
}

/** Frise : bornes (année de la première fonction → année prochaine) et graduations. */
export function frise(fonctions: FonctionDatee[], aujourdhui: string, pas = 4): { annees: { annee: number; position: number }[]; barres: BarreFrise[] } {
  const maintenant = anneeDecimale(aujourdhui);
  const debuts = fonctions.map((f) => (f.debut ? anneeDecimale(f.debut) : maintenant));
  const y0 = Math.floor(Math.min(maintenant, ...debuts));
  const y1 = Math.floor(maintenant) + 1;
  const etendue = Math.max(1, y1 - y0);
  const barres = fonctions.map((f, i) => {
    const a = debuts[i];
    const z = f.fin ? anneeDecimale(f.fin) : maintenant;
    return { gauche: (a - y0) / etendue, largeur: Math.max(0.6, z - a) / etendue, enCours: f.fin === null };
  });
  const annees: { annee: number; position: number }[] = [];
  for (let y = y0; y < y1; y += pas) annees.push({ annee: y, position: (y - y0) / etendue });
  return { annees, barres };
}

/** Valeurs d'une rubrique HATVP, telles que publiées : « Néant », ou chaque élément déclaré. */
export function valeursRubrique(r: RubriqueDeclaree): string[] {
  if (r.neant) return ['Néant'];
  const valeurs = r.elements.map((e) =>
    Object.values(e)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' · '),
  );
  return valeurs.filter((v) => v.length > 0).length ? valeurs.filter((v) => v.length > 0) : ['Déclarée, sans détail publié'];
}

// ---------- Représentants d'intérêts ----------

/** « Vérifié · l'action cite le texte » ou « À vérifier · même sujet, même période ». */
export function statutLien<T>(l: Lien<T>): string {
  return `${l.statut === 'verifie' ? 'Vérifié' : 'À vérifier'} · ${l.rapprochement.motif}`;
}

/** Titre de l'objet rapproché (dossier, amendement, article), pour le rendu de `LienStatut`. */
export function titreCible(c: CibleInteret): string {
  switch (c.type) {
    case 'dossier':
      return c.dossier.titre;
    case 'amendement':
      return `Amendement ${c.amendement.numero}${c.dossier ? ` · ${c.dossier.titre}` : ''}`;
    case 'article':
      return `Art. ${c.article.numero} · ${c.dossier.titre}`;
  }
}

// ---------- Institutions ----------

export const INSTITUTIONS: { cle: TypeInstitution; libelle: string }[] = [
  { cle: 'an', libelle: 'Assemblée nationale' },
  { cle: 'senat', libelle: 'Sénat' },
  { cle: 'gouvernement', libelle: 'Gouvernement' },
  { cle: 'cc', libelle: 'Conseil constitutionnel' },
];

/** Couleur de chaque siège, de la gauche vers la droite (groupes triés par rang, puis sans groupe). */
export function couleursSieges(
  chambre: Extract<Institution, { type: 'an' | 'senat' }>,
  sansCouleur: string,
): string[] {
  const couleurs: string[] = [];
  for (const g of [...chambre.groupes].sort((a, b) => a.rang - b.rang)) {
    for (let i = 0; i < g.sieges; i++) couleurs.push(g.groupe.couleur ?? sansCouleur);
  }
  for (let i = 0; i < chambre.sansGroupe; i++) couleurs.push(sansCouleur);
  return couleurs;
}
