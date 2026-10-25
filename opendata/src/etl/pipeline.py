"""Orchestration : étapes ordonnées par dépendances.

Une étape déclare les fichiers bruts qu'elle lit (`sources`) et ce qu'elle en fait (`executer`,
appelé avec le contexte du chargement canonique, cf. chargement.py).
"""

from dataclasses import dataclass
from typing import Any, Callable, Iterable

from .sources import Fichier


@dataclass(frozen=True)
class Etape:
    nom: str                               # préfixé par l'adaptateur, ex. "an.scrutins"
    executer: Callable[[Any], None]
    apres: tuple[str, ...] = ()            # étapes à exécuter avant celle-ci
    sources: Callable[[dict], Iterable[Fichier]] = lambda parametres: ()
    description: str = ""


def ordonner(etapes: list[Etape]) -> list[Etape]:
    """Ordre d'exécution : dépendances d'abord, ordre de déclaration sinon."""
    par_nom = {e.nom: e for e in etapes}
    if len(par_nom) != len(etapes):
        raise ValueError("deux étapes portent le même nom")
    ordre, en_cours = [], set()

    def visiter(e: Etape):
        if any(f.nom == e.nom for f in ordre):
            return
        if e.nom in en_cours:
            raise ValueError(f"dépendance circulaire autour de {e.nom}")
        en_cours.add(e.nom)
        for nom in e.apres:
            if nom not in par_nom:
                raise ValueError(f"{e.nom} dépend de {nom}, étape absente")
            visiter(par_nom[nom])
        en_cours.discard(e.nom)
        ordre.append(e)

    for e in etapes:
        visiter(e)
    return ordre
