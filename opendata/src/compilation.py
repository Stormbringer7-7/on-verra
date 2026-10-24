"""Compilation de la base hébergée : schéma, adaptateurs de sources, transformations communes.

C'est le seul endroit qui assemble le pipeline. Ajouter une source = ajouter ses étapes à
SOURCES ; ajouter une donnée calculée = ajouter une étape à TRANSFORMATIONS.
"""

import sqlite3
from dataclasses import replace
from pathlib import Path

from .adaptateurs import an
from .etl import construire
from .transformations import classement, indicateurs

SCHEMA = Path(__file__).parent / "schema"
LEGISLATURES = an.LEGISLATURES

SOURCES = [*an.ETAPES]
# Les transformations voient toutes les sources chargées, quelle que soit leur origine.
TRANSFORMATIONS = [replace(e, apres=(*e.apres, *(s.nom for s in SOURCES)))
                   for e in [classement.ETAPE, indicateurs.ETAPE]]
ETAPES = [*SOURCES, *TRANSFORMATIONS]


def compiler(base: Path, cache: Path, legislatures: list[str] = LEGISLATURES, forcer: bool = False,
             age_max: float | None = None):
    construire(base, cache, SCHEMA, ETAPES, forcer, age_max, legislatures=legislatures)
    db = sqlite3.connect(base)
    nb_lois = db.execute("SELECT COUNT(*) FROM lois").fetchone()[0]
    nb_scrutins = db.execute("SELECT COUNT(*) FROM scrutins").fetchone()[0]
    nb_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    db.close()
    print(f"{nb_lois} lois, {nb_scrutins} scrutins, {nb_votes} votes nominatifs -> {base}")


# Modèle canonique CivicTrace : mêmes principes, mais écrit via le port `Entrepot` (Postgres par
# défaut, mémoire pour les essais). Les anciennes étapes ci-dessus alimentent encore la base
# SQLite publiée, jusqu'à la bascule de l'API.
from .adaptateurs.sources import an as an_canon  # noqa: E402
from .adaptateurs.sources import constit as constit_canon  # noqa: E402
from .adaptateurs.sources import hatvp as hatvp_canon  # noqa: E402
from .adaptateurs.sources import insee as insee_canon  # noqa: E402
from .adaptateurs.sources import modifications as modifications_canon  # noqa: E402
from .adaptateurs.sources import rne as rne_canon  # noqa: E402
from .adaptateurs.sources import senat as senat_canon  # noqa: E402

# `textes.modifications` après les textes et les amendements des deux chambres (diffs d'articles).
ETAPES_CANON = [*insee_canon.ETAPES, *an_canon.ETAPES, *senat_canon.ETAPES, *constit_canon.ETAPES, *hatvp_canon.ETAPES,
                 *rne_canon.ETAPES, modifications_canon.ETAPE]


def entrepot_canon(url: str | None):
    """Racine de composition : choisit l'adaptateur de l'Entrepot (ENTREPOT=postgres|memoire)."""
    import os
    choix = os.environ.get("ENTREPOT", "postgres")
    if choix == "memoire":
        from .adaptateurs.stockage import EntrepotMemoire
        return EntrepotMemoire()
    if choix != "postgres":
        raise SystemExit(f"ENTREPOT inconnu : {choix} (postgres ou memoire)")
    if not url:
        raise SystemExit("DATABASE_URL absente : la base canonique est en Postgres.")
    from .adaptateurs.stockage.postgres import EntrepotPostgres, connecter, migrer
    cx = connecter(url)
    for nom in migrer(cx):
        print(f"Migration appliquée : {nom}")
    return EntrepotPostgres(cx)


def compiler_canon(url: str | None, cache: Path, forcer: bool = False, age_max: float | None = None,
                   relire: bool = False, seulement: list[str] | None = None):
    """`cache` : data/brut ; chaque source a son sous-dossier (an/, senat/…). `seulement` : ces
    étapes et leurs dépendances (les dépendances sont parcourues, leurs documents inchangés sautés)."""
    from .chargement import construire as construire_canon
    etapes = ETAPES_CANON
    if seulement:
        par_nom, gardees = {e.nom: e for e in ETAPES_CANON}, set()
        a_voir = list(seulement)
        while a_voir:
            nom = a_voir.pop()
            if nom not in par_nom:
                raise SystemExit(f"Étape inconnue : {nom} ({', '.join(par_nom)})")
            if nom not in gardees:
                gardees.add(nom)
                a_voir += par_nom[nom].apres
        etapes = [e for e in ETAPES_CANON if e.nom in gardees]
    # --relire avec --etapes : seulement ces étapes ; leurs dépendances sautent l'inchangé
    relues = set(seulement) if relire and seulement else relire
    ctx = construire_canon(entrepot_canon(url), cache, etapes, forcer, age_max, relues)
    anomalies = {k: v for k, v in ctx.bilan.items() if k.startswith(("reference_inconnue", "ecartes", "orphelins"))}
    if anomalies:
        print("Références non résolues (laissées vides, jamais supposées) : "
              + ", ".join(f"{k}={v}" for k, v in sorted(anomalies.items())))
    return ctx
