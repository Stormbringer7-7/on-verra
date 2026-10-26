// Bouton « Suivre » des fiches Dossier et Personne : le suivi reste sur l'appareil (réglages), il
// alimente « Mes suivis ». Bouton à bascule (état lu par les lecteurs d'écran), 44 px au moins.

import { Pressable, StyleSheet } from 'react-native';

import { useSuivis } from '../../hooks/reglages';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label } from '../base';

function Bascule({ actif, libelle, onPress }: { actif: boolean; libelle: string; onPress(): void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={actif ? `Ne plus suivre ${libelle}` : `Suivre ${libelle}`}
      onPress={onPress}
      style={[styles.bouton, actif ? { backgroundColor: p.ink, borderColor: p.ink } : { borderColor: p.lineStrong }]}
    >
      <Label couleur={actif ? p.surface : p.ink}>{actif ? 'Suivi ✓' : 'Suivre'}</Label>
    </Pressable>
  );
}

export function SuivreDossier({ id, titre }: { id: string; titre: string }) {
  const s = useSuivis();
  return <Bascule actif={s.suitDossier(id)} libelle={titre} onPress={() => s.basculerDossier({ id, titre })} />;
}

export function SuivrePersonne({ id, nom }: { id: string; nom: string }) {
  const s = useSuivis();
  return <Bascule actif={s.suitPersonne(id)} libelle={nom} onPress={() => s.basculerPersonne({ id, nom })} />;
}

const styles = StyleSheet.create({
  bouton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' },
});
