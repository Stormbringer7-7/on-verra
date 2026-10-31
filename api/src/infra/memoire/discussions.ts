// Adaptateur mémoire de DiscussionsRepository : « Qui intervient » des étapes, interventions
// listées, extraits sous les amendements, autour d'un scrutin et avant les votes, tels que dans les
// fixtures.

import type { CibleInterventions, CleCase } from '@contrat/domain/model';

import type { DiscussionsRepository, Pagination } from '../../ports';
import { type DonneesMemoire, cleJson, paginer, premier } from './donnees';

export class DiscussionsMemoire implements DiscussionsRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  async intervenants(dossier: string, cle: CleCase, limite: number) {
    const { exemples } = await this.donnees;
    const qui = premier(exemples.ConsulterEtape, (e) => e.input.dossier === dossier && e.input.cle === cle)?.output.quiIntervient;
    return { intervenants: (qui?.intervenants ?? []).slice(0, limite), total: qui?.total ?? 0 };
  }

  async interventions(cible: CibleInterventions, pagination: Pagination) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ListerInterventions, (x) => cleJson(x.input.cible) === cleJson(cible))?.output;
    if (!e) return null;
    // La fixture ne publie que la première page ; son total est celui de la source.
    const { elements, total } = e.interventions;
    return { libelle: e.libelle, interventions: paginer(elements, pagination, Math.max(total ?? 0, elements.length)) };
  }

  async surAmendement(amendement: string, limite: number) {
    const { exemples } = await this.donnees;
    const d = premier(exemples.ConsulterAmendement, (e) => e.input.id === amendement)?.output.discussions;
    return { extraits: (d?.extraits ?? []).slice(0, limite), total: d?.total ?? 0 };
  }

  async avantLeVote(scrutin: string, personne: string, limite: number) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ExpliquerVote, (x) => x.input.scrutin === scrutin && x.input.personne === personne)?.output;
    return (e?.interventionsAvant ?? []).slice(0, limite);
  }

  /** Celles de la fiche du scrutin des fixtures ; null si la fiche n'en relie aucune (ou n'existe pas). */
  async duScrutin(scrutin: string, _amendement: string | null, limite: number) {
    const { exemples } = await this.donnees;
    const i = premier(exemples.ConsulterScrutin, (e) => e.input.id === scrutin)?.output.interventions;
    return i ? { ...i, extraits: i.extraits.slice(0, limite) } : null;
  }
}
