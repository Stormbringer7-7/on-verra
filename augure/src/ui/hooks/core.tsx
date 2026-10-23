import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Synchroniser, type Command, type CommandBus, type EtatBase } from '@/core';

type Demarrage =
  | { statut: 'chargement' }
  | { statut: 'pret'; base: EtatBase }
  | { statut: 'erreur'; message: string };

interface CoreContextValue {
  bus: CommandBus;
  demarrage: Demarrage;
  synchroniser(): void;
}

const CoreContext = createContext<CoreContextValue | null>(null);

/** Fournit le bus à l'UI et ouvre/met à jour la base au démarrage. */
export function CoreProvider({ bus, children }: { bus: CommandBus; children: ReactNode }) {
  const [demarrage, setDemarrage] = useState<Demarrage>({ statut: 'chargement' });

  const lancer = useCallback(() => {
    bus
      .execute(Synchroniser({}))
      .then((base) => setDemarrage({ statut: 'pret', base }))
      .catch((e: unknown) => setDemarrage({ statut: 'erreur', message: e instanceof Error ? e.message : String(e) }));
  }, [bus]);

  useEffect(lancer, [lancer]);

  const synchroniser = useCallback(() => {
    setDemarrage({ statut: 'chargement' });
    lancer();
  }, [lancer]);

  const value = useMemo(() => ({ bus, demarrage, synchroniser }), [bus, demarrage, synchroniser]);
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCore(): CoreContextValue {
  const c = useContext(CoreContext);
  if (!c) throw new Error('useCore hors de CoreProvider');
  return c;
}

/** Base prête (écrans affichés après le démarrage uniquement). */
export function useBase(): EtatBase {
  const { demarrage } = useCore();
  if (demarrage.statut !== 'pret') throw new Error('Base pas encore ouverte');
  return demarrage.base;
}

export type Resultat<T> =
  | { statut: 'chargement'; donnees?: T }
  | { statut: 'pret'; donnees: T }
  | { statut: 'erreur'; message: string };

/**
 * Exécute une query du bus et suit son état. La query est relancée quand son contenu change
 * (comparé en JSON) et abandonnée si l'écran est quitté avant la réponse.
 * `null` : rien à exécuter pour l'instant.
 */
export function useCommand<O>(command: Command<string, unknown, O> | null): Resultat<O> & { recharger(): void } {
  const { bus } = useCore();
  const cle = command ? JSON.stringify(command) : null;
  const [essai, setEssai] = useState(0);
  const [resultat, setResultat] = useState<Resultat<O>>({ statut: 'chargement' });

  // Nouvelle commande : repasse en chargement pendant le rendu (en gardant les données précédentes).
  const execution = `${cle}#${essai}`;
  const [executionAffichee, setExecutionAffichee] = useState(execution);
  if (executionAffichee !== execution) {
    setExecutionAffichee(execution);
    setResultat((r) => ({ statut: 'chargement', donnees: r.statut === 'erreur' ? undefined : r.donnees }));
  }

  useEffect(() => {
    if (!command) return;
    const controleur = new AbortController();
    bus
      .execute(command, { signal: controleur.signal })
      .then((donnees) => controleur.signal.aborted || setResultat({ statut: 'pret', donnees }))
      .catch((e: unknown) => {
        if (controleur.signal.aborted) return;
        setResultat({ statut: 'erreur', message: e instanceof Error ? e.message : String(e) });
      });
    return () => controleur.abort();
    // `cle` décrit entièrement la commande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, cle, essai]);

  const recharger = useCallback(() => setEssai((n) => n + 1), []);
  return { ...resultat, recharger };
}
