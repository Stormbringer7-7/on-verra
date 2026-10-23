"""Chargement : écrit des lignes nommées dans les tables, colonnes vérifiées contre le schéma.

Les adaptateurs produisent des `Ligne` (table + dict colonne -> valeur) sans écrire de SQL :
ajouter une colonne au schéma ne casse aucun INSERT, et une colonne inconnue est une erreur
immédiate plutôt qu'une donnée perdue.
"""

import sqlite3
from collections import Counter
from dataclasses import dataclass
from typing import Iterable

CONFLITS = {"remplacer": "INSERT OR REPLACE", "ignorer": "INSERT OR IGNORE", "inserer": "INSERT"}


@dataclass(frozen=True)
class Ligne:
    table: str
    valeurs: dict
    conflit: str = "remplacer"             # remplacer | ignorer (garde la première) | inserer (sans clé)


class Chargeur:
    def __init__(self, db: sqlite3.Connection):
        self.db = db
        self.ecrites = Counter()           # lignes écrites par table, pour le bilan
        self._colonnes: dict[str, set[str]] = {}

    def colonnes(self, table: str) -> set[str]:
        if table not in self._colonnes:
            infos = self.db.execute(f"PRAGMA table_info({table})").fetchall()
            if not infos:
                raise KeyError(f"table inconnue du schéma : {table}")
            self._colonnes[table] = {c[1] for c in infos}
        return self._colonnes[table]

    def ecrire(self, ligne: Ligne) -> int:
        """Écrit une ligne ; retourne son rowid (utile pour les clés auto-incrémentées)."""
        inconnues = set(ligne.valeurs) - self.colonnes(ligne.table)
        if inconnues:
            raise KeyError(f"{ligne.table} : colonnes inconnues {sorted(inconnues)}")
        noms = ", ".join(ligne.valeurs)
        marques = ", ".join("?" * len(ligne.valeurs))
        cur = self.db.execute(f"{CONFLITS[ligne.conflit]} INTO {ligne.table} ({noms}) VALUES ({marques})",
                              tuple(ligne.valeurs.values()))
        self.ecrites[ligne.table] += 1
        return cur.lastrowid

    def ecrire_tout(self, lignes: Iterable[Ligne]):
        for ligne in lignes:
            self.ecrire(ligne)
