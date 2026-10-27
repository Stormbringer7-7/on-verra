"""Base SQLite des échantillons et profil de chaque champ.

Une table par objet (et par liste de l'objet), toutes les colonnes telles que publiées ; deux
tables de description :

- `_objets` : un objet par ligne, avec sa source officielle, sa famille, son format, sa livraison
  (stock complet ou incrémental) et sa fréquence, et combien de documents ont été lus ;
- `_champs` : une colonne par ligne, avec son type observé, son remplissage, le nombre de valeurs
  distinctes, la part de la valeur la plus fréquente (similarité) et les valeurs les plus fréquentes.
"""

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

TOP = 5
LONGUEUR_VALEUR = 80

_ENTIER = re.compile(r"^-?\d+$")
_DECIMAL = re.compile(r"^-?\d+[.,]\d+$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$|^\d{2}/\d{2}/\d{4}$")
_DATEHEURE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?|^\d{2}/\d{2}/\d{4} \d{2}:\d{2}")


def type_de(v) -> str:
    """Type observé d'une valeur, y compris d'un texte qui contient un nombre, une date, un booléen."""
    if isinstance(v, bool):
        return "booléen"
    if isinstance(v, int):
        return "entier"
    if isinstance(v, float):
        return "décimal"
    if not isinstance(v, str):
        return "structure"
    t = v.strip()
    if _DATEHEURE.match(t):
        return "date et heure"
    if _DATE.match(t):
        return "date"
    if t.lower() in ("true", "false"):
        return "booléen"
    if _ENTIER.match(t):
        return "entier (texte)"
    if _DECIMAL.match(t):
        return "décimal (texte)"
    if "<" in t and ">" in t and re.search(r"</?\w+[^>]*>", t):
        return "texte HTML"
    return "texte"


def sql_valeur(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return v


def profil(lignes: list[dict], colonne: str) -> dict:
    """Profil d'une colonne : remplissage, types, distinctes, similarité, valeurs fréquentes."""
    n = len(lignes)
    valeurs = [l.get(colonne) for l in lignes]
    remplies = [v for v in valeurs if v not in (None, "")]
    comptes = Counter(json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v) for v in remplies)
    types = Counter(type_de(v) for v in remplies)
    plus = comptes.most_common(TOP)
    return {
        "n": n,
        "remplies": len(remplies),
        "remplissage": round(len(remplies) / n, 4) if n else 0,
        "types": {t: round(k / len(remplies), 4) for t, k in types.most_common()} if remplies else {},
        "distinctes": len(comptes),
        # Similarité : part de la valeur la plus fréquente parmi les valeurs remplies (1 = constante).
        "similarite": round(plus[0][1] / len(remplies), 4) if remplies else None,
        "frequentes": [{"valeur": v[:LONGUEUR_VALEUR], "part": round(k / len(remplies), 4)} for v, k in plus],
        "longueur_max": max((len(str(v)) for v in remplies), default=0),
    }


def ouvrir(chemin: Path) -> sqlite3.Connection:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    cx = sqlite3.connect(chemin)
    cx.executescript(
        """
        CREATE TABLE IF NOT EXISTS _objets (
          objet TEXT PRIMARY KEY, famille TEXT, producteur TEXT, jeu TEXT, page_officielle TEXT,
          url TEXT, licence TEXT, format TEXT, livraison TEXT, publie_le TEXT, cache_du TEXT,
          perimetre TEXT, documents_total INTEGER, documents_lus INTEGER, tables TEXT, remarque TEXT);
        CREATE TABLE IF NOT EXISTS _champs (
          objet TEXT, table_ TEXT, colonne TEXT, n INTEGER, remplies INTEGER, remplissage REAL,
          types TEXT, distinctes INTEGER, similarite REAL, frequentes TEXT, longueur_max INTEGER, PRIMARY KEY (table_, colonne));
        """)
    return cx


def ecrire(cx: sqlite3.Connection, objet: str, tables: dict[str, list[dict]]) -> None:
    """Remplace les tables de l'objet et leur profil."""
    for (ancienne,) in cx.execute("SELECT DISTINCT table_ FROM _champs WHERE objet = ?", (objet,)).fetchall():
        cx.execute(f'DROP TABLE IF EXISTS "{ancienne}"')
    cx.execute("DELETE FROM _champs WHERE objet = ?", (objet,))
    for table, lignes in tables.items():
        colonnes = list(dict.fromkeys(c for l in lignes for c in l)) or ["_id"]
        # Un conteneur vide dans certains documents (`xsi:nil`, `{}`) et rempli ailleurs : ses champs
        # sont déjà des colonnes, la colonne du conteneur seul (toujours vide) n'apporte rien.
        colonnes = [c for c in colonnes
                    if not (any(x.startswith(c + ".") for x in colonnes) and all(l.get(c) is None for l in lignes))]
        cx.execute(f'DROP TABLE IF EXISTS "{table}"')
        cx.execute(f'CREATE TABLE "{table}" ({", ".join(f"{chr(34)}{c}{chr(34)}" for c in colonnes)})')
        cx.executemany(f'INSERT INTO "{table}" VALUES ({", ".join("?" * len(colonnes))})',
                       [[sql_valeur(l.get(c)) for c in colonnes] for l in lignes])
        for c in colonnes:
            if c in ("_id", "_parent", "_rang"):
                continue
            p = profil(lignes, c)
            cx.execute("INSERT INTO _champs VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (objet, table, c, p["n"], p["remplies"], p["remplissage"], json.dumps(p["types"], ensure_ascii=False),
                        p["distinctes"], p["similarite"], json.dumps(p["frequentes"], ensure_ascii=False), p["longueur_max"]))
    cx.commit()
