"""Racine de composition de l'ETL : étapes des sources et choix de l'adaptateur de l'Entrepot.

C'est le seul endroit qui assemble le chargement canonique (Postgres par défaut, mémoire pour les
essais). Ajouter une source = ajouter ses étapes à ETAPES_CANON.
"""

from pathlib import Path

from .adaptateurs.sources import an as an_canon
from .adaptateurs.sources import constit as constit_canon
from .adaptateurs.sources import hatvp as hatvp_canon
from .adaptateurs.sources import insee as insee_canon
from .adaptateurs.sources import modifications as modifications_canon
from .adaptateurs.sources import rne as rne_canon
from .adaptateurs.sources import senat as senat_canon

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
