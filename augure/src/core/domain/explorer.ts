// Règles de l'Explorer (faits filtrés), partagées par l'API et les fixtures : onglet et
// regroupement par défaut, objet focal, filtres suggérés, élargissements, comparaison. Elles ne
// lisent aucune donnée : `explorer` décrit les lectures dont elle a besoin (`Lecture`), qu'un
// exécutant résout (dépôts de l'API, en asynchrone ; base fictive des fixtures, en synchrone).

import type { DemandePage, GroupeRef, Page } from './commun';
import type {
  CleFiltre,
  DemandeFaits,
  Elargissement,
  ExplorationFaits,
  FamilleFiltre,
  Fait,
  FiltreActif,
  FiltresFaits,
  GroupeFaits,
  ObjetFocal,
  Regroupement,
  ScrutinFiltre,
  SuggestionFiltre,
  TypeFait,
} from './faits';

export const TYPES_FAITS: readonly TypeFait[] = ['interventions', 'amendements', 'votes', 'controle', 'transparence', 'personnes'];

/** Faits comptés dans le nombre d'une suggestion ou d'un élargissement (actions législatives). */
export const TYPES_ACTION: readonly TypeFait[] = ['interventions', 'amendements', 'votes'];

/** Familles et profondeur des filtres : l'ordre du fil d'Ariane. */
export const FAMILLES: readonly { famille: FamilleFiltre; cles: CleFiltre[] }[] = [
  { famille: 'lois', cles: ['dossier', 'etape', 'article'] },
  { famille: 'personnes', cles: ['groupe', 'personne'] },
  { famille: 'institutions', cles: ['chambre', 'organe'] },
  { famille: 'territoires', cles: ['departement'] },
  { famille: 'action', cles: ['scrutin', 'amendement'] },
];

export const CLES_FILTRES: readonly CleFiltre[] = FAMILLES.flatMap((f) => f.cles);

export const familleDe = (cle: CleFiltre): FamilleFiltre => FAMILLES.find((f) => f.cles.includes(cle))!.famille;

/** Regroupements proposés par onglet ; le premier n'est pas forcément le défaut (`regroupementParDefaut`). */
export const REGROUPEMENTS: Record<TypeFait, readonly Regroupement[]> = {
  interventions: ['dossier', 'etape', 'article', 'groupe', 'personne', 'organe', 'date'],
  amendements: ['sort', 'dossier', 'etape', 'article', 'groupe', 'personne'],
  votes: ['date', 'dossier', 'etape'],
  controle: ['date', 'groupe', 'personne'],
  transparence: ['nature', 'date'],
  personnes: ['groupe'],
};

/** Aperçu de chaque groupe (le reste : « Voir les N », `deplier`). */
export const APERCU_GROUPE = 3;
/** Suggestions par famille, au plus. */
export const LIMITE_SUGGESTIONS = 8;
/** Élargissements proposés, au plus. */
export const LIMITE_ELARGIR = 3;

export const LIMITES_FAITS = [
  'Un fait n’est rattaché à un objet que par un lien publié : une prise de parole sans lien vers un dossier ou un amendement n’apparaît pas sous ce dossier.',
  'Les votes à main levée ne sont pas nominatifs : aucun vote individuel n’existe, et ils ne sont montrés que pour un amendement filtré.',
  'Contrôle : seules les questions au Gouvernement sont chargées ; aucune n’est rattachée à un dossier.',
  'Transparence : un rapprochement « à vérifier » n’établit ni rencontre, ni influence.',
  'Territoires : les départements ne sont pas encore chargés.',
];

/** Le regroupement par défaut, selon les filtres posés (design : on descend d'un niveau). */
export function regroupementParDefaut(onglet: TypeFait, f: FiltresFaits): Regroupement {
  switch (onglet) {
    case 'interventions':
      if (!f.dossier && !f.organe) return 'dossier';
      if (f.dossier && !f.etape && !f.article) return 'etape';
      if (f.dossier && !f.article) return 'article';
      if (!f.groupe) return 'groupe';
      if (!f.personne) return 'personne';
      return 'date';
    case 'amendements':
      return 'sort';
    case 'votes':
    case 'controle':
      return 'date';
    case 'transparence':
      return 'nature';
    case 'personnes':
      return 'groupe';
  }
}

