"""Découpage de la base complète en une base par législature : la législature est la clé de partition.

La base complète reste la référence (import, CLI). Chaque partition a le même schéma et
ne garde que ce qui concerne sa législature : les applications ne téléchargent que celles qu'elles
consultent, et une nouvelle donnée ne republie que la législature en cours.
"""

import sqlite3
from pathlib import Path

from .etl.pipeline import creer_schema

# Lignes d'une table qui appartiennent à la partition, lues dans la base complète attachée sous "src".
# Paramètres : :leg, et :debut / :fin, bornes des mandats de la législature.
FILTRES = {
    "groupes": "legislature = :leg",
    "mandats": "legislature = :leg",
    "deputes": "acteur_ref IN (SELECT acteur_ref FROM src.mandats WHERE legislature = :leg)",
    "appartenances": "groupe_ref IN (SELECT organe_ref FROM src.groupes WHERE legislature = :leg)",
    "scrutins": "legislature = :leg",
    "votes": "scrutin_uid IN (SELECT uid FROM src.scrutins WHERE legislature = :leg)",
    "positions_groupes": "scrutin_uid IN (SELECT uid FROM src.scrutins WHERE legislature = :leg)",
    "mises_au_point": "scrutin_uid IN (SELECT uid FROM src.scrutins WHERE legislature = :leg)",
    "motions_censure": "legislature = :leg",
    "votes_censure": "scrutin_uid IN (SELECT scrutin_uid FROM src.motions_censure WHERE legislature = :leg)",
    # Une loi peut être déposée sous une législature et votée sous la suivante : elle va dans les deux.
    "lois": """legislature = :leg
               OR id IN (SELECT loi_id FROM src.scrutins WHERE legislature = :leg)
               OR id IN (SELECT loi_id FROM src.motions_censure WHERE legislature = :leg)""",
    "engagements_49_3": "date BETWEEN :debut AND :fin",
    "indicateurs_deputes": "legislature = :leg",
    "activite_deputes": "legislature = :leg",
}


def partitionner(base: Path, legislature: str, cible: Path, schema: Path) -> Path:
    cible.parent.mkdir(parents=True, exist_ok=True)
    temporaire = cible.with_name(cible.name + ".construction")
    temporaire.unlink(missing_ok=True)
    db = sqlite3.connect(temporaire)
    try:
        creer_schema(db, schema)
        db.execute("ATTACH DATABASE ? AS src", (f"{base.as_uri()}?mode=ro",))
        tables = [r[0] for r in db.execute(
            "SELECT name FROM src.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'meta'")]
        sans_filtre = set(tables) - set(FILTRES)
        if sans_filtre:
            raise ValueError(f"tables sans règle de partition (partition.FILTRES) : {sorted(sans_filtre)}")
        debut, fin = db.execute("SELECT MIN(date_debut), MAX(COALESCE(date_fin, '9999-12-31')) "
                                "FROM src.mandats WHERE legislature = ?", (legislature,)).fetchone()
        if debut is None:
            raise ValueError(f"aucun mandat pour la {legislature}e législature")
        params = {"leg": legislature, "debut": debut, "fin": fin}
        with db:
            for table in tables:
                db.execute(f"INSERT INTO main.{table} SELECT * FROM src.{table} WHERE {FILTRES[table]}", params)
        db.execute("DETACH DATABASE src")
        db.execute("VACUUM")
    finally:
        db.close()
    temporaire.replace(cible)
    return cible
