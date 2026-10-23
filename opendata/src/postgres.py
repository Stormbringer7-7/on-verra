"""Chargement de la publication dans Postgres, lue par l'API : un schéma par législature (« l17 »).

Source : <publication>/<leg>/courante.db, la base de la version publiée. Une législature n'est
rechargée que si sa version publiée a changé (ou si son schéma manque). Le chargement se fait dans
un schéma temporaire, échangé en une transaction : l'API ne voit jamais de données à moitié chargées.

La table public.legislatures sert d'index à l'API (dates, nombre de scrutins, version, nouveautés).
"""

import json
import sqlite3
from pathlib import Path

import psycopg

TYPES = {"INTEGER": "bigint", "REAL": "double precision", "TEXT": "text", "BLOB": "bytea"}

INDEX = """
CREATE TABLE IF NOT EXISTS legislatures (
    legislature TEXT PRIMARY KEY,
    debut       TEXT NOT NULL,
    fin         TEXT NOT NULL,
    scrutins    INTEGER NOT NULL,
    version     INTEGER NOT NULL,
    date        TEXT NOT NULL,
    schema      TEXT NOT NULL,
    sha256      TEXT NOT NULL,       -- base publiée chargée : rechargée quand elle change
    nouveautes  JSONB NOT NULL,
    charge_le   TIMESTAMPTZ NOT NULL DEFAULT now()
)"""


def type_pg(declare: str) -> str:
    return TYPES.get(declare.upper().split("(")[0].strip(), "text")


def creer_tables(src: sqlite3.Connection, pg: psycopg.Connection, schema: str) -> list[str]:
    tables = [n for (n,) in src.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    for t in tables:
        colonnes = src.execute(f'PRAGMA table_info("{t}")').fetchall()   # cid, nom, type, notnull, défaut, pk
        defs = [f'"{c[1]}" {type_pg(c[2])}{" NOT NULL" if c[3] else ""}' for c in colonnes]
        cle = [c[1] for c in sorted(colonnes, key=lambda c: c[5]) if c[5]]
        if cle:
            defs.append("PRIMARY KEY (" + ", ".join(f'"{c}"' for c in cle) + ")")
        pg.execute(f'CREATE TABLE "{schema}"."{t}" ({", ".join(defs)})')
    return tables


def copier(src: sqlite3.Connection, pg: psycopg.Connection, schema: str, table: str) -> int:
    colonnes = [c[1] for c in src.execute(f'PRAGMA table_info("{table}")')]
    liste = ", ".join(f'"{c}"' for c in colonnes)
    n = 0
    with pg.cursor().copy(f'COPY "{schema}"."{table}" ({liste}) FROM STDIN') as copie:
        for ligne in src.execute(f'SELECT {liste} FROM "{table}"'):
            copie.write_row(ligne)
            n += 1
    return n


def charger_legislature(url: str, legislature: str, base: Path, entree: dict, manifeste: dict):
    schema, temporaire = f"l{legislature}", f"l{legislature}_chargement"
    src = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
    with psycopg.connect(url) as pg:
        pg.execute(f'DROP SCHEMA IF EXISTS "{temporaire}" CASCADE')
        pg.execute(f'CREATE SCHEMA "{temporaire}"')
        lignes = sum(copier(src, pg, temporaire, t) for t in creer_tables(src, pg, temporaire))
        # Index et vues après les données (plus rapide) ; leur SQL est commun à SQLite et Postgres.
        pg.execute(f'SET search_path TO "{temporaire}"')
        for (sql,) in src.execute("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL"):
            pg.execute(sql)
        for (sql,) in src.execute("SELECT sql FROM sqlite_master WHERE type = 'view' ORDER BY name"):
            pg.execute(sql)
        pg.execute("SET search_path TO public")
        for (t,) in pg.execute("SELECT tablename FROM pg_tables WHERE schemaname = %s", (temporaire,)).fetchall():
            pg.execute(f'ANALYZE "{temporaire}"."{t}"')
        # Échange : l'ancienne version disparaît dans la même transaction.
        pg.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        pg.execute(f'ALTER SCHEMA "{temporaire}" RENAME TO "{schema}"')
        pg.execute(INDEX)
        pg.execute("""
            INSERT INTO legislatures (legislature, debut, fin, scrutins, version, date, schema, sha256, nouveautes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (legislature) DO UPDATE SET
              debut = EXCLUDED.debut, fin = EXCLUDED.fin, scrutins = EXCLUDED.scrutins,
              version = EXCLUDED.version, date = EXCLUDED.date, schema = EXCLUDED.schema,
              sha256 = EXCLUDED.sha256, nouveautes = EXCLUDED.nouveautes, charge_le = now()""",
            (legislature, entree["debut"], entree["fin"], entree["scrutins"], manifeste["version"],
             manifeste["date"], manifeste["schema"], manifeste["base"]["sha256"],
             json.dumps(manifeste.get("nouveautes", []), ensure_ascii=False)))
    src.close()
    print(f"{legislature}e législature : v{manifeste['version']}, {lignes} lignes -> Postgres « {schema} »")


def charger(url: str, publication: Path, forcer: bool = False):
    index = json.loads((publication / "index.json").read_text())
    with psycopg.connect(url) as pg:
        pg.execute(INDEX)
        charges = dict(pg.execute(
            "SELECT legislature, sha256 FROM legislatures l WHERE EXISTS "
            "(SELECT 1 FROM pg_namespace WHERE nspname = 'l' || l.legislature)").fetchall())
    for entree in index["legislatures"]:
        leg = entree["legislature"]
        manifeste = json.loads((publication / leg / "manifest.json").read_text())
        if not forcer and charges.get(leg) == manifeste["base"]["sha256"]:
            print(f"{leg}e législature : v{manifeste['version']} déjà dans Postgres")
            continue
        charger_legislature(url, leg, publication / leg / "courante.db", entree, manifeste)
