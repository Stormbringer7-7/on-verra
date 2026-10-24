// Racine de l'app : polices, thème, bus de commandes (EXPO_PUBLIC_SOURCE), navigateurs.
// Une pile (`Pages` de navigation.ts) dont la première page porte les 5 onglets ; chaque fiche
// s'empile au-dessus. Onglets en bas en portrait, en en-tête en paysage et sur grand écran.

import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansCondensed_400Regular,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-condensed';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createContainer } from './di/container';
import { liens, type Onglets, type Pages } from './navigation';
import { LIBELLES_PAGES, ONGLETS, type Page } from './ui/ariane';
import { Navigation, NOM_APP } from './ui/components/Ecran';
import { FiletErreurs } from './ui/components/FiletErreurs';
import { Accueil } from './ui/ecrans/Accueil';
import { Amendement } from './ui/ecrans/Amendement';
import { Article } from './ui/ecrans/Article';
import { Discussions } from './ui/ecrans/Discussions';
import { Dossier } from './ui/ecrans/Dossier';
import { Dossiers } from './ui/ecrans/Dossiers';
import { Etape } from './ui/ecrans/Etape';
import { Institution } from './ui/ecrans/Institution';
import { Institutions } from './ui/ecrans/Institutions';
import { Personne } from './ui/ecrans/Personne';
import { Personnes } from './ui/ecrans/Personnes';
import { PourquoiVote } from './ui/ecrans/PourquoiVote';
import { Recherche } from './ui/ecrans/Recherche';
import { Representant } from './ui/ecrans/Representant';
import { Scrutin } from './ui/ecrans/Scrutin';
import { ArianeProvider, useTitres } from './ui/hooks/ariane';
import { CoreProvider } from './ui/hooks/core';
import { useLarge } from './ui/hooks/miseEnPage';
import { ThemeProvider, usePalette } from './ui/theme/ThemeProvider';

const Pile = createNativeStackNavigator<Pages>();
const Tabs = createBottomTabNavigator<Onglets>();

/** Fiches empilées au-dessus des onglets, dans l'ordre de navigation.ts. */
const FICHES: Record<Page, ComponentType> = {
  Dossier,
  Etape,
  Discussions,
  Article,
  Amendement,
  Scrutin,
  PourquoiVote,
  Personne,
  Institution,
  Representant,
};

/** Un lien profond vers une fiche garde les onglets en dessous : le retour y mène. */
const liensAvecOnglets: LinkingOptions<Pages> = {
  ...liens,
  config: { ...liens.config!, initialRouteName: 'Onglets', screens: liens.config!.screens },
};

export default function App() {
  return (
    <FiletErreurs>
      <Application />
    </FiletErreurs>
  );
}

function Application() {
  // Configuration invalide (EXPO_PUBLIC_SOURCE, adresse de l'API) : levée ici, montrée par le filet.
  const [{ bus, source }] = useState(() => createContainer());
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
        <CoreProvider bus={bus} source={source}>
          <ArianeProvider>{polices || erreurPolices ? <Navigateurs /> : <Fond />}</ArianeProvider>
        </CoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Fond() {
  return <View style={{ flex: 1, backgroundColor: usePalette().surface }} />;
}

function Navigateurs() {
  const p = usePalette();
  const titres = useTitres();
  const theme: Theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: p.surface, card: p.surfaceRaised } };
  return (
    <NavigationContainer
      theme={theme}
      linking={liensAvecOnglets}
      documentTitle={{
        // Titre de la fenêtre web : celui que l'écran a donné, sinon le nom de la page ou de l'onglet.
        formatter: (_options, route) => {
          if (!route) return NOM_APP;
          const libelle = titres[route.key] ?? LIBELLES_PAGES[route.name as Page] ?? ONGLETS.find((o) => o.cle === route.name)?.libelle;
          return libelle ? `${libelle} · ${NOM_APP}` : NOM_APP;
        },
      }}
    >
      <Pile.Navigator initialRouteName="Onglets" screenOptions={{ headerShown: false }}>
        <Pile.Screen name="Onglets" component={OngletsPrincipaux} />
        {(Object.keys(FICHES) as Page[]).map((nom) => (
          <Pile.Screen key={nom} name={nom} component={FICHES[nom]} />
        ))}
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
        <Navigation active={state.routes[state.index].name as keyof Onglets} onNavigate={(onglet) => navigation.navigate(onglet)} />
      )}
    >
      <Tabs.Screen name="Accueil" component={Accueil} />
      <Tabs.Screen name="Dossiers" component={Dossiers} />
      <Tabs.Screen name="Personnes" component={Personnes} />
      <Tabs.Screen name="Institutions" component={Institutions} />
      <Tabs.Screen name="Recherche" component={Recherche} />
    </Tabs.Navigator>
  );
}
