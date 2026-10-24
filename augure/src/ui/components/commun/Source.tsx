// La source d'un fait : « Source : AN · DLR5L17N54085 », lien vers la page officielle si la
// provenance en a une (jamais d'URL inventée : sans `url`, le texte seul).
//   compact : la pastille bordée du canevas (« AN · DLR5L17N54085 ↗ »), à côté d'un chiffre ou d'une citation.

import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { Provenance } from '@/core';
import { texteSource } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';

export function Source(props: { provenance: Provenance; compact?: boolean }) {
  const { provenance, compact = false } = props;
  const p = usePalette();
  const texte = texteSource(provenance);
  const url = provenance.url;
  const ouvrir = url ? () => void Linking.openURL(url).catch(() => {}) : undefined;
  const description = `Source : ${texte}${url ? ', ouvrir la page officielle' : ''}`;

  if (compact) {
    const pastille = (
      <View style={[styles.pastille, { borderColor: p.lineStrong }]}>
        <Label style={styles.pastilleTexte} numberOfLines={1}>
          {texte}
          {url ? ' ↗' : ''}
        </Label>
      </View>
    );
    return ouvrir ? (
      <Pressable accessibilityRole="link" accessibilityLabel={description} onPress={ouvrir} hitSlop={10} style={styles.compact}>
        {pastille}
      </Pressable>
    ) : (
      <View accessibilityLabel={description} style={styles.compact}>
        {pastille}
      </View>
    );
  }

  return ouvrir ? (
    <Pressable accessibilityRole="link" accessibilityLabel={description} onPress={ouvrir} hitSlop={8} style={styles.ligne}>
      <T variant="caption" ton="inkMuted">
        Source : <T variant="caption" couleur={p.signal}>{texte} ↗</T>
      </T>
    </Pressable>
  ) : (
    <View style={styles.ligne}>
      <T variant="caption" ton="inkMuted">
        Source : {texte}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { alignSelf: 'flex-start' },
  pastille: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderRadius: radius.sm },
  pastilleTexte: { fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
  ligne: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center', paddingVertical: space[1] },
});
