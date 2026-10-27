// Adaptateur mémoire de TerritoiresRepository : les cartes et départements des fixtures, découpés
// en réponses du port (le cœur recalcule la valeur de chaque département et les limites).

import type { Chambre } from '@contrat/domain/model';

import type { TerritoiresRepository } from '../../ports';
import { type DonneesMemoire, premier } from './donnees';

export class TerritoiresMemoire implements TerritoiresRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  async carteScrutin(scrutin: string) {
    const { exemples } = await this.donnees;
    const c = premier(exemples.ConsulterCarte, (e) => e.input.mesure === 'scrutin' && e.input.scrutin === scrutin)?.output;
    if (!c?.scrutin) return null;
    return {
      scrutin: c.scrutin,
      departements: c.departements.flatMap((d) => (d.votes ? [{ departement: d.departement, votes: d.votes }] : [])),
      horsDepartement: c.horsDepartement,
    };
  }

  async circonscriptionsScrutin(scrutin: string) {
    const { exemples } = await this.donnees;
    if (!premier(exemples.ConsulterCarte, (e) => e.input.mesure === 'scrutin' && e.input.scrutin === scrutin)) return null;
    const c = premier(exemples.ConsulterCarte, (e) => e.input.mesure === 'scrutin' && e.input.scrutin === scrutin && e.output.niveau === 'circonscription')?.output;
    return c?.circonscriptions ?? [];
  }

  async cartePresence(chambre: Chambre) {
    const { exemples } = await this.donnees;
    const c = premier(exemples.ConsulterCarte, (e) => e.input.mesure === 'presence' && e.input.chambre === chambre)?.output;
    return {
      departements: (c?.departements ?? []).flatMap((d) => (d.presence ? [{ departement: d.departement, presence: d.presence }] : [])),
      horsDepartement: c?.horsDepartement ?? 0,
    };
  }

  async departement(code: string) {
    const { exemples } = await this.donnees;
    const f = premier(exemples.ConsulterDepartement, (e) => e.input.code === code)?.output;
    if (!f) return null;
    const { scrutin: _s, limites: _l, ...reste } = f;
    return reste;
  }

  async votesDepartement(code: string, scrutin: string) {
    const { exemples } = await this.donnees;
    return premier(exemples.ConsulterDepartement, (e) => e.input.code === code && e.input.scrutin === scrutin)?.output.scrutin ?? null;
  }
}
