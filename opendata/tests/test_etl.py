"""Socle ETL : ordre des étapes, chargeur, et cohérence du pipeline assemblé.

python3 -m unittest discover tests
"""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from src import compilation
from src.etl import Chargeur, Etape, Ligne, construire, ordonner
from src.publication import empreinte_schema

# Empreinte du schéma publié : la changer force les applications à retélécharger la base complète.
EMPREINTE_PUBLIEE = "75bb24a39657e55e"


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

    def test_pipeline_assemble(self):
        noms = [e.nom for e in ordonner(compilation.ETAPES)]
        self.assertEqual(set(noms[-2:]), {"classement", "indicateurs"})
        self.assertLess(noms.index("an.scrutins"), noms.index("an.lois"))


class Chargement(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v INTEGER)")
        self.chargeur = Chargeur(self.db)

    def test_conflits(self):
        self.chargeur.ecrire(Ligne("t", {"id": "a", "v": 1}))
        self.chargeur.ecrire(Ligne("t", {"id": "a", "v": 2}, conflit="ignorer"))
        self.assertEqual(self.db.execute("SELECT v FROM t").fetchall(), [(1,)])
        self.chargeur.ecrire(Ligne("t", {"id": "a", "v": 3}))
        self.assertEqual(self.db.execute("SELECT v FROM t").fetchall(), [(3,)])
        with self.assertRaises(sqlite3.IntegrityError):
            self.chargeur.ecrire(Ligne("t", {"id": "a", "v": 4}, conflit="inserer"))

    def test_colonne_ou_table_inconnue(self):
        with self.assertRaises(KeyError):
            self.chargeur.ecrire(Ligne("t", {"id": "a", "w": 1}))
        with self.assertRaises(KeyError):
            self.chargeur.ecrire(Ligne("absente", {"id": "a"}))


class Schema(unittest.TestCase):
    def test_empreinte_inchangee(self):
        """Échoue volontairement à chaque modification du schéma : mettre à jour EMPREINTE_PUBLIEE
        en connaissance de cause (prochaine publication = base complète, pas de correctif)."""
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "vide.db"
            construire(base, Path(d), compilation.SCHEMA, [])
            self.assertEqual(empreinte_schema(sqlite3.connect(base)), EMPREINTE_PUBLIEE)

    def test_base_conservee_si_echec(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d) / "base.db"
            base.write_bytes(b"ancienne")

            def echoue(ctx):
                raise RuntimeError("source indisponible")
            with self.assertRaises(RuntimeError):
                construire(base, Path(d), compilation.SCHEMA, [Etape("x", echoue)])
            self.assertEqual(base.read_bytes(), b"ancienne")


class Relecture(unittest.TestCase):
    def test_relire_seulement_les_etapes_nommees(self):
        import tempfile
        from pathlib import Path
        from src.adaptateurs.stockage import EntrepotMemoire
        from src.chargement import construire
        from src.etl import Etape
        vu = {}
        a = Etape("x.socle", lambda ctx: vu.__setitem__("x.socle", ctx.forcer), sources=lambda p: [])
        b = Etape("x.textes", lambda ctx: vu.__setitem__("x.textes", ctx.forcer), apres=("x.socle",), sources=lambda p: [])
        with tempfile.TemporaryDirectory() as d:
            construire(EntrepotMemoire(), Path(d), [a, b], relire={"x.textes"})
            self.assertEqual(vu, {"x.socle": False, "x.textes": True})
            construire(EntrepotMemoire(), Path(d), [a, b], relire=True)
            self.assertEqual(vu, {"x.socle": True, "x.textes": True})


if __name__ == "__main__":
    unittest.main()


class LigneDeCommande(unittest.TestCase):
    def test_aide_de_chaque_commande(self):
        """Toutes les commandes se construisent (une aide mal formée casse toute la CLI)."""
        import subprocess
        import sys
        racine = Path(__file__).resolve().parent.parent
        for commande in ([], ["canon"], ["controles"], ["revue"], ["inventaire"]):
            r = subprocess.run([sys.executable, "-m", "src", *commande, "--help"], cwd=racine,
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr[-500:])
