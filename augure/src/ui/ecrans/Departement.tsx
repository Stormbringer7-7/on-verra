// Fiche d'un département (canevas v4, « Département ») : ses élus en fonction, leur participation
// comparée à leur groupe, la participation du département par chambre, et, si l'on vient de la carte
// d'un scrutin, le vote de chacun de ses élus. Query `ConsulterDepartement { code, scrutin? }`.

import { useRoute, type RouteProp } from '@react-navigation/native';

import { ConsulterDepartement } from '@/core';
import type { Pages } from '../../navigation';
import { Signaler } from '../components/commun/Signaler';
import { Requete } from '../components/dossiers/blocs';
import { Ecran } from '../components/Ecran';
import { ContenuDepartement } from '../components/territoires/ContenuDepartement';
import { useCommand } from '../hooks/core';

export function Departement() {
  const { code, scrutin } = useRoute<RouteProp<Pages, 'Departement'>>().params;
  const resultat = useCommand(ConsulterDepartement(scrutin ? { code, scrutin } : { code }));
  const titre = resultat.statut === 'erreur' ? undefined : resultat.donnees?.departement.nom;

  return (
    <Ecran titre={titre}>
      <Requete resultat={resultat}>{(f) => <ContenuDepartement fiche={f} />}</Requete>
      <Signaler cible={{ type: 'autre', id: null }} ecran="Departement" />
    </Ecran>
  );
}
