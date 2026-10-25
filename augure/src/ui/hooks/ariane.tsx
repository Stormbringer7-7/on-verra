// Titres des pages empilées, pour le fil d'Ariane : chaque écran donne le sien (`<Ecran titre>`),
// gardé par clé de route tant que la page est dans la pile.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ArianeContextValue {
  titres: Record<string, string | undefined>;
  definir(cle: string, titre: string | undefined): void;
}

const ArianeContext = createContext<ArianeContextValue>({ titres: {}, definir: () => {} });

export function ArianeProvider({ children }: { children: ReactNode }) {
  const [titres, setTitres] = useState<Record<string, string | undefined>>({});
  const definir = useCallback(
    (cle: string, titre: string | undefined) =>
      setTitres((t) => {
        if (t[cle] === titre) return t;
        const suivant = { ...t };
        if (titre === undefined) delete suivant[cle];
        else suivant[cle] = titre;
        return suivant;
      }),
    [],
  );
  const value = useMemo(() => ({ titres, definir }), [titres, definir]);
  return <ArianeContext.Provider value={value}>{children}</ArianeContext.Provider>;
}

export const useTitres = () => useContext(ArianeContext).titres;

/** Donne le titre de la page `cle` au fil d'Ariane (retiré quand l'écran est quitté). */
export function useTitrePage(cle: string, titre: string | undefined) {
  const { definir } = useContext(ArianeContext);
  useEffect(() => {
    definir(cle, titre);
  }, [cle, titre, definir]);
  useEffect(() => () => definir(cle, undefined), [cle, definir]);
}
