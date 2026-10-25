"""Socle ETL : ordre des étapes, relecture ciblée, étapes canoniques assemblées et ligne de commande.

python3 -m unittest discover tests
"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from src import compilation
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import construire
from src.etl import Etape, ordonner


def rien(ctx):
    pass


class Ordre(unittest.TestCase):
    def test_dependances_avant(self):
        etapes = [Etape("c", rien, apres=("b",)), Etape("a", rien), Etape("b", rien, apres=("a",))]
        self.assertEqual([e.nom for e in ordonner(etapes)], ["a", "b", "c"])

    def test_ordre_de_declaration_sinon(self):
        self.assertEqual([e.nom for e in ordonner([Etape("y", rien), Etape("x", rien)])], ["y", "x"])

    def test_dependance_absente(self):
        with self.assertRaises(ValueError):
            ordonner([Etape("a", rien, apres=("inconnue",))])

    def test_cycle(self):
        with self.assertRaises(ValueError):
            ordonner([Etape("a", rien, apres=("b",)), Etape("b", rien, apres=("a",))])

    def test_etapes_canoniques_assemblees(self):
        noms = [e.nom for e in ordonner(compilation.ETAPES_CANON)]
        self.assertEqual(noms[-1], "textes.modifications")


class Relecture(unittest.TestCase):
    def test_relire_seulement_les_etapes_nommees(self):
        vu = {}
        a = Etape("x.socle", lambda ctx: vu.__setitem__("x.socle", ctx.forcer), sources=lambda p: [])
        b = Etape("x.textes", lambda ctx: vu.__setitem__("x.textes", ctx.forcer), apres=("x.socle",), sources=lambda p: [])
        with tempfile.TemporaryDirectory() as d:
            construire(EntrepotMemoire(), Path(d), [a, b], relire={"x.textes"})
            self.assertEqual(vu, {"x.socle": False, "x.textes": True})
            construire(EntrepotMemoire(), Path(d), [a, b], relire=True)
            self.assertEqual(vu, {"x.socle": True, "x.textes": True})


class LigneDeCommande(unittest.TestCase):
    def test_aide_de_chaque_commande(self):
        """Toutes les commandes se construisent (une aide mal formée casse toute la CLI)."""
        racine = Path(__file__).resolve().parent.parent
        for commande in ([], ["migrer"], ["canon"], ["projeter"], ["uml"], ["controles"], ["revue"], ["inventaire"]):
            r = subprocess.run([sys.executable, "-m", "src", *commande, "--help"], cwd=racine,
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr[-500:])


if __name__ == "__main__":
    unittest.main()
