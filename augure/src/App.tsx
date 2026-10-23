import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansCondensed_400Regular,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-condensed';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createContainer } from './di/container';
import { liens, type Onglets, type Pages } from './navigation';
import { Label, T } from './ui/components/base';
import { Chargement, Erreur, Navigation, NOM_APP, type Section } from './ui/components/Ecran';
import { FiletErreurs } from './ui/components/FiletErreurs';
import { Assemblee } from './ui/ecrans/Assemblee';
import { Depute } from './ui/ecrans/Depute';
import { Champions } from './ui/ecrans/Champions';
import { Groupe } from './ui/ecrans/Groupe';
import { Recherche } from './ui/ecrans/Recherche';
import { Scrutin } from './ui/ecrans/Scrutin';
import { Scrutins } from './ui/ecrans/Scrutins';
import { CoreProvider, useCore } from './ui/hooks/core';
import { useLarge } from './ui/hooks/miseEnPage';
import { ThemeProvider, usePalette } from './ui/theme/ThemeProvider';
import { space } from './ui/theme/tokens';


const Pile = createNativeStackNavigator<Pages>();
const Tabs = createBottomTabNavigator<Onglets>();

const SECTIONS: Record<keyof Onglets, Section> = {
  Assemblee: 'assemblee',
  Scrutins: 'scrutins',
  Champions: 'champions',
  Recherche: 'recherche',
};

export default function App() {
  return (
    <FiletErreurs>
      <Application />
    </FiletErreurs>
  );
}

function Application() {
  const [bus] = useState(createContainer);
  // Polices introuvables (réseau, vieux navigateur) : l'app s'affiche avec celles du système.
  const [polices, erreurPolices] = useFonts({
    IBMPlexSansCondensed_400Regular,
    IBMPlexSansCondensed_600SemiBold,
    IBMPlexSansCondensed_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="light" />
        <CoreProvider bus={bus}>{polices || erreurPolices ? <Demarrage /> : <Fond />}</CoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Fond() {
  return <View style={{ flex: 1, backgroundColor: usePalette().surface }} />;
}

/** Tant que la base n'est pas ouverte : écran d'attente ou d'erreur. Ensuite : l'app. */
function Demarrage() {
  const p = usePalette();
  const { demarrage, synchroniser } = useCore();

  if (demarrage.statut !== 'pret') {
    return (
      <View style={[styles.demarrage, { backgroundColor: p.surface }]}>
        <T variant="title">{NOM_APP}</T>
        <Label>Qui vote quoi, scrutin par scrutin</Label>
        {demarrage.statut === 'chargement' ? (
          <Chargement libelle="OUVERTURE DES DONNÉES DE L'ASSEMBLÉE" />
        ) : (
          <Erreur message={demarrage.message} onReessayer={synchroniser} />
        )}
      </View>
    );
  }

  const theme: Theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: p.surface, card: p.surfaceRaised } };
  return (
    <NavigationContainer theme={theme} linking={liens} documentTitle={{ formatter: () => NOM_APP }}>
      <Pile.Navigator screenOptions={{ headerShown: false }}>
        <Pile.Screen name="Onglets" component={OngletsPrincipaux} />
        <Pile.Screen name="Groupe" component={Groupe} />
        <Pile.Screen name="Depute" component={Depute} />
        <Pile.Screen name="Scrutin" component={Scrutin} />
      </Pile.Navigator>
    </NavigationContainer>
  );
}

function OngletsPrincipaux() {
  const large = useLarge();
  return (
    <Tabs.Navigator
      // Mise en page large : la navigation devient un en-tête.
      screenOptions={{ headerShown: false, tabBarPosition: large ? 'top' : 'bottom' }}
      tabBar={({ state, navigation }) => (
        <Navigation
          active={SECTIONS[state.routes[state.index].name as keyof Onglets]}
          onNavigate={(s) => {
            const onglet = (Object.keys(SECTIONS) as (keyof Onglets)[]).find((o) => SECTIONS[o] === s)!;
            navigation.navigate(onglet);
          }}
        />
      )}
    >
      <Tabs.Screen name="Assemblee" component={Assemblee} />
      <Tabs.Screen name="Scrutins" component={Scrutins} />
      <Tabs.Screen name="Champions" component={Champions} />
      <Tabs.Screen name="Recherche" component={Recherche} />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  demarrage: { flex: 1, justifyContent: 'center', padding: space[4], gap: space[2] },
});
