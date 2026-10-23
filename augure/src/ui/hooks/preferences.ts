import { useCallback, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';

/**
 * Préférence de l'utilisateur gardée sur l'appareil (stockage clé-valeur d'expo-sqlite).
 * Indisponible (navigation privée…) : la valeur reste valable le temps de la session.
 */
export function usePreference<T>(cle: string, defaut: T): [T, (valeur: T) => void] {
  const [valeur, setValeur] = useState<T>(() => {
    try {
      const lue = Storage.getItemSync(cle);
      return lue === null ? defaut : (JSON.parse(lue) as T);
    } catch {
      return defaut;
    }
  });
  const enregistrer = useCallback(
    (v: T) => {
      setValeur(v);
      try {
        Storage.setItemSync(cle, JSON.stringify(v));
      } catch {
        // Sans stockage : préférence de session seulement.
      }
    },
    [cle],
  );
  return [valeur, enregistrer];
}
