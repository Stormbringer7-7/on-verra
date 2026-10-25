// Racine de l'app : polices, thème, bus de commandes (EXPO_PUBLIC_SOURCE), navigateurs.
// Une pile (`Pages` de navigation.ts) dont la première page porte les 5 onglets ; chaque fiche
// s'empile au-dessus. Onglets en bas en portrait, en en-tête en paysage et sur grand écran.

import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  IBMPlexSansCondensed_400Regular,
  IBMPlexSansCondensed_500Medium,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-condensed";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme,
  NavigationContainer,
  StackActions,
  useNavigation,
  type LinkingOptions,
  type Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import monoRegulier from '../assets/polices/IBMPlexMono_400Regular.woff2';
import monoMoyen from '../assets/polices/IBMPlexMono_500Medium.woff2';
import sansRegulier from '../assets/polices/IBMPlexSansCondensed_400Regular.woff2';
import sansMoyen from '../assets/polices/IBMPlexSansCondensed_500Medium.woff2';
import sansDemiGras from '../assets/polices/IBMPlexSansCondensed_600SemiBold.woff2';
import sansGras from '../assets/polices/IBMPlexSansCondensed_700Bold.woff2';
import { createContainer } from './di/container';
import { liens, type Onglets, type Pages } from './navigation';
import { LIBELLES_PAGES, ONGLETS, type Page } from './ui/ariane';
import { Navigation, NOM_APP } from './ui/components/Ecran';
import { FiletErreurs } from './ui/components/FiletErreurs';
import { Ouverture } from './ui/components/Ouverture';
import { Accueil } from './ui/ecrans/Accueil';
import { Amendement } from './ui/ecrans/Amendement';
import { Article } from './ui/ecrans/Article';
import { Carte } from './ui/ecrans/Carte';
import { Chiffres } from './ui/ecrans/Chiffres';
import { Guide } from './ui/ecrans/Guide';
import { Textes } from './ui/ecrans/Textes';
import { Discussions } from './ui/ecrans/Discussions';
import { Dossier } from './ui/ecrans/Dossier';
import { Dossiers } from './ui/ecrans/Dossiers';
import { Etape } from './ui/ecrans/Etape';
import { Explorer } from './ui/ecrans/Explorer';
import { Institution } from './ui/ecrans/Institution';
import { Institutions } from './ui/ecrans/Institutions';
import { Personne } from './ui/ecrans/Personne';
import { Personnes } from './ui/ecrans/Personnes';
import { PourquoiVote } from './ui/ecrans/PourquoiVote';
import { Recherche } from './ui/ecrans/Recherche';
import { Departement } from './ui/ecrans/Departement';
import { Representant } from './ui/ecrans/Representant';
import { Scrutin } from './ui/ecrans/Scrutin';
import { ArianeProvider, useTitres } from './ui/hooks/ariane';
import { CoreProvider } from './ui/hooks/core';
import { useLarge } from './ui/hooks/miseEnPage';
import { ThemeProvider, usePalette } from './ui/theme/ThemeProvider';
import { Bienvenue } from './ui/ecrans/Bienvenue';
import { Methode } from './ui/ecrans/Methode';
import { Reglages } from './ui/ecrans/Reglages';
import { Suivis } from './ui/ecrans/Suivis';
import { ReglagesProvider, useReglages } from './ui/hooks/reglages';

const POLICES_NATIVES = {
  IBMPlexSansCondensed_400Regular,
  IBMPlexSansCondensed_500Medium,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
};

/** Mêmes polices en woff2, réduites aux caractères latins, ponctuation, flèches et symboles
 * (scripts/polices-web.sh) : ≈ 140 Ko au lieu de ≈ 650 Ko. Glyphe absent : police du système. */
const POLICES_WEB: Record<keyof typeof POLICES_NATIVES, number> = {
  IBMPlexSansCondensed_400Regular: sansRegulier,
  IBMPlexSansCondensed_500Medium: sansMoyen,
  IBMPlexSansCondensed_600SemiBold: sansDemiGras,
  IBMPlexSansCondensed_700Bold: sansGras,
  IBMPlexMono_400Regular: monoRegulier,
  IBMPlexMono_500Medium: monoMoyen,
};

// Le splash natif (logo au repos) reste affiché jusqu'à ce que l'Ouverture animée prenne le relais.
SplashScreen.preventAutoHideAsync().catch(() => {});

