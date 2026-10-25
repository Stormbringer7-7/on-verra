// Onglet Chiffres (canevas v4, « Chiffres ») : des chiffres qui ouvrent leurs faits. Aujourd'hui
// « Où en sont les textes » (query `ConsulterAvancement`) : l'engorgement du parcours et les textes
// qui attendent un acte hors du Parlement. Les autres cartes du canevas viendront avec leurs
// données : aucune valeur n'est inventée.

import { StyleSheet, View } from 'react-native';

import { ConsulterAvancement } from '@/core';
import { T, TitreEcran } from '../components/base';
import { CarteAvancement, HorsParlement, Limites } from '../components/chiffres/Avancement';
import { Signaler } from '../components/commun/Signaler';
import { Requete } from '../components/dossiers/blocs';
import { Ecran } from '../components/Ecran';
import { useCommand } from '../hooks/core';
import { useLarge } from '../hooks/miseEnPage';
import { space } from '../theme/tokens';

export function Chiffres() {
  const avancement = useCommand(ConsulterAvancement({}));
  const large = useLarge();
  return (
    <Ecran>
      <View style={styles.entete}>
        <TitreEcran>Chiffres</TitreEcran>
        <T ton="inkSoft">Le Parlement en chiffres, mis à jour chaque nuit. Touchez un chiffre pour voir les faits qui l’expliquent.</T>
      </View>
      <Requete resultat={avancement}>
        {(a) => (
          <View style={[styles.grille, large && styles.grilleLarge]}>
            <View style={large ? styles.principale : undefined}>
              <CarteAvancement avancement={a} />
            </View>
            <View style={[styles.laterale, large && styles.lateraleLarge]}>
              <HorsParlement avancement={a} />
              <Limites limites={a.limites} />
            </View>
          </View>
        )}
      </Requete>
      <Signaler cible={{ type: 'autre', id: null }} ecran="Chiffres" />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  grille: { gap: space[8] },
  grilleLarge: { flexDirection: 'row', alignItems: 'flex-start', gap: space[10] },
  principale: { flex: 3, minWidth: 0 },
  laterale: { gap: space[6] },
  lateraleLarge: { flex: 2, minWidth: 0 },
});
