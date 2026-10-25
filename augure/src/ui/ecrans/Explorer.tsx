// Explorer (canevas v4, « Filtrer ou voir ») : une seule vue filtrée de tous les faits du Parlement.
// L'état tient dans l'adresse (`/explorer?dossier=…&etape=…&ordre=dossier,etape`) : chaque filtre
// ajouté, retiré ou remonté remplace les paramètres de la page (on revient par le fil), et un lien
// profond rouvre exactement la même vue. Query `ExplorerFaits`.

import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { ExplorerFaits, type DemandeFaits } from '@/core';
import type { Pages } from '../../navigation';
import { Signaler } from '../components/commun/Signaler';
import { Requete } from '../components/dossiers/blocs';
import { Ecran } from '../components/Ecran';
import { VueExploration } from '../components/explorer/Exploration';
import { demandeExplorer, paramsExplorer, segmentsFil } from '../explorer';
import { useCommand } from '../hooks/core';

export function Explorer() {
  const params = useRoute<RouteProp<Pages, 'Explorer'>>().params;
  const navigation = useNavigation();
  const demande = demandeExplorer(params);
  const resultat = useCommand(ExplorerFaits(demande));
  // Les paramètres absents doivent disparaître de l'adresse : on les remet tous, vides ou non.
  const changer = (d: DemandeFaits) => {
    const suivants = paramsExplorer(d);
    const tous = Object.fromEntries(Object.keys({ ...params, ...suivants }).map((k) => [k, suivants[k as keyof typeof suivants]]));
    navigation.setParams(tous as never);
  };
  const titre =
    resultat.statut !== 'erreur' && resultat.donnees?.filtres.length
      ? segmentsFil(resultat.donnees)
          .map((s) => s.filtres[s.filtres.length - 1].libelle)
          .join(' · ')
      : 'Parcourir';

  return (
    <Ecran titre={titre}>
      <Requete resultat={resultat}>{(e) => <VueExploration e={e} changer={changer} />}</Requete>
      <Signaler cible={{ type: 'autre', id: null }} ecran="Explorer" />
    </Ecran>
  );
}