/** L'onglet demandé ; sinon votes (scrutin filtré), amendements (amendement filtré), puis le premier non vide. */
export function ongletParDefaut(f: FiltresFaits, compteurs: Record<TypeFait, number>): TypeFait {
  if (f.scrutin) return 'votes';
  if (f.amendement) return 'amendements';
  return TYPES_FAITS.find((t) => compteurs[t] > 0) ?? 'interventions';
}

/**
 * Filtres posés, du plus ancien au plus récent : ceux que `ordre` ne cite pas (dans l'ordre des
 * familles), puis ceux de `ordre`, dans son ordre. Le dernier est l'objet focal.
 */
export function ordreDesFiltres(f: FiltresFaits, ordre: readonly CleFiltre[] = []): CleFiltre[] {
  const poses = CLES_FILTRES.filter((c) => f[c] !== undefined);
  const cites = [...new Set(ordre.filter((c) => poses.includes(c)))];
  return [...poses.filter((c) => !cites.includes(c)), ...cites];
}

/** Ce qu'on retire pour élargir, du plus précis au plus large : au plus `LIMITE_ELARGIR`. */
export function elargissements(f: FiltresFaits, groupe: GroupeRef | null): { retirer: CleFiltre[]; libelle: string }[] {
  const e: { retirer: CleFiltre[]; libelle: string }[] = [];
  if (f.amendement) e.push({ retirer: ['amendement'], libelle: 'Tous les amendements' });
  if (f.scrutin) e.push({ retirer: ['scrutin'], libelle: 'Tous les votes' });
  if (f.article) e.push({ retirer: ['article'], libelle: 'Tous les articles' });
  if (f.etape) e.push({ retirer: ['etape'], libelle: 'Toutes les étapes' });
  if (f.personne) e.push({ retirer: ['personne'], libelle: groupe && f.groupe ? `Tout le groupe ${groupe.abrege}` : 'Toutes les personnes' });
  else if (f.groupe) e.push({ retirer: ['groupe'], libelle: 'Tous les groupes' });
  if (f.organe) e.push({ retirer: ['organe'], libelle: 'Tous les organes' });
  if (f.departement) e.push({ retirer: ['departement'], libelle: 'Toute la France' });
  return e.slice(0, LIMITE_ELARGIR);
}

/** Niveau suivant de chaque famille, à suggérer (design : panneau « Ajouter un filtre »). */
export function prochainsFiltres(f: FiltresFaits): { famille: FamilleFiltre; cle: CleFiltre }[] {
  const s: { famille: FamilleFiltre; cle: CleFiltre }[] = [];
  if (!f.dossier && !f.article) s.push({ famille: 'lois', cle: 'dossier' });
  else if (f.dossier && !f.etape) s.push({ famille: 'lois', cle: 'etape' });
  else if (!f.article) s.push({ famille: 'lois', cle: 'article' });
  if (!f.groupe && !f.personne) s.push({ famille: 'personnes', cle: 'groupe' });
  else if (!f.personne) s.push({ famille: 'personnes', cle: 'personne' });
  if (!f.chambre && !f.organe) s.push({ famille: 'institutions', cle: 'chambre' });
  else if (!f.organe) s.push({ famille: 'institutions', cle: 'organe' });
  return s;
}

const sans = (f: FiltresFaits, cles: readonly CleFiltre[]): FiltresFaits =>
  Object.fromEntries(Object.entries(f).filter(([c, v]) => v !== undefined && !cles.includes(c as CleFiltre))) as FiltresFaits;

// ---------- Lectures ----------

