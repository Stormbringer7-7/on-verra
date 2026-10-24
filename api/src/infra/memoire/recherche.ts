// Adaptateur mémoire de RechercheRepository : les réponses des fixtures pour une requête connue ;
// sinon, recherche sans casse ni accents dans toutes les réponses connues. Une section par type
// trouvé, paginée.

import type { DemandeRecherche, ResultatRecherche, Trouve, TypeRecherche } from '@contrat/domain/model';
import { normaliser } from '@contrat/domain/texte';

import type { Pagination, RechercheRepository } from '../../ports';
import { type DonneesMemoire, paginer } from './donnees';

const ORDRE: TypeRecherche[] = ['dossiers', 'personnes', 'amendements', 'scrutins', 'organisations'];

export class RechercheMemoire implements RechercheRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  async rechercher(demande: DemandeRecherche, pagination: Pagination): Promise<ResultatRecherche> {
    const { exemples } = await this.donnees;
    const q = normaliser(demande.q.trim());
    const exact = exemples.Rechercher.find((e) => normaliser(e.input.q.trim()) === q && (!e.input.type || e.input.type === demande.type));
    const connus: Trouve[] = exact
      ? exact.output.sections.flatMap((s) => s.resultats.elements)
      : exemples.Rechercher.flatMap((e) => e.output.sections.flatMap((s) => s.resultats.elements)).filter((t) =>
          normaliser(`${t.titre} ${t.contexte}`).includes(q),
        );
    const uniques = connus.filter((t, i) => connus.findIndex((x) => x.type === t.type && x.id === t.id) === i);
    const sections = ORDRE.filter((type) => !demande.type || type === demande.type)
      .map((type) => ({ type, resultats: paginer(uniques.filter((t) => t.type === type), pagination) }))
      .filter((s) => s.resultats.total > 0);
    return { q: demande.q, type: demande.type ?? null, sections };
  }
}
