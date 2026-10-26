// La carte d'une mesure (présence d'une chambre ou votes d'un scrutin) : en-tête du scrutin, vraie
// carte des départements, élus sans département, et ce que la carte ne dit pas. Sans donnée, rien
// n'est dessiné et l'écran dit pourquoi.

import { StyleSheet, View } from 'react-native';

import type { Carte } from '@/core';
import { dateLongue, resultatScrutin, titreScrutin } from '../../format';
import { formaterPourcentage, texteHorsDepartement, valeursCarte } from '../../territoires';
import { space } from '../../theme/tokens';
import { T } from '../base';
import { CarteDepartements } from '../carte/CarteDepartements';
import { Avertissement } from '../fondations';

export function LectureCarte({ carte, onDepartement }: { carte: Carte; onDepartement(code: string): void }) {
  const hors = texteHorsDepartement(carte.horsDepartement, carte.chambre);
  return (
    <View style={styles.lecture}>
      {carte.scrutin && (
        <View style={styles.scrutin}>
          <T variant="label" ton="inkMuted">
            {`Scrutin n° ${carte.scrutin.numero} · ${dateLongue(carte.scrutin.date)} · ${resultatScrutin(carte.scrutin)}`}
          </T>
          <T variant="heading">{titreScrutin(carte.scrutin)}</T>
        </View>
      )}
      {carte.departements.length ? (
        <CarteDepartements valeurs={valeursCarte(carte)} titre={carte.libelleValeur} formater={formaterPourcentage} onDepartement={onDepartement} />
      ) : (
        <Avertissement type="info" titre="Rien à dessiner">
          {carte.scrutin
            ? 'Aucun vote nominatif publié pour ce scrutin (vote à main levée, ou votes pas encore chargés).'
            : 'La participation par département n’est pas encore calculée.'}
        </Avertissement>
      )}
      {hors && (
        <T variant="small" ton="inkMuted">
          {hors}
        </T>
      )}
      <View style={styles.limites}>
        {carte.limites.map((l) => (
          <T key={l} variant="small" ton="inkSoft">
            {l}
          </T>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lecture: { gap: space[4] },
  scrutin: { gap: space[1] },
  limites: { gap: space[1] },
});
