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
import { analyserNumero } from '@/core/domain/familles';

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
 * officiel), la famille et les déclinaisons cochées, la page. Sans clé inutile.
 */
export function demandeFamilles(q: string, famille: FamilleRecherche | null, declinaisons: DeclinaisonRecherche[], page = 1): DemandeFamilles {
  const mot = q.trim();
  const cherche = mot.length >= LONGUEUR_MIN || analyserNumero(mot) !== null;
  return {
    ...(cherche ? { q: mot } : {}),
    ...(famille ? { famille } : {}),
    ...(famille && declinaisons.length ? { declinaisons } : {}),
    ...(page > 1 ? { page } : {}),
  };
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