const Pile = createNativeStackNavigator<Pages>();
const Tabs = createBottomTabNavigator<Onglets>();

/** Fiches empilées au-dessus des onglets, dans l'ordre de navigation.ts. */
const FICHES: Record<Page, ComponentType> = {
  Dossiers,
  Personnes,
  Institutions,
  Textes,
  Explorer,
  Suivis,
  Reglages,
  Methode,
  Bienvenue,
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
  Departement,
};

/** Un lien profond vers une fiche garde les onglets en dessous : le retour y mène. */
const liensAvecOnglets: LinkingOptions<Pages> = {
  ...liens,
  config: {
    ...liens.config!,
    initialRouteName: "Onglets",
    screens: liens.config!.screens,
  },
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
  // Sur le web, on ne les attend pas : le navigateur les substitue à leur arrivée (≈ 2 s gagnées
  // en 4G lente) ; en natif, un nom de police non chargé n'est pas permis.
  const [polices, erreurPolices] = useFonts(
    Platform.OS === "web" ? POLICES_WEB : POLICES_NATIVES,
  );
  const pret = polices || erreurPolices || Platform.OS === "web";
  const [ouvert, setOuvert] = useState(false);
  const terminer = useCallback(() => setOuvert(true), []);

  return (
    <SafeAreaProvider>
      <ReglagesProvider>
        <ThemeProvider>
          <BarreEtat />
          <CoreProvider bus={bus} source={source}>
            <ArianeProvider>
              <View style={{ flex: 1 }}>
                {pret ? <Navigateurs /> : <Fond />}
                {pret && !ouvert && (
                  <Ouverture onPret={SplashScreen.hide} onTerminee={terminer} />
                )}
              </View>
            </ArianeProvider>
          </CoreProvider>
        </ThemeProvider>
      </ReglagesProvider>
    </SafeAreaProvider>
  );
}

/** Barre d'état du système : claire sur le thème sombre, sombre sur le thème clair. */
function BarreEtat() {
  return (
    <StatusBar
      style={useReglages().reglages.theme === "clair" ? "dark" : "light"}
    />
  );
}

function Fond() {
  return <View style={{ flex: 1, backgroundColor: usePalette().surface }} />;
}

function Navigateurs() {
  const p = usePalette();
  const titres = useTitres();
  const { reglages } = useReglages();
  const theme: Theme = {
    ...DarkTheme,
    dark: reglages.theme !== "clair",
    colors: {
      ...DarkTheme.colors,
      background: p.surface,
      card: p.surfaceRaised,
      text: p.ink,
      border: p.line,
    },
  };
  return (
    <NavigationContainer
      theme={theme}
      linking={liensAvecOnglets}
      documentTitle={{
        // Titre de la fenêtre web : celui que l'écran a donné, sinon le nom de la page ou de l'onglet.
        formatter: (_options, route) => {
          if (!route) return NOM_APP;
          const libelle =
            titres[route.key] ??
            LIBELLES_PAGES[route.name as Page] ??
            ONGLETS.find((o) => o.cle === route.name)?.libelle;
          return libelle ? `${libelle} · ${NOM_APP}` : NOM_APP;
        },
      }}
    >
      <Pile.Navigator
        initialRouteName="Onglets"
        screenOptions={{ headerShown: false }}
      >
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
  const { reglages, charges } = useReglages();
  const navigation = useNavigation();
  // Premier lancement : Bienvenue, une fois les réglages lus (sinon on la montrerait à chaque fois).
  useEffect(() => {
    if (charges && !reglages.bienvenueVue)
      navigation.dispatch(StackActions.push("Bienvenue"));
  }, [charges, reglages.bienvenueVue, navigation]);
  return (
    <Tabs.Navigator
      // Mise en page large : la navigation devient un en-tête.
      screenOptions={{
        headerShown: false,
        tabBarPosition: large ? "top" : "bottom",
      }}
      tabBar={({ state, navigation }) => (
        <Navigation
          active={state.routes[state.index].name as keyof Onglets}
          onNavigate={(onglet) => navigation.navigate(onglet)}
        />
      )}
    >
      <Tabs.Screen name="Accueil" component={Accueil} />
      <Tabs.Screen name="Chiffres" component={Chiffres} />
      <Tabs.Screen name="Carte" component={Carte} />
      <Tabs.Screen name="Recherche" component={Recherche} />
      <Tabs.Screen name="Guide" component={Guide} />
    </Tabs.Navigator>
  );
}
