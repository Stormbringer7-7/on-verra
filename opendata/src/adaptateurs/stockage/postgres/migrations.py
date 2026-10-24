"""Migrations du schéma canonique : fichiers `schema_pg/NNNN_nom.sql`, appliqués une fois, dans
l'ordre, chacun dans sa transaction. Une migration déjà appliquée dont le fichier a changé est
une erreur : on ajoute une migration, on ne réécrit pas l'histoire."""

import hashlib
from pathlib import Path

SCHEMA_PG = Path(__file__).resolve().parents[3] / "schema_pg"

TABLE = """
CREATE TABLE IF NOT EXISTS public.civictrace_migration (
    version     TEXT PRIMARY KEY,
    nom         TEXT NOT NULL,
    empreinte   TEXT NOT NULL,
    appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
)"""


def fichiers(dossier: Path = SCHEMA_PG) -> list[tuple[str, Path]]:
    resultat = []
    for f in sorted(dossier.glob("*.sql")):
        version = f.name.split("_", 1)[0]
        if not version.isdigit():
            raise ValueError(f"migration mal nommée : {f.name} (attendu NNNN_nom.sql)")
        resultat.append((version, f))
    if len({v for v, _ in resultat}) != len(resultat):
        raise ValueError("deux migrations portent le même numéro")
    return resultat


def migrer(connexion, dossier: Path = SCHEMA_PG) -> list[str]:
    """Applique les migrations manquantes ; retourne les noms appliqués."""
    with connexion.transaction():
        connexion.execute(TABLE)
    deja = {v: e for v, e in connexion.execute("SELECT version, empreinte FROM public.civictrace_migration")}
    appliquees = []
    for version, f in fichiers(dossier):
        sql = f.read_text()
        empreinte = hashlib.sha256(sql.encode()).hexdigest()
        if version in deja:
            if deja[version] != empreinte:
                raise RuntimeError(f"{f.name} a changé après avoir été appliquée : ajouter une migration")
            continue
        with connexion.transaction():
            connexion.execute(sql)
            connexion.execute("INSERT INTO public.civictrace_migration (version, nom, empreinte) VALUES (%s, %s, %s)",
                              (version, f.name, empreinte))
        appliquees.append(f.name)
    return appliquees
