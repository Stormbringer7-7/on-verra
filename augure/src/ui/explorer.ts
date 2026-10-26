// Explorer (faits filtrés), logique de l'UI sans React : l'état de l'écran tient dans l'adresse
// (`/explorer?dossier=…&etape=…`), d'où la demande `ExplorerFaits` ; ajout, remontée et retrait de
// filtres dans le fil ; phrase de contexte composée depuis les filtres et les compteurs rendus par
// l'API (jamais rédigée ailleurs) ; libellés des onglets, regroupements et familles.

import { CLES_FILTRES, FAMILLES, TYPES_ACTION } from '@/core/domain/explorer';
import type {
  CleCase,
  CleFiltre,
  DemandeFaits,
  ExplorationFaits,
  FamilleFiltre,
  FiltreActif,
  FiltresFaits,
  Regroupement,
  TypeFait,
} from '@/core';
import { pluriel } from './format';

/** Paramètres de la page (adresse) : tout en texte, comme dans une URL. */
export type ParamsExplorer = Partial<Record<CleFiltre, string>> & {
  /** Ordre d'ajout des filtres, séparé par des virgules (le dernier est l'objet focal). */
  ordre?: string;
  onglet?: string;
  regrouper?: string;
  deplier?: string;
  comparer?: string;
  page?: string;
};

export const ONGLETS_FAITS: Record<TypeFait, string> = {
  interventions: 'Interventions',
  amendements: 'Amendements',
  votes: 'Votes',
  controle: 'Contrôle',
  transparence: 'Transparence',
  personnes: 'Personnes',
};

export const REGROUPEMENTS_LIBELLES: Record<Regroupement, string> = {
  dossier: 'Dossier',
  etape: 'Étape',
  article: 'Article',
  groupe: 'Groupe',
  personne: 'Personne',
  organe: 'Organe',
  date: 'Date',
  sort: 'Sort',
  nature: 'Nature',
};

export const FAMILLES_LIBELLES: Record<FamilleFiltre, { libelle: string; glyphe: string }> = {
  lois: { libelle: 'Lois', glyphe: '§' },
  personnes: { libelle: 'Personnes et groupes', glyphe: '◐' },
  institutions: { libelle: 'Institutions', glyphe: '▥' },
  territoires: { libelle: 'Territoires', glyphe: '⌖' },
  action: { libelle: 'Action législative', glyphe: '✎' },
};

const TYPES: readonly TypeFait[] = ['interventions', 'amendements', 'votes', 'controle', 'transparence', 'personnes'];
const REGROUPEMENTS: readonly Regroupement[] = ['dossier', 'etape', 'article', 'groupe', 'personne', 'organe', 'date', 'sort', 'nature'];

const dans = <T extends string>(liste: readonly T[], v: string | undefined): T | undefined =>
  v !== undefined && (liste as readonly string[]).includes(v) ? (v as T) : undefined;

const famille = (cle: CleFiltre) => FAMILLES.find((f) => f.cles.includes(cle))!;

/** Clés posées, dans l'ordre du fil (familles, puis profondeur). */
const clesPosees = (f: FiltresFaits): CleFiltre[] => CLES_FILTRES.filter((c) => f[c] !== undefined);

// ---------- Adresse ⇄ demande ----------

/**
 * La demande `ExplorerFaits` de l'adresse. Rien de vide : pas de `filtres` sans filtre, pas
 * d'`ordre` pour un seul filtre, pas de page 1 (mêmes entrées que les fixtures).
 */
