// Répartition des voix d'un scrutin, calculée dans l'app depuis les votes nominatifs
// (`FicheScrutin.votes`) : filtres de la liste, tableau groupe × position, participation et cohésion
// de chaque groupe, écarts à la ligne du groupe, mêmes comptes par département, valeurs de la carte.
// Fonctions pures. Jamais un chiffre sans « par rapport à quoi » : chaque part porte sa base.
//
// La ligne d'un groupe est celle du scrutin entier (`PositionDeGroupe.ligne`, position majoritaire
// de ses votes exprimés, null à égalité) : dans un département ou un filtre, on mesure l'écart à
// cette ligne nationale, jamais à une majorité recalculée sur quelques élus.

import type { DepartementRef, GroupeRef, Position, PositionDeGroupe, PositionExprimee, VoteNominatif } from '@/core';

export const POSITIONS: readonly Position[] = ['pour', 'contre', 'abstention', 'non_votant', 'absent'];
const EXPRIMEES: readonly Position[] = ['pour', 'contre', 'abstention'];
export const estExprime = (p: Position): p is PositionExprimee => EXPRIMEES.includes(p);

export interface FiltreVotes {
  position?: Position | null;
  /** Identifiant de groupe ; « sans_groupe » pour les parlementaires sans groupe connu. */
  groupe?: string | null;
  /** Code du département ; « hors » pour ceux qui n'en ont pas (Français de l'étranger). */
  departement?: string | null;
  /** Recherche dans le nom, sans accents ni casse. */
  recherche?: string | null;
}

export const SANS_GROUPE = 'sans_groupe';
export const HORS_DEPARTEMENT = 'hors';

const normaliser = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Les votes qui passent tous les filtres, sauf la position si `sansPosition` (pour compter les onglets). */
export function filtrer(votes: VoteNominatif[], f: FiltreVotes, sansPosition = false): VoteNominatif[] {
  const q = f.recherche ? normaliser(f.recherche) : '';
  return votes.filter(
    (v) =>
      (sansPosition || !f.position || v.position === f.position) &&
      (!f.groupe || (f.groupe === SANS_GROUPE ? !v.personne.groupe : v.personne.groupe?.id === f.groupe)) &&
      (!f.departement || (f.departement === HORS_DEPARTEMENT ? !v.departement : v.departement?.code === f.departement)) &&
      (!q || normaliser(v.personne.nom).includes(q)),
  );
}

export type Comptes = Record<Position, number> & { membres: number };

export function compter(votes: VoteNominatif[]): Comptes {
  const c: Comptes = { pour: 0, contre: 0, abstention: 0, non_votant: 0, absent: 0, membres: votes.length };
  for (const v of votes) c[v.position]++;
  return c;
}

/** Une part et sa base : `valeur` en %, null quand la base est vide. */
export interface Part {
  valeur: number | null;
  n: number;
  base: number;
}

const part = (n: number, base: number): Part => ({ valeur: base ? (n / base) * 100 : null, n, base });

export const exprimes = (c: Comptes) => c.pour + c.contre + c.abstention;
/** A pris part au vote : un vote publié, non-votant compris (en séance, sans prendre part). */
export const votants = (c: Comptes) => exprimes(c) + c.non_votant;

/** Participation : votes publiés (non-votants compris) parmi les membres en mandat. */
export const participation = (c: Comptes): Part => part(votants(c), c.membres);

/** Part d'une position parmi les votes exprimés. */
export const partExprimee = (c: Comptes, p: PositionExprimee): Part => part(c[p], exprimes(c));

/** Votes exprimés qui suivent la ligne de leur groupe, parmi ceux dont le groupe a une ligne. */
export interface Cohesion {
  suivent: Part;
  /** Votes exprimés différents de la ligne. */
  ecarts: VoteNominatif[];
}

export function cohesion(votes: VoteNominatif[], lignes: Map<string, PositionExprimee | null>): Cohesion {
  let base = 0;
  let suivent = 0;
  const ecarts: VoteNominatif[] = [];
  for (const v of votes) {
    const ligne = v.personne.groupe ? lignes.get(v.personne.groupe.id) : null;
    if (!ligne || !estExprime(v.position)) continue;
    base++;
    if (v.position === ligne) suivent++;
    else ecarts.push(v);
  }
  return { suivent: part(suivent, base), ecarts };
}

export const lignesDesGroupes = (groupes: PositionDeGroupe[]) => new Map(groupes.map((g) => [g.groupe.id, g.ligne]));

