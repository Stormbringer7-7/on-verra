import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Préférence de l'utilisateur gardée sur l'appareil (AsyncStorage ; localStorage sur le web).
 * Indisponible (navigation privée…) : la valeur reste valable le temps de la session.
 */
export function usePreference<T>(cle: string, defaut: T): [T, (valeur: T) => void] {
  const [valeur, setValeur] = useState<T>(defaut);
  useEffect(() => {
    let actif = true;
    AsyncStorage.getItem(cle)
      .then((lue) => actif && lue !== null && setValeur(JSON.parse(lue) as T))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [cle]);
  const enregistrer = useCallback(
    (v: T) => {
      setValeur(v);
      // Sans stockage : préférence de session seulement.
      AsyncStorage.setItem(cle, JSON.stringify(v)).catch(() => {});
    },
    [cle],
  );
  return [valeur, enregistrer];
}
