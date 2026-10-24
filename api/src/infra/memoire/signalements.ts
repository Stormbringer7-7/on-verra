// Adaptateur mémoire de SignalementsRepository : garde les signalements reçus (tests, maquette)
// et rend un accusé numéroté, daté par `maintenant` (par défaut l'heure de l'accusé des fixtures).

import type { AccuseSignalement, Signalement } from '@contrat/domain/model';

import type { SignalementsRepository } from '../../ports';
import type { DonneesMemoire } from './donnees';

export class SignalementsMemoire implements SignalementsRepository {
  readonly recus: (Signalement & AccuseSignalement)[] = [];

  constructor(
    private readonly donnees: Promise<DonneesMemoire>,
    private readonly maintenant?: () => string,
  ) {}

  async enregistrer(signalement: Signalement): Promise<AccuseSignalement> {
    const { exemples } = await this.donnees;
    const recuLe = this.maintenant?.() ?? exemples.SignalerErreur[0]?.output.recuLe ?? new Date().toISOString();
    const accuse = { id: `signalement-fictif-${this.recus.length + 1}`, recuLe };
    this.recus.push({ ...signalement, ...accuse });
    return accuse;
  }
}
