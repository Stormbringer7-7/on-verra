// Carte d'un scrutin AN par circonscription, sur l'écran du scrutin : chaque circonscription
// colorée par la position de son député (ConsulterCarte, niveau circonscription). À part de
// CarteScrutin, qui reste rendue sans requête (tests).

import { ConsulterCarte } from '@/core';
import { useCommand } from '../../hooks/core';
import { CarteCirconscriptions } from '../carte/CarteCirconscriptions';
import { Requete } from '../dossiers/blocs';
import { Avertissement } from '../fondations';

/** Une circonscription par député, colorée par sa position (l'API lit le vote et la circonscription publiée). */
export function CarteCirconscriptionsScrutin({ scrutin, onDepartement, onPersonne }: { scrutin: string; onDepartement(code: string): void; onPersonne(id: string): void }) {
  const carte = useCommand(ConsulterCarte({ mesure: 'scrutin', scrutin, niveau: 'circonscription' }));
  return (
    <Requete resultat={carte}>
      {(c) =>
        // Une API antérieure au niveau circonscription renvoie la carte sans ce champ.
        c.circonscriptions?.length ? (
          <CarteCirconscriptions circonscriptions={c.circonscriptions} onPersonne={onPersonne} onDepartement={onDepartement} />
        ) : (
          <Avertissement type="info" titre="Rien à dessiner">
            {c.circonscriptions ? 'La circonscription des députés n’est pas encore connue pour ce scrutin.' : 'Le serveur ne fournit pas encore la carte par circonscription.'}
          </Avertissement>
        )
      }
    </Requete>
  );
}

