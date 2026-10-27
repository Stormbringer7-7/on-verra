// Recherche : la demande envoyée au bus depuis la saisie, et ce qu'ouvre un résultat (fonctions
// pures, testées sous Node).

import type {
  CompteRecherche,
  DeclinaisonRecherche,
  DemandeFamilles,
  DemandeRecherche,
  FamilleRecherche,
  FiltresFaits,
  ResultatFamille,
  TypeRecherche,
} from '@/core';
import { TEXTES_MAX, analyserNumero, expressions } from '@/core/domain/familles';
import { occurrences } from '@/core/domain/texte';

/** « Tout » ou un type. */
export type Filtre = TypeRecherche | 'tout';

/** En dessous, pas de recherche plein texte (un numéro officiel est cherché dès son premier chiffre). */
export const LONGUEUR_MIN = 2;

/** La demande envoyée au bus, sans clé inutile (même entrée que les fixtures et le cache). */
export function demandeRecherche(q: string, type: Filtre, page: number): DemandeRecherche | null {
  const mot = q.trim();
  if (mot.length < LONGUEUR_MIN) return null;
  return { q: mot, ...(type !== 'tout' ? { type } : {}), ...(page > 1 ? { page } : {}) };
}

/**
 * Recherche par familles : parcourir sans mot (ou sous LONGUEUR_MIN lettres, sauf un numéro
 * officiel), la famille et les déclinaisons cochées, la page, les expressions et la personne
 * filtrées. Sans clé inutile.
 */
export function demandeFamilles(
  q: string,
  famille: FamilleRecherche | null,
  declinaisons: DeclinaisonRecherche[],
  page = 1,
  filtres: { textes?: string[]; personne?: string | null } = {},
): DemandeFamilles {
  const mot = q.trim();
  const cherche = mot.length >= LONGUEUR_MIN || analyserNumero(mot) !== null;
  const textes = expressions(filtres.textes ?? []);
  return {
    ...(cherche ? { q: mot } : {}),
    ...(famille ? { famille } : {}),
    ...(famille && declinaisons.length ? { declinaisons } : {}),
    ...(textes.length ? { textes } : {}),
    ...(filtres.personne ? { personne: filtres.personne } : {}),
    ...(page > 1 ? { page } : {}),
  };
}

/** Ajouter une expression aux filtres : nettoyée, sans doublon, au plus TEXTES_MAX ; vide, rien ne change. */
export const ajouterExpression = (textes: string[], texte: string) => expressions([...textes, texte]).slice(0, TEXTES_MAX);

/** Déclinaisons dont un résultat est une personne qu'on peut filtrer. */
export const DECLINAISONS_PERSONNES: DeclinaisonRecherche[] = ['deputes', 'senateurs', 'ministres'];

/**
 * Les segments d'un extrait : où chaque expression figure mot pour mot (surlignée), le reste tel
 * quel. Une expression trouvée par la base sous une autre forme (accord, conjugaison) n'est pas
 * surlignée : rien n'est deviné.
 */
export function surligner(texte: string, textes: readonly string[]): { texte: string; surligne: boolean }[] {
  const zones = textes
    .flatMap((t) => occurrences(texte, t))
    .sort((a, b) => a[0] - b[0])
    .reduce<[number, number][]>((acc, z) => {
      const der = acc[acc.length - 1];
      if (der && z[0] <= der[1]) der[1] = Math.max(der[1], z[1]);
      else acc.push([...z]);
      return acc;
    }, []);
  const segments: { texte: string; surligne: boolean }[] = [];
  let i = 0;
  for (const [debut, fin] of zones) {
    if (debut > i) segments.push({ texte: texte.slice(i, debut), surligne: false });
    segments.push({ texte: texte.slice(debut, fin), surligne: true });
    i = fin;
  }
  if (i < texte.length) segments.push({ texte: texte.slice(i), surligne: false });
  return segments;
}

/** Un compte affiché : « 12 », « 1 000+ » au-delà du plafond. */
export const libelleCompte = (c: CompteRecherche | null, nombre: (n: number) => string) =>
  c === null ? '' : `${nombre(c.nombre)}${c.plafonne ? '+' : ''}`;

/** Où mène un résultat. */
export type Ouverture =
  | { ecran: 'dossier'; id: string }
  | { ecran: 'etape'; dossier: string; cle: Extract<ResultatFamille['fiche'], { type: 'etape' }>['cle'] }
  | { ecran: 'article'; id: string }
  | { ecran: 'personne'; id: string }
  | { ecran: 'scrutin'; id: string }
  | { ecran: 'amendement'; id: string }
  | { ecran: 'institution'; institution: Extract<ResultatFamille['fiche'], { type: 'institution' }>['institution'] }
  | { ecran: 'representant'; id: string }
  | { ecran: 'explorer'; filtres: FiltresFaits };

/**
 * Règle du design v4 : toucher un objet filtre (l'Explorer sur ses `filtres`) ; voir l'objet seul
 * est l'action « Fiche » à part (`fiche`). Sans filtre, sa fiche ; null s'il ne mène encore nulle
 * part.
 */
export function ouverture(r: ResultatFamille): Ouverture | null {
  if (r.filtres && Object.keys(r.filtres).length > 0) return { ecran: 'explorer', filtres: r.filtres };
  return ficheDe(r);
}

/** La fiche seule d'un résultat (action « Fiche ») ; sans fiche, celle de la personne ou du dossier qu'il filtre. */
export function ficheDe(r: ResultatFamille): Ouverture | null {
  const f = r.fiche;
  if (f) {
    switch (f.type) {
      case 'etape':
        return { ecran: 'etape', dossier: f.dossier, cle: f.cle };
      case 'institution':
        return { ecran: 'institution', institution: f.institution };
      default:
        return { ecran: f.type, id: f.id };
    }
  }
  const filtres: FiltresFaits = r.filtres ?? {};
  if (filtres.personne) return { ecran: 'personne', id: filtres.personne };
  if (filtres.dossier) return { ecran: 'dossier', id: filtres.dossier };
  return null;
}
