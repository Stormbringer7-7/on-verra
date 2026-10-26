// Adaptateur mémoire du FaitsRepository : la base de faits fictifs des fixtures et son lecteur
// (`@fixtures/faits`), sans les faits qui citent une entité retirée (G2), synthèses rendues null
// (G4 : le cœur les redemande au synthétiseur de maquette).

import type { DemandeGroupes, Nommes } from '@contrat/domain/explorer';
import type { CleFiltre, Fait, FiltresFaits, GroupeFaits, Page, ScrutinFiltre, SuggestionFiltre, TypeFait } from '@contrat/domain/model';
import { BASE_FAITS, lecteurFaits } from '@fixtures/faits';

import type { FaitsRepository } from '../../ports';

const cite = (valeur: unknown, ids: ReadonlySet<string>): boolean =>
  typeof valeur === 'string'
    ? ids.has(valeur)
    : Array.isArray(valeur)
      ? valeur.some((v) => cite(v, ids))
      : !!valeur && typeof valeur === 'object' && Object.values(valeur).some((v) => cite(v, ids));

const sansSynthese = (f: Fait): Fait =>
  f.type === 'amendement'
    ? { ...f, amendement: { ...f.amendement, objet: null } }
    : f.type === 'scrutin'
      ? { ...f, scrutin: { ...f.scrutin, enClair: null } }
      : f;

export class FaitsMemoire implements FaitsRepository {
  private readonly lire: ReturnType<typeof lecteurFaits>;
  private readonly retirees: ReadonlySet<string>;

  constructor(retirees: readonly string[] = []) {
    this.retirees = new Set(retirees);
    this.lire = lecteurFaits(BASE_FAITS.filter((x) => !cite(x, this.retirees)));
  }

  async nommer(filtres: FiltresFaits) {
    if (cite(filtres, this.retirees)) return null;
    return this.lire({ type: 'nommer', filtres }) as Nommes;
  }

  async compter(filtres: FiltresFaits) {
    return this.lire({ type: 'compter', filtres }) as Record<TypeFait, number>;
  }

  async groupes(demande: DemandeGroupes) {
    const page = this.lire({ type: 'groupes', demande }) as Page<GroupeFaits>;
    return { ...page, elements: page.elements.map((g) => ({ ...g, faits: g.faits.map(sansSynthese) })) };
  }

  async deplier(demande: DemandeGroupes, cle: string) {
    const page = this.lire({ type: 'deplier', demande, cle }) as Page<Fait>;
    return { ...page, elements: page.elements.map(sansSynthese) };
  }

  async suggerer(filtres: FiltresFaits, cle: CleFiltre, limite: number) {
    return this.lire({ type: 'suggerer', filtres, cle, limite }) as SuggestionFiltre[];
  }

  async scrutin(scrutin: string, groupe: string | null) {
    const s = this.lire({ type: 'scrutin', scrutin, groupe }) as ScrutinFiltre | null;
    return s && !this.retirees.has(scrutin) ? { ...s, scrutin: { ...s.scrutin, enClair: null } } : null;
  }
}
