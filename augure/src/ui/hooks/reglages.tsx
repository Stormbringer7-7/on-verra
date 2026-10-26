// Réglages et suivis de l'utilisateur, gardés sur l'appareil seulement (AsyncStorage ; localStorage
// sur le web) : taille du texte, contraste renforcé, animations réduites, thème, premier lancement,
// lois et élus suivis. Rien ne part vers un serveur : « Mes suivis » envoie seulement les
// identifiants suivis à l'API, qui ne garde rien.
//
// Une seule clé de stockage (`augure.reglages.v1`) : exporter et tout effacer portent sur elle.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

export const CLE_STOCKAGE = 'augure.reglages.v1';

export type TailleTexte = 'normale' | 'grande' | 'tres_grande';
export type Theme = 'sombre' | 'clair';

/** Facteur appliqué aux tailles de texte (et à leur interligne). */
export const ECHELLES: Record<TailleTexte, number> = { normale: 1, grande: 1.15, tres_grande: 1.3 };

export interface DossierSuivi {
  id: string;
  titre: string;
}
export interface PersonneSuivie {
  id: string;
  nom: string;
}

export interface Reglages {
  taille: TailleTexte;
  contraste: boolean;
  animationsReduites: boolean;
  theme: Theme;
  /** Bienvenue déjà vue (premier lancement passé). */
  bienvenueVue: boolean;
  dossiers: DossierSuivi[];
  personnes: PersonneSuivie[];
  /** Dernière ouverture de Mes suivis (« AAAA-MM-JJ »), null avant la première. */
  vuLe: string | null;
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  taille: 'normale',
  contraste: false,
  animationsReduites: false,
  theme: 'sombre',
  bienvenueVue: false,
  dossiers: [],
  personnes: [],
  vuLe: null,
};

/** Garde des valeurs lues seulement ce qui a la bonne forme (stockage d'une autre version, modifié à la main). */
export function lireReglages(brut: unknown): Reglages {
  const r = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const liste = <T,>(v: unknown, ok: (x: Record<string, unknown>) => boolean): T[] =>
    Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && ok(x as Record<string, unknown>)) as T[]) : [];
  return {
    taille: r.taille === 'grande' || r.taille === 'tres_grande' ? r.taille : 'normale',
    contraste: r.contraste === true,
    animationsReduites: r.animationsReduites === true,
    theme: r.theme === 'clair' ? 'clair' : 'sombre',
    bienvenueVue: r.bienvenueVue === true,
    dossiers: liste<DossierSuivi>(r.dossiers, (x) => typeof x.id === 'string' && typeof x.titre === 'string'),
    personnes: liste<PersonneSuivie>(r.personnes, (x) => typeof x.id === 'string' && typeof x.nom === 'string'),
    vuLe: typeof r.vuLe === 'string' ? r.vuLe : null,
  };
}

interface ContexteReglages {
  reglages: Reglages;
  /** Les réglages ont été lus sur l'appareil (avant : valeurs par défaut). */
  charges: boolean;
  modifier(changement: Partial<Reglages>): void;
  /** Efface tout ce qui est gardé sur l'appareil : retour aux valeurs par défaut. */
  toutEffacer(): Promise<void>;
  /** Tout ce qui est gardé, en JSON lisible (« Exporter mes données »). */
  exporter(): string;
}

const Contexte = createContext<ContexteReglages>({
  reglages: REGLAGES_PAR_DEFAUT,
  charges: true,
  modifier: () => {},
  toutEffacer: async () => {},
  exporter: () => JSON.stringify(REGLAGES_PAR_DEFAUT, null, 2),
});

export function ReglagesProvider({ children, initial }: { children: ReactNode; initial?: Partial<Reglages> }) {
  const [reglages, setReglages] = useState<Reglages>({ ...REGLAGES_PAR_DEFAUT, ...initial });
  const [charges, setCharges] = useState(initial !== undefined);

  useEffect(() => {
    if (initial !== undefined) return;
    let actif = true;
    AsyncStorage.getItem(CLE_STOCKAGE)
      .then((lu) => actif && lu !== null && setReglages(lireReglages(JSON.parse(lu))))
      .catch(() => {})
      .finally(() => actif && setCharges(true));
    return () => {
      actif = false;
    };
  }, [initial]);

  const modifier = useCallback((changement: Partial<Reglages>) => {
    setReglages((avant) => {
      const apres = { ...avant, ...changement };
      // Sans stockage (navigation privée…) : réglages de session seulement.
      AsyncStorage.setItem(CLE_STOCKAGE, JSON.stringify(apres)).catch(() => {});
      return apres;
    });
  }, []);

  const toutEffacer = useCallback(async () => {
    setReglages(REGLAGES_PAR_DEFAUT);
    await AsyncStorage.removeItem(CLE_STOCKAGE).catch(() => {});
  }, []);

  const valeur = useMemo<ContexteReglages>(
    () => ({ reglages, charges, modifier, toutEffacer, exporter: () => JSON.stringify(reglages, null, 2) }),
    [reglages, charges, modifier, toutEffacer],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export const useReglages = () => useContext(Contexte);

/** Animations réduites : le réglage de l'app, ou celui du système. */
export function useAnimationsReduites(): boolean {
  const { reglages } = useReglages();
  const [systeme, setSysteme] = useState(false);
  useEffect(() => {
    let actif = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => actif && setSysteme(v))
      .catch(() => {});
    const abonnement = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setSysteme);
    return () => {
      actif = false;
      abonnement?.remove();
    };
  }, []);
  return reglages.animationsReduites || systeme;
}

/** Suivre ou ne plus suivre un dossier, une personne. */
export function useSuivis() {
  const { reglages, modifier } = useReglages();
  return useMemo(
    () => ({
      dossiers: reglages.dossiers,
      personnes: reglages.personnes,
      vuLe: reglages.vuLe,
      suitDossier: (id: string) => reglages.dossiers.some((d) => d.id === id),
      suitPersonne: (id: string) => reglages.personnes.some((p) => p.id === id),
      basculerDossier: (d: DossierSuivi) =>
        modifier({
          dossiers: reglages.dossiers.some((x) => x.id === d.id) ? reglages.dossiers.filter((x) => x.id !== d.id) : [...reglages.dossiers, d],
        }),
      basculerPersonne: (p: PersonneSuivie) =>
        modifier({
          personnes: reglages.personnes.some((x) => x.id === p.id)
            ? reglages.personnes.filter((x) => x.id !== p.id)
            : [...reglages.personnes, p],
        }),
      marquerVu: (jour: string) => modifier({ vuLe: jour }),
    }),
    [reglages.dossiers, reglages.personnes, reglages.vuLe, modifier],
  );
}
