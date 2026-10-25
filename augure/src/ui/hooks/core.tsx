// Accès de l'UI au bus de commandes : `CoreProvider` le fournit, `useCommand` (alias `useRequete`)
// exécute une query et suit son état, `useEnvoi` exécute une command (signalement).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Command, CommandBus } from '@/core';
import type { SourceDonnees } from '../../di/container';

interface CoreContextValue {
  bus: CommandBus;
  /** D'où viennent les données : l'API, ou les fixtures fictives du canevas (bandeau affiché). */
  source: SourceDonnees;
}

const CoreContext = createContext<CoreContextValue | null>(null);

/** Fournit le bus (et la source des données) à l'UI. */
export function CoreProvider({ bus, source, children }: { bus: CommandBus; source: SourceDonnees; children: ReactNode }) {
  const value = useMemo(() => ({ bus, source }), [bus, source]);
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCore(): CoreContextValue {
  const c = useContext(CoreContext);
  if (!c) throw new Error('useCore hors de CoreProvider');
  return c;
}

export type Resultat<T> =
  | { statut: 'chargement'; donnees?: T }
  | { statut: 'pret'; donnees: T }
  | { statut: 'erreur'; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
        setResultat({ statut: 'erreur', message: message(e) });
      });
    return () => controleur.abort();
    // `cle` décrit entièrement la commande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, cle, essai]);

  const recharger = useCallback(() => setEssai((n) => n + 1), []);
  return { ...resultat, recharger };
}

/** Même hook, nom du plan (« useRequete ») : une query par écran. */
export const useRequete = useCommand;

export type Envoi<O> =
  | { statut: 'repos' }
  | { statut: 'envoi' }
  | { statut: 'envoye'; reponse: O }
  | { statut: 'erreur'; message: string };

/** Exécute une command à la demande (pas au rendu) : `envoyer(SignalerErreur({...}))`. */
export function useEnvoi<O>(): { etat: Envoi<O>; envoyer(command: Command<string, unknown, O>): void; reinitialiser(): void } {
  const { bus } = useCore();
  const [etat, setEtat] = useState<Envoi<O>>({ statut: 'repos' });
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  const envoyer = useCallback(
    (command: Command<string, unknown, O>) => {
      setEtat({ statut: 'envoi' });
      bus
        .execute(command)
        .then((reponse) => monte.current && setEtat({ statut: 'envoye', reponse }))
        .catch((e: unknown) => monte.current && setEtat({ statut: 'erreur', message: message(e) }));
    },
    [bus],
  );
  const reinitialiser = useCallback(() => setEtat({ statut: 'repos' }), []);
  return { etat, envoyer, reinitialiser };
}
