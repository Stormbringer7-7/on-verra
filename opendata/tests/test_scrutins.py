"""Nature des scrutins et découpage de la base par législature.

python3 -m unittest discover tests
"""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from src import compilation
from src.adaptateurs.an.scrutins import nature
from src.etl import construire
from src.partition import FILTRES, partitionner


class Nature(unittest.TestCase):
    def test_votes_finaux(self):
        self.assertEqual(nature("l'ensemble du projet de loi de finances pour 2025 (lecture définitive)."), "ensemble")
        self.assertEqual(nature("l'article unique de la proposition de loi visant à …"), "article_unique")

    def test_autres_scrutins(self):
        self.assertEqual(nature("l'amendement n° 15 de M. Rancoule à l'article premier de la proposition de loi …"),
                         "amendement")
        self.assertEqual(nature("le sous-amendement n° 3 de Mme X à l'amendement n° 12 …"), "amendement")
        self.assertEqual(nature("les amendements identiques n° 12 et 40 …"), "amendement")
        self.assertEqual(nature("l'article 22 (examen prioritaire) du projet de loi …"), "article")
        self.assertEqual(nature("la motion de rejet préalable, déposée par Mme Panot, du projet de loi …"), "motion")
        self.assertEqual(nature("la première partie du projet de loi de finances pour 2026 (première lecture)."),
                         "autre")

    def test_resolution_pas_finale(self):
        self.assertEqual(nature("l'article unique de la proposition de résolution européenne …"), "article")
        self.assertEqual(nature("l'ensemble de la proposition de résolution …"), "autre")

    def test_apostrophe_typographique(self):
        self.assertEqual(nature("l’amendement n° 4 …"), "amendement")


class Partition(unittest.TestCase):
    def test_chaque_table_a_une_regle(self):
        """Une table ajoutée au schéma sans règle de partition serait perdue : on l'exige."""
        db = sqlite3.connect(":memory:")
        for f in sorted(compilation.SCHEMA.glob("*.sql")):
            db.executescript(f.read_text())
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertEqual(tables - set(FILTRES), set())

    def test_ne_garde_que_sa_legislature(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "complete.db"
            construire(base, Path(d), compilation.SCHEMA, [])
            db = sqlite3.connect(base)
            db.executescript("""
                INSERT INTO deputes (acteur_ref, prenom, nom) VALUES ('PA1', 'A', 'Un'), ('PA2', 'B', 'Deux');
                INSERT INTO mandats VALUES ('M1', 'PA1', '16', '2022-06-22', '2024-06-09', NULL),
                                           ('M2', 'PA2', '17', '2024-07-18', NULL, NULL);
                INSERT INTO groupes VALUES ('G16', 'Groupe', 'G', '16', NULL), ('G17', 'Groupe', 'G', '17', NULL);
                INSERT INTO lois (id, titre, legislature) VALUES ('L16', 'Loi 16', '16'), ('L17', 'Loi 17', '17');
                INSERT INTO scrutins (uid, numero, legislature, date, titre, nature, loi_id)
                    VALUES ('S16', 1, '16', '2023-01-01', 't', 'ensemble', 'L16'),
                           ('S17', 1, '17', '2025-01-01', 't', 'amendement', 'L17'),
                           ('S17b', 2, '17', '2025-01-02', 't', 'autre', NULL);
                INSERT INTO votes (scrutin_uid, acteur_ref, groupe_ref, position, par_delegation)
                    VALUES ('S16', 'PA1', 'G16', 'pour', 0), ('S17', 'PA2', 'G17', 'contre', 0);
            """)
            db.commit()
            db.close()
            p = sqlite3.connect(partitionner(base, "17", Path(d) / "p17.db", compilation.SCHEMA))
            self.assertEqual(p.execute("SELECT uid FROM scrutins ORDER BY uid").fetchall(), [("S17",), ("S17b",)])
            self.assertEqual(p.execute("SELECT acteur_ref FROM votes").fetchall(), [("PA2",)])
            self.assertEqual(p.execute("SELECT acteur_ref FROM deputes").fetchall(), [("PA2",)])
            self.assertEqual(p.execute("SELECT id FROM lois").fetchall(), [("L17",)])
            self.assertEqual(p.execute("SELECT organe_ref FROM groupes").fetchall(), [("G17",)])


if __name__ == "__main__":
    unittest.main()
