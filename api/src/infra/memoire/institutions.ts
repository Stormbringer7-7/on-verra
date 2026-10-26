// Adaptateur mémoire d'InstitutionsRepository : hémicycles, Gouvernement et Conseil
// constitutionnel des fixtures. La composition est datée du jour demandé.

import type { Institution } from '@contrat/domain/model';

import type { InstitutionsRepository } from '../../ports';
import { type DonneesMemoire, premier } from './donnees';

type DeType<T extends Institution['type']> = Extract<Institution, { type: T }>;

export class InstitutionsMemoire implements InstitutionsRepository {
  constructor(private readonly donnees: Promise<DonneesMemoire>) {}

  private async institution<T extends Institution['type']>(type: T): Promise<DeType<T> | null> {
    const { exemples } = await this.donnees;
    return (premier(exemples.ConsulterInstitution, (e) => e.output.type === type)?.output as DeType<T> | undefined) ?? null;
  }

  async chambre(chambre: 'an' | 'senat', date: string): Promise<DeType<'an' | 'senat'>> {
    const i = await this.institution(chambre);
    const libelle = chambre === 'an' ? 'Assemblée nationale' : 'Sénat';
    return i ? { ...i, date } : { type: chambre, libelle, legislature: null, date, sieges: 0, groupes: [], sansGroupe: 0, membres: [] };
  }

  async gouvernement(_date: string) {
    const i = await this.institution('gouvernement');
    if (!i) return { type: 'gouvernement' as const, libelle: 'Gouvernement', actuel: null, gouvernements: [] };
    const { textesDeposes: _t, ...reste } = i;
    return reste;
  }

  async conseilConstitutionnel(limite: number): Promise<DeType<'cc'>> {
    const i = await this.institution('cc');
    if (!i) return { type: 'cc', libelle: 'Conseil constitutionnel', saisinesEnCours: [], decisions: [] };
    return { ...i, decisions: i.decisions.slice(0, limite) };
  }
}
