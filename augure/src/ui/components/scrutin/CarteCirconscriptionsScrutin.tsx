// Carte d'un scrutin AN par circonscription, sur l'écran du scrutin : chaque circonscription
// colorée selon le mode choisi (scrutin/Modes) : position de son député, couleur de son groupe, ou
// couleur de son groupe s'il a pris part au vote (ConsulterCarte, niveau circonscription). À part de
// CarteScrutin, qui reste rendue sans requête (tests).

import { ConsulterCarte, type GroupeRef, type ValeurCirconscription } from '@/core';
import { useCommand } from '../../hooks/core';
import { usePalette } from '../../theme/ThemeProvider';
import { CarteCirconscriptions } from '../carte/CarteCirconscriptions';
import { Requete } from '../dossiers/blocs';
import { Avertissement } from '../fondations';
import { couleurSelonMode, LegendeMode, type ModeCouleur } from './Modes';

/** Une circonscription par député, colorée selon le mode (l'API lit le vote et la circonscription publiée). */
export function CarteCirconscriptionsScrutin({
  scrutin,
  mode = 'pour_contre',
  groupes = [],
  onDepartement,
  onPersonne,
}: {
  scrutin: string;
  mode?: ModeCouleur;
  /** Groupes du scrutin, de la gauche vers la droite (légende des modes par groupe). */
  groupes?: GroupeRef[];
  onDepartement(code: string): void;
  onPersonne(id: string): void;
}) {
  const p = usePalette();
  const carte = useCommand(ConsulterCarte({ mesure: 'scrutin', scrutin, niveau: 'circonscription' }));
  // Sans donnée : le fond ; vacante : position null (couleurSelonMode la rend en creux).
  const colorier = (v: ValeurCirconscription | undefined) =>
    !v ? p.surfaceRaised : couleurSelonMode(p, mode, v.depute?.groupe ?? null, v.depute ? (v.position ?? 'absent') : null);
  return (
    <Requete resultat={carte}>
      {(c) =>
        // Une API antérieure au niveau circonscription renvoie la carte sans ce champ.
        c.circonscriptions?.length ? (
          <CarteCirconscriptions
            circonscriptions={c.circonscriptions}
            onPersonne={onPersonne}
            onDepartement={onDepartement}
            colorier={mode === 'pour_contre' ? undefined : colorier}
            legende={<LegendeMode mode={mode} groupes={groupes} />}
          />
        ) : (
          <Avertissement type="info" titre="Rien à dessiner">
            {c.circonscriptions ? 'La circonscription des députés n’est pas encore connue pour ce scrutin.' : 'Le serveur ne fournit pas encore la carte par circonscription.'}
          </Avertissement>
        )
      }
    </Requete>
  );
}
