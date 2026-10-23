import { Component, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Dernier recours : une erreur d'affichage montre son message au lieu d'un écran vide.
 * Sans thème ni police chargée (ils peuvent être la cause) : couleurs et polices du système.
 */
export class FiletErreurs extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  componentDidCatch(erreur: Error) {
    console.error('[augure] erreur d’affichage', erreur);
  }

  private reessayer = () => {
    if (Platform.OS === 'web') window.location.reload();
    else this.setState({ erreur: null });
  };

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    return (
      <View style={styles.fond}>
        <Text style={styles.titre}>L’application a rencontré une erreur</Text>
        <Text style={styles.message}>{erreur.message || String(erreur)}</Text>
        <Pressable accessibilityRole="button" onPress={this.reessayer} style={styles.bouton}>
          <Text style={styles.libelle}>RÉESSAYER</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: '#111', padding: 24, justifyContent: 'center', gap: 16 },
  titre: { color: '#fff', fontSize: 20, fontWeight: '700' },
  message: { color: '#f4a3a3', fontSize: 15 },
  bouton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#fff', paddingVertical: 10, paddingHorizontal: 16 },
  libelle: { color: '#fff', fontWeight: '600', letterSpacing: 1 },
});