export interface LigneRepartition {
  /** Groupe (tableau par groupe) ou département (tableau par département) ; null : sans groupe / hors département. */
  cle: string;
  groupe: GroupeRef | null;
  departement: DepartementRef | null;
  comptes: Comptes;
  participation: Part;
  cohesion: Cohesion;
  /** Ligne du groupe sur l'ensemble du scrutin (tableau par groupe). */
  ligne: PositionExprimee | null;
}

/** Tableau groupe × position, de la gauche vers la droite (ordre de `groupes`), sans groupe à la fin. */
export function parGroupe(votes: VoteNominatif[], groupes: PositionDeGroupe[]): LigneRepartition[] {
  const lignes = lignesDesGroupes(groupes);
  const ligne = (cle: string, groupe: GroupeRef | null, vs: VoteNominatif[], l: PositionExprimee | null): LigneRepartition => {
    const comptes = compter(vs);
    return { cle, groupe, departement: null, comptes, participation: participation(comptes), cohesion: cohesion(vs, lignes), ligne: l };
  };
  const tableau = groupes
    .map((g) => ligne(g.groupe.id, g.groupe, votes.filter((v) => v.personne.groupe?.id === g.groupe.id), g.ligne))
    .filter((l) => l.comptes.membres > 0);
  const sans = votes.filter((v) => !v.personne.groupe);
  if (sans.length) tableau.push(ligne(SANS_GROUPE, null, sans, null));
  return tableau;
}

/** Même tableau par département (ordre du code), hors département à la fin. */
export function parDepartement(votes: VoteNominatif[], groupes: PositionDeGroupe[]): LigneRepartition[] {
  const lignes = lignesDesGroupes(groupes);
  const par = new Map<string, { departement: DepartementRef | null; votes: VoteNominatif[] }>();
  for (const v of votes) {
    const cle = v.departement?.code ?? HORS_DEPARTEMENT;
    const e = par.get(cle) ?? { departement: v.departement, votes: [] };
    e.votes.push(v);
    par.set(cle, e);
  }
  return [...par.entries()]
    .sort(([a], [b]) => (a === HORS_DEPARTEMENT ? 1 : b === HORS_DEPARTEMENT ? -1 : a.localeCompare(b, 'fr', { numeric: true })))
    .map(([cle, e]) => {
      const c = compter(e.votes);
      return { cle, groupe: null, departement: e.departement, comptes: c, participation: participation(c), cohesion: cohesion(e.votes, lignes), ligne: null };
    });
}

/** Écarts à la ligne, regroupés par groupe (ordre de `groupes`). */
export function ecartsParGroupe(votes: VoteNominatif[], groupes: PositionDeGroupe[]): { groupe: PositionDeGroupe; ecarts: VoteNominatif[] }[] {
  const { ecarts } = cohesion(votes, lignesDesGroupes(groupes));
  return groupes
    .map((g) => ({ groupe: g, ecarts: ecarts.filter((v) => v.personne.groupe?.id === g.groupe.id) }))
    .filter((e) => e.ecarts.length > 0);
}

/** Ce que colore la carte. */
export type MesureCarte = 'pour' | 'participation' | 'ecarts';

export const MESURES_CARTE: { cle: MesureCarte; libelle: string; titre: string }[] = [
  { cle: 'pour', libelle: 'Part des pour', titre: 'Part des « pour » parmi les votes exprimés des élus du département' },
  { cle: 'participation', libelle: 'Participation', titre: 'Votes publiés (non-votants compris) parmi les élus du département en mandat' },
  { cle: 'ecarts', libelle: 'Écarts au groupe', titre: 'Votes exprimés différents de la ligne de leur groupe, parmi ceux des élus dont le groupe a une ligne' },
];

/** Valeur de chaque département (en %) pour la carte ; null : pas de base (aucun vote exprimé…). */
export function valeursCarte(votes: VoteNominatif[], groupes: PositionDeGroupe[], mesure: MesureCarte): Record<string, number | null> {
  const resultat: Record<string, number | null> = {};
  for (const l of parDepartement(votes, groupes)) {
    if (!l.departement) continue;
    resultat[l.departement.code] =
      mesure === 'pour'
        ? partExprimee(l.comptes, 'pour').valeur
        : mesure === 'participation'
          ? l.participation.valeur
          : l.cohesion.suivent.base
            ? 100 - l.cohesion.suivent.valeur!
            : null;
  }
  return resultat;
}

/** Une part lisible avec sa base : « 93 % (130 sur 140) », ou « — » sans base. */
export function textePart(p: Part, arrondi = 0): string {
  if (p.valeur === null) return '—';
  const v = p.valeur.toFixed(arrondi).replace('.', ',');
  return `${v} % (${p.n} sur ${p.base})`;
}