export interface DemandeGroupes {
  filtres: FiltresFaits;
  onglet: TypeFait;
  regroupement: Regroupement;
  page: Required<DemandePage>;
}

/** Ce que l'Explorer lit : chaque lecture a sa réponse (`ReponseLecture`). */
export type Lecture =
  | { type: 'nommer'; filtres: FiltresFaits }
  | { type: 'compter'; filtres: FiltresFaits }
  | { type: 'groupes'; demande: DemandeGroupes }
  | { type: 'deplier'; demande: DemandeGroupes; cle: string }
  | { type: 'suggerer'; filtres: FiltresFaits; cle: CleFiltre; limite: number }
  | { type: 'scrutin'; scrutin: string; groupe: string | null };

/**
 * Réponses : nommer → un `FiltreActif` et un `ObjetFocal` par filtre posé, null si un identifiant
 * est inconnu ; compter → nombre par type de fait ; groupes → page de groupes ; deplier → page de
 * faits ; suggerer → suggestions non vides, les plus nombreuses d'abord ; scrutin → répartition.
 */
export type Nommes = { actif: FiltreActif; focal: ObjetFocal }[] | null;
export type ReponseLecture = Nommes | Record<TypeFait, number> | Page<GroupeFaits> | Page<Fait> | SuggestionFiltre[] | ScrutinFiltre | null;

/** Introuvable : un filtre cite un identifiant inconnu (l'API en fait un 404). */
export class FiltreInconnu extends Error {
  constructor() {
    super('Filtre introuvable');
    this.name = 'FiltreInconnu';
  }
}

const VIDE: Record<TypeFait, number> = { interventions: 0, amendements: 0, votes: 0, controle: 0, transparence: 0, personnes: 0 };
const pageVide = <T>(p: Required<DemandePage>): Page<T> => ({ elements: [], page: p.page, taille: p.taille, total: 0, suivante: null });
const action = (c: Record<TypeFait, number>) => TYPES_ACTION.reduce((n, t) => n + c[t], 0);

/**
 * L'Explorer, comme une suite de lots de lectures : chaque `yield` rend un lot, l'exécutant renvoie
 * leurs réponses dans le même ordre. La demande est supposée validée (vocabulaires, `etape` avec
 * `dossier`, `comparer` avec `groupe`, `regrouper` permis pour l'onglet).
 */
