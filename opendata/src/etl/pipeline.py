"""Orchestration : étapes ordonnées par dépendances, extraction puis transformation et chargement.

Une étape déclare les fichiers bruts qu'elle lit (`sources`) et ce qu'elle fait de la base
(`executer`). Toutes les sources sont téléchargées avant de toucher à la base ; la base est
construite à côté de la cible et ne la remplace qu'une fois complète.
"""

import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .chargeur import Chargeur
from .sources import Fichier


@dataclass
class Contexte:
    db: sqlite3.Connection
    chargeur: Chargeur
    fichiers: dict[str, Path]              # nom de fichier brut -> chemin dans le cache
    parametres: dict                       # ex. {"legislatures": ["15", "16", "17"]}
    artefacts: dict[str, Any] = field(default_factory=dict)  # résultats partagés entre étapes

    def fichier(self, nom: str) -> Path:
        return self.fichiers[nom]


@dataclass(frozen=True)
class Etape:
    nom: str                               # préfixé par l'adaptateur, ex. "an.scrutins"
    executer: Callable[[Contexte], None]
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


def creer_schema(db: sqlite3.Connection, dossier: Path):
    """Fichiers .sql du dossier, dans l'ordre de leur nom (10_…, 20_…) : tables puis vues."""
    for f in sorted(dossier.glob("*.sql")):
        db.executescript(f.read_text())


def construire(base: Path, cache: Path, schema: Path, etapes: list[Etape],
               forcer: bool = False, **parametres) -> Contexte:
    ordre = ordonner(etapes)
    fichiers = {f.nom: f.recuperer(cache, forcer) for e in ordre for f in e.sources(parametres)}

    base.parent.mkdir(parents=True, exist_ok=True)
    temporaire = base.with_name(base.name + ".construction")
    temporaire.unlink(missing_ok=True)
    db = sqlite3.connect(temporaire)
    try:
        creer_schema(db, schema)
        ctx = Contexte(db, Chargeur(db), fichiers, parametres)
        with db:
            for e in ordre:
                debut, avant = time.monotonic(), sum(ctx.chargeur.ecrites.values())
                e.executer(ctx)
                lignes = sum(ctx.chargeur.ecrites.values()) - avant
                print(f"[{e.nom}] {time.monotonic() - debut:.1f} s" + (f", {lignes} lignes" if lignes else ""))
    finally:
        db.close()
    temporaire.replace(base)
    return ctx
