// Adaptateurs mémoire de tous les ports, alimentés par les fixtures du contrat : ce que la racine
// de composition donne au cœur quand SOURCE_DONNEES=memoire, et l'adaptateur de référence de la
// suite de tests de contrat (rejouées par les handlers, ses réponses redonnent les fixtures).

import type { Depots, Horloge, Synthetiseur } from '../../ports';
import { chargerDonnees, type DonneesMemoire } from './donnees';
import { DiscussionsMemoire } from './discussions';
import { DossiersMemoire } from './dossiers';
import { HorlogeFixe } from './horloge';
import { InstitutionsMemoire } from './institutions';
import { PersonnesMemoire } from './personnes';
import { RechercheMemoire } from './recherche';
import { ScrutinsMemoire } from './scrutins';
import { SignalementsMemoire } from './signalements';
import { SynthetiseurMemoire } from './syntheses';
import { TransparenceMemoire } from './transparence';

export interface OptionsMemoire {
  /** Identifiants simulés comme retirés de la source ou fusionnés (G2). */
  retirees?: readonly string[];
  /** Horodatage des accusés de signalement. */
  maintenant?: () => string;
}

export interface Memoire {
  depots: Depots & { signalements: SignalementsMemoire };
  /** Les synthèses des fixtures (maquette) ; SansSynthese pour n'en avoir aucune. */
  synthetiseur: Synthetiseur;
  horloge: Horloge;
  donnees: Promise<DonneesMemoire>;
}

export function memoire(options: OptionsMemoire = {}): Memoire {
  const donnees = chargerDonnees(options.retirees);
  return {
    depots: {
      dossiers: new DossiersMemoire(donnees),
      discussions: new DiscussionsMemoire(donnees),
      personnes: new PersonnesMemoire(donnees),
      scrutins: new ScrutinsMemoire(donnees),
      institutions: new InstitutionsMemoire(donnees),
      transparence: new TransparenceMemoire(donnees),
      recherche: new RechercheMemoire(donnees),
      signalements: new SignalementsMemoire(donnees, options.maintenant),
    },
    synthetiseur: new SynthetiseurMemoire(donnees),
    horloge: new HorlogeFixe(),
    donnees,
  };
}

export const depotsMemoire = (options?: OptionsMemoire): Depots => memoire(options).depots;