export function* explorer(
  demande: DemandeFaits,
  page: Required<DemandePage>,
): Generator<Lecture[], ExplorationFaits, ReponseLecture[]> {
  const tous = demande.filtres ?? {};
  // Un filtre que les données ne permettent pas encore ne retient aucun fait : il est mis à part.
  const indisponibles: CleFiltre[] = tous.departement !== undefined ? ['departement'] : [];
  const filtres = sans(tous, indisponibles);
  const vide = indisponibles.length > 0;

  const [nommes, compteursLus] = yield [
    { type: 'nommer', filtres },
    ...(vide ? [] : [{ type: 'compter' as const, filtres }]),
  ];
  if (nommes === null) throw new FiltreInconnu();
  const noms = nommes as Exclude<Nommes, null>;
  const compteurs = vide ? VIDE : (compteursLus as Record<TypeFait, number>);

  const onglet = demande.onglet ?? ongletParDefaut(filtres, compteurs);
  const regroupement = demande.regrouper ?? regroupementParDefaut(onglet, filtres);
  const ordre = ordreDesFiltres(filtres, demande.ordre);
  const parCle = new Map(noms.map((n) => [n.actif.cle, n]));
  const actifs = CLES_FILTRES.flatMap((c) => (parCle.has(c) ? [parCle.get(c)!.actif] : []));
  const dernier = ordre.length ? parCle.get(ordre[ordre.length - 1]) : undefined;
  const groupeFiltre = parCle.get('groupe')?.actif.groupe ?? parCle.get('personne')?.actif.groupe ?? null;

  const larges = elargissements(tous, groupeFiltre);
  const suivants = prochainsFiltres(filtres);
  const comparer = demande.comparer && filtres.groupe ? demande.comparer : null;
  const autre = comparer ? { ...sans(filtres, ['groupe', 'personne']), groupe: comparer } : null;
  const groupes: DemandeGroupes = { filtres, onglet, regroupement, page };

  const lot: Lecture[] = [
    ...(vide ? [] : [{ type: 'groupes' as const, demande: groupes }]),
    ...(!vide && demande.deplier !== undefined ? [{ type: 'deplier' as const, demande: groupes, cle: demande.deplier }] : []),
    ...(!vide && filtres.scrutin ? [{ type: 'scrutin' as const, scrutin: filtres.scrutin, groupe: filtres.groupe ?? null }] : []),
    ...(vide ? [] : suivants.map((s) => ({ type: 'suggerer' as const, filtres, cle: s.cle, limite: LIMITE_SUGGESTIONS }))),
    ...larges.map((l) => ({ type: 'compter' as const, filtres: sans(filtres, l.retirer) })),
    ...(autre ? [{ type: 'nommer' as const, filtres: { groupe: comparer! } }, { type: 'compter' as const, filtres: autre }] : []),
    ...(autre && !vide ? [{ type: 'groupes' as const, demande: { ...groupes, filtres: autre } }] : []),
  ];
  const reponses = lot.length ? yield lot : [];
  let i = 0;
  const suite = <T>() => reponses[i++] as T;

  const lesGroupes = vide ? pageVide<GroupeFaits>(page) : suite<Page<GroupeFaits>>();
  const deplie = !vide && demande.deplier !== undefined ? suite<Page<Fait>>() : null;
  const scrutin = !vide && filtres.scrutin ? suite<ScrutinFiltre | null>() : null;
  const suggestions = vide
    ? []
    : suivants
        .map((s) => ({ famille: s.famille, filtres: suite<SuggestionFiltre[]>() }))
        .filter((s) => s.filtres.length > 0);
  const elargir: Elargissement[] = larges.map((l) => ({ ...l, nombre: action(suite<Record<TypeFait, number>>()) }));
  let comparaison: ExplorationFaits['comparaison'] = null;
  if (autre) {
    const nom = suite<Nommes>();
    if (nom === null) throw new FiltreInconnu();
    const compteursAutre = suite<Record<TypeFait, number>>();
    const groupesAutre = vide ? pageVide<GroupeFaits>(page) : suite<Page<GroupeFaits>>();
    const groupe = nom[0]?.actif.groupe;
    if (groupe) comparaison = { groupe, compteurs: compteursAutre, groupes: groupesAutre };
  }

  return {
    demande,
    filtres: actifs,
    focal: dernier?.focal ?? null,
    compteurs,
    onglet,
    regroupement,
    regroupements: [...REGROUPEMENTS[onglet]],
    groupes: lesGroupes,
    deplie,
    scrutin,
    suggestions,
    elargir,
    comparaison,
    indisponibles,
    limites: LIMITES_FAITS,
  };
}

/** Exécute l'Explorer sur un lecteur synchrone (fixtures). */
export function explorerSync(
  demande: DemandeFaits,
  page: Required<DemandePage>,
  lire: (l: Lecture) => ReponseLecture,
): ExplorationFaits {
  const g = explorer(demande, page);
  let etape = g.next([]);
  while (!etape.done) etape = g.next(etape.value.map(lire));
  return etape.value;
}

/** Exécute l'Explorer sur un lecteur asynchrone (API) : chaque lot est lu en parallèle. */
export async function explorerAsync(
  demande: DemandeFaits,
  page: Required<DemandePage>,
  lire: (l: Lecture) => Promise<ReponseLecture>,
): Promise<ExplorationFaits> {
  const g = explorer(demande, page);
  let etape = g.next([]);
  while (!etape.done) etape = g.next(await Promise.all(etape.value.map(lire)));
  return etape.value;
}