export function demandeExplorer(params: ParamsExplorer | undefined): DemandeFaits {
  const p = params ?? {};
  const filtres: FiltresFaits = {};
  for (const cle of CLES_FILTRES) {
    const v = p[cle]?.trim();
    if (!v) continue;
    if (cle === 'etape') filtres.etape = v as CleCase;
    else if (cle === 'chambre') filtres.chambre = v === 'SENAT' ? 'SENAT' : 'AN';
    else filtres[cle] = v;
  }
  const poses = clesPosees(filtres);
  const ordre = (p.ordre ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c, i, t): c is CleFiltre => poses.includes(c as CleFiltre) && t.indexOf(c) === i);
  const demande: DemandeFaits = {};
  if (poses.length) demande.filtres = filtres;
  if (poses.length > 1 && ordre.length) demande.ordre = ordre;
  const onglet = dans(TYPES, p.onglet);
  if (onglet) demande.onglet = onglet;
  const regrouper = dans(REGROUPEMENTS, p.regrouper);
  if (regrouper) demande.regrouper = regrouper;
  if (p.deplier) demande.deplier = p.deplier;
  if (p.comparer && filtres.groupe) demande.comparer = p.comparer;
  const page = Number(p.page);
  if (Number.isInteger(page) && page > 1) demande.page = page;
  return demande;
}

/** L'adresse d'une demande (inverse de `demandeExplorer`). */
export function paramsExplorer(d: DemandeFaits): ParamsExplorer {
  const p: ParamsExplorer = {};
  const f = d.filtres ?? {};
  for (const cle of CLES_FILTRES) if (f[cle] !== undefined) p[cle] = String(f[cle]);
  if (d.ordre?.length) p.ordre = d.ordre.join(',');
  if (d.onglet) p.onglet = d.onglet;
  if (d.regrouper) p.regrouper = d.regrouper;
  if (d.deplier) p.deplier = d.deplier;
  if (d.comparer) p.comparer = d.comparer;
  if (d.page && d.page > 1) p.page = String(d.page);
  return p;
}

// ---------- Filtres ----------

/** Ordre d'ajout complet : celui de la demande, puis les clés posées qui n'y sont pas. */
function ordreComplet(d: DemandeFaits): CleFiltre[] {
  const poses = clesPosees(d.filtres ?? {});
  const ordre = (d.ordre ?? []).filter((c) => poses.includes(c));
  return [...ordre, ...poses.filter((c) => !ordre.includes(c))];
}

/** Ce qui suit une nouvelle vue : onglet, regroupement, dépliage et page reviennent au défaut. */
function vue(filtres: FiltresFaits, ordre: CleFiltre[], comparer?: string): DemandeFaits {
  const poses = clesPosees(filtres);
  const o = ordre.filter((c) => poses.includes(c));
  const d: DemandeFaits = {};
  if (poses.length) d.filtres = filtres;
  if (poses.length > 1 && o.length) d.ordre = o;
  if (comparer && filtres.groupe) d.comparer = comparer;
  return d;
}

/**
 * Ajouter (ou remplacer) un filtre : il devient l'objet focal. Dans sa famille, les niveaux plus
 * précis tombent (un autre dossier n'a ni la même étape ni le même article).
 */
export function ajouterFiltre(d: DemandeFaits, cle: CleFiltre, id: string): DemandeFaits {
  const f: FiltresFaits = { ...(d.filtres ?? {}) };
  const cles = famille(cle).cles;
  for (const plus of cles.slice(cles.indexOf(cle) + 1)) delete f[plus];
  (f as Record<CleFiltre, string>)[cle] = id;
  const ordre = [...ordreComplet(d).filter((c) => c !== cle), cle];
  return vue(f, ordre, cle === 'groupe' ? undefined : d.comparer);
}

/** Retirer des filtres (× d'une famille, « Élargir »). Sans groupe, plus de comparaison. */
export function retirerFiltres(d: DemandeFaits, cles: CleFiltre[]): DemandeFaits {
  const f: FiltresFaits = { ...(d.filtres ?? {}) };
  for (const c of cles) delete f[c];
  // Une étape n'a pas de sens sans son dossier.
  if (!f.dossier) delete f.etape;
  return vue(f, ordreComplet(d), d.comparer);
}

/** Remonter dans une famille : on garde ce niveau, les plus précis tombent. */
export function remonterA(d: DemandeFaits, cle: CleFiltre): DemandeFaits {
  const cles = famille(cle).cles;
  return retirerFiltres(d, cles.slice(cles.indexOf(cle) + 1));
}

/** Retirer toute une famille (× du segment). */
export const retirerFamille = (d: DemandeFaits, fam: FamilleFiltre): DemandeFaits =>
  retirerFiltres(d, FAMILLES.find((f) => f.famille === fam)!.cles);

