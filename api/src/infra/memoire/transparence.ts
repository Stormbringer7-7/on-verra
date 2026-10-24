// Adaptateur mémoire de TransparenceRepository : déclarations HATVP, représentants d'intérêts et
// rapprochements des fixtures, chacun avec son statut.

import type { DeclarationHatvp, DeclarationResume, LienInteret } from '@contrat/domain/model';

import type { Pagination, TransparenceRepository } from '../../ports';
import { type DonneesMemoire, paginer, premier } from './donnees';

const resume = ({ id, type, libelle, modificative, dateDepot, datePublication, url }: DeclarationHatvp): DeclarationResume => ({
  id,
  type,
  libelle,
  modificative,
  dateDepot,
  datePublication,
  url,
});

export class TransparenceMemoire implements TransparenceRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  async declarations(personne: string) {
    const { exemples } = await this.donnees;
    const c = premier(exemples.ConsulterPersonne, (e) => e.output.entete.id === personne && e.output.contenu.onglet === 'declarations')?.output.contenu;
    return c?.onglet === 'declarations' ? c.declarations : [];
  }

  async declarationsResumees(personne: string) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ExpliquerVote, (x) => x.input.personne === personne)?.output;
    return e ? e.declarations.declarations : (await this.declarations(personne)).map(resume);
  }

  async representant(id: string, pagination: Pagination) {
    const { exemples } = await this.donnees;
    const e = premier(exemples.ConsulterRepresentant, (x) => x.input.id === id)?.output;
    if (!e) return null;
    const { rapprochements: _r, actions, ...reste } = e;
    return { ...reste, actions: paginer(actions.elements, pagination, Math.max(actions.total ?? 0, actions.elements.length)) };
  }

  async interetsDe(
    cible:
      | { type: 'dossier'; id: string }
      | { type: 'amendement'; id: string }
      | { type: 'article'; id: string }
      | { type: 'representant'; id: string }
      | { type: 'vote'; scrutin: string; personne: string },
  ): Promise<LienInteret[]> {
    const { exemples } = await this.donnees;
    switch (cible.type) {
      case 'dossier':
        return premier(exemples.ConsulterDossier, (e) => e.output.entete.id === cible.id)?.output.interets ?? [];
      case 'amendement':
        return premier(exemples.ConsulterAmendement, (e) => e.input.id === cible.id)?.output.interets ?? [];
      case 'representant':
        return premier(exemples.ConsulterRepresentant, (e) => e.input.id === cible.id)?.output.rapprochements ?? [];
      case 'vote':
        return premier(exemples.ExpliquerVote, (e) => e.input.scrutin === cible.scrutin && e.input.personne === cible.personne)?.output.lobbying ?? [];
      case 'article':
        // Aucun écran des fixtures ne montre les intérêts d'un article.
        return [];
    }
  }
}
