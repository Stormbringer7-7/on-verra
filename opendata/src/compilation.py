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


def compiler(base: Path, cache: Path, legislatures: list[str] = LEGISLATURES, forcer: bool = False):
    construire(base, cache, SCHEMA, ETAPES, forcer, legislatures=legislatures)
    db = sqlite3.connect(base)
    nb_lois = db.execute("SELECT COUNT(*) FROM lois").fetchone()[0]
    nb_scrutins = db.execute("SELECT COUNT(*) FROM scrutins").fetchone()[0]
    nb_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    db.close()
    print(f"{nb_lois} lois, {nb_scrutins} scrutins, {nb_votes} votes nominatifs -> {base}")
