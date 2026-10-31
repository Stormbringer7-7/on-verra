// Onglets à icônes (planche « Scrutin » : Par groupe · Hémicycle · Carte) : un sélecteur segmenté,
// l'actif en aplat `ink`, chaque onglet avec son icône du design system. L'appui s'enfonce (Appui),
// le changement d'onglet est animé par l'écran (Apparition du contenu).

import { StyleSheet, View } from 'react-native';

import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { T } from '../base';
import { Icone, type NomIcone } from '../Icone';
import { Appui } from '../mouvement';

export function OngletsIcones<K extends string>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: { cle: K; libelle: string; icone: NomIcone }[];
  valeur: K;
  onChange(cle: K): void;
  label: string;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.racine, { backgroundColor: p.surfaceRaised }]}>
      {options.map((o) => {
        const actif = o.cle === valeur;
        const couleur = actif ? p.surface : p.inkSoft;
        return (
          <Appui
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={o.libelle}
            onPress={() => onChange(o.cle)}
            style={[styles.onglet, { backgroundColor: actif ? p.ink : 'transparent' }]}
          >
            <Icone nom={o.icone} couleur={couleur} taille={16} />
            <T variant="label" couleur={couleur} numberOfLines={1}>
              {o.libelle}
            </T>
          </Appui>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flexDirection: 'row', gap: space[1], padding: space[1], borderRadius: 12 },
  onglet: { flex: 1, minHeight: 44, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: space[2] },
});