/** Comparer le groupe filtré à un second groupe (appui long). */
export function comparerA(d: DemandeFaits, groupe: string | undefined): DemandeFaits {
  const { comparer: _c, deplier: _d, page: _p, ...reste } = d;
  return groupe && d.filtres?.groupe && groupe !== d.filtres.groupe ? { ...reste, comparer: groupe } : reste;
}

export function avecOnglet(d: DemandeFaits, onglet: TypeFait): DemandeFaits {
  const { regrouper: _r, deplier: _d, page: _p, ...reste } = d;
  return { ...reste, onglet };
}

export function avecRegroupement(d: DemandeFaits, onglet: TypeFait, regrouper: Regroupement): DemandeFaits {
  const { deplier: _d, page: _p, ...reste } = d;
  return { ...reste, onglet, regrouper };
}

export function avecDeplie(d: DemandeFaits, onglet: TypeFait, cle: string | undefined): DemandeFaits {
  const { deplier: _d, page: _p, ...reste } = d;
  return cle ? { ...reste, onglet, deplier: cle } : reste;
}

export function avecPage(d: DemandeFaits, page: number): DemandeFaits {
  const { page: _p, ...reste } = d;
  return page > 1 ? { ...reste, page } : reste;
}

// ---------- Fil ----------

export interface SegmentFil {
  famille: FamilleFiltre;
  libelle: string;
  glyphe: string;
  /** Du plus large au plus précis. */
  filtres: FiltreActif[];
}

/** Un segment par famille posée, dans l'ordre d'ajout des familles (le canevas). */
export function segmentsFil(e: Pick<ExplorationFaits, 'filtres' | 'demande'>): SegmentFil[] {
  const ordre = ordreComplet(e.demande).map((c) => famille(c).famille);
  const familles = [...new Set([...ordre, ...e.filtres.map((f) => f.famille)])];
  return familles.flatMap((fam) => {
    const filtres = e.filtres.filter((f) => f.famille === fam);
    return filtres.length ? [{ famille: fam, ...FAMILLES_LIBELLES[fam], filtres }] : [];
  });
}

// ---------- Phrase ----------

const COMPTES: [TypeFait, string, string][] = [
  ['interventions', 'intervention', 'interventions'],
  ['amendements', 'amendement', 'amendements'],
  ['votes', 'vote', 'votes'],
  ['controle', 'question', 'questions'],
  ['transparence', 'élément de transparence', 'éléments de transparence'],
];

/**
 * Phrase de contexte, composée ici depuis les filtres et les compteurs de l'API : « Énergie 2035 ·
 * Groupe A : 12 interventions, 4 amendements. » ; sans filtre, « Tout le Parlement : … ».
 */
export function phraseContexte(e: Pick<ExplorationFaits, 'filtres' | 'demande' | 'compteurs'>): string {
  const noms = segmentsFil(e).map((s) => s.filtres[s.filtres.length - 1].libelle);
  const comptes = COMPTES.filter(([t]) => e.compteurs[t] > 0).map(([t, un, plusieurs]) => pluriel(e.compteurs[t], un, plusieurs));
  return `${noms.length ? noms.join(' · ') : 'Tout le Parlement'} : ${comptes.length ? comptes.join(', ') : 'rien pour l’instant'}.`;
}

/** Faits d'action législative de la vue (interventions, amendements, votes) : sert à dire « vide ». */
export const nombreAction = (c: Record<TypeFait, number>) => TYPES_ACTION.reduce((n, t) => n + c[t], 0);

/** Onglets montrés : ceux qui ont des faits, et l'onglet actif. */
export const ongletsVisibles = (e: Pick<ExplorationFaits, 'compteurs' | 'onglet'>): TypeFait[] =>
  TYPES.filter((t) => e.compteurs[t] > 0 || t === e.onglet);

/** Le texte du nombre d'une suggestion ou d'un élargissement (« 12 faits »). */
export const nombreFaits = (n: number) => pluriel(n, 'fait');
