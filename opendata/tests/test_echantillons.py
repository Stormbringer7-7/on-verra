"""Échantillons SQLite : aplatissement sans perte, profil des champs, lectures tolérantes.

python3 -m unittest discover tests
"""

import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from src.echantillons.aplatir import nul, tables_de, texte_html
from src.echantillons.base import ecrire, ouvrir, profil, type_de
from src.echantillons.lecture import html_membre, reservoir, tables_dump, xml_dict


class Aplatir(unittest.TestCase):
    def test_liste_d_un_element_publiee_comme_objet(self):
        # AN : un seul cosignataire est publié comme objet, plusieurs comme liste ; même table fille.
        docs = [{"uid": "A1", "cosignataires": {"acteurRef": "PA1"}},
                {"uid": "A2", "cosignataires": [{"acteurRef": "PA2"}, {"acteurRef": "PA3"}]}]
        tables, listes = tables_de(docs, "amd")
        self.assertEqual(listes, {"cosignataires"})
        self.assertEqual([l["acteurRef"] for l in tables["amd__cosignataires"]], ["PA1", "PA2", "PA3"])
        self.assertEqual([l["_parent"] for l in tables["amd__cosignataires"]], [1, 2, 2])
        self.assertNotIn("cosignataires.acteurRef", tables["amd"][0])

    def test_listes_imbriquees_et_valeurs_simples(self):
        tables, _ = tables_de([{"g": [{"n": "A", "votes": ["PA1", "PA2"]}]}], "s")
        self.assertEqual(tables["s__g"][0]["n"], "A")
        self.assertEqual([(l["_parent"], l["_rang"], l["valeur"]) for l in tables["s__g__votes"]], [(1, 0, "PA1"), (1, 1, "PA2")])

    def test_nil_de_l_an_devient_null(self):
        self.assertTrue(nul({"@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", "@xsi:nil": "true"}))
        tables, _ = tables_de([{"sort": {"@xsi:nil": "true"}}, {"sort": "Adopté"}], "a")
        self.assertEqual([l["sort"] for l in tables["a"]], [None, "Adopté"])


class Profil(unittest.TestCase):
    def test_remplissage_similarite_frequentes(self):
        lignes = [{"sort": "Rejeté"}, {"sort": "Rejeté"}, {"sort": "Adopté"}, {"sort": None}]
        p = profil(lignes, "sort")
        self.assertEqual((p["remplies"], p["remplissage"], p["distinctes"], p["similarite"]), (3, 0.75, 2, 0.6667))
        self.assertEqual(p["frequentes"][0], {"valeur": "Rejeté", "part": 0.6667})

    def test_types_lus_dans_le_texte(self):
        self.assertEqual([type_de(v) for v in ("2026-06-04T17:23:54+02:00", "2026-06-04", "42", "4,5", "true", "<p>x</p>", 3)],
                         ["date et heure", "date", "entier (texte)", "décimal (texte)", "booléen", "texte HTML", "entier"])

    def test_ecrire_retire_le_conteneur_toujours_vide(self):
        with tempfile.TemporaryDirectory() as d:
            cx = ouvrir(Path(d) / "e.sqlite")
            ecrire(cx, "o", {"o": [{"_id": 1, "etat": None}, {"_id": 2, "etat.code": "DI"}]})
            colonnes = [r[1] for r in cx.execute('PRAGMA table_info("o")')]
            self.assertEqual(colonnes, ["_id", "etat.code"])
            self.assertEqual(cx.execute("SELECT remplissage FROM _champs WHERE colonne = 'etat.code'").fetchone(), (0.5,))


class Lecture(unittest.TestCase):
    def test_html_en_texte(self):
        # Champ HTML de l'AN, compte rendu du Sénat (XHTML mal formé) : tous les nœuds texte, entités décodées.
        self.assertEqual(texte_html("<p>M.&#160;Le&#160;Coq</p><p>Compl&#x00E9;ter</p>"), "M. Le Coq Compléter")
        self.assertEqual(html_membre(b'<cri><link rel="a"><p>Texte</p></cri>'), {"texte": "Texte"})
        self.assertEqual(texte_html("sans balise"), "sans balise")

    def test_xml_contenu_mixte_lu_comme_texte(self):
        d = xml_dict(b'<a x="1"><b>u</b><b>v</b><CONTENU>Premier<br/>second <i>mot</i></CONTENU></a>')
        self.assertEqual(d, {"a": {"@x": "1", "b": ["u", "v"], "CONTENU": "Premier second mot"}})

    def test_reservoir_deterministe(self):
        self.assertEqual(reservoir(range(1000), 5), reservoir(range(1000), 5))
        self.assertEqual(reservoir(range(3), 5), ([0, 1, 2], 3))

    def test_dump_un_passage_filtre_de_periode(self):
        dump = ("COPY amd (id, datdep, obj) FROM stdin;\n1\t2024-01-02\tavant\n2\t2025-03-04\tapr\\303\\250s\n3\t\\N\tx\n\\.\n"
                "COPY sor (id, lib) FROM stdin;\nA\tAdopt\\351\n\\.\n")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "d.zip"
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("d.sql", dump.encode("utf-8"))
            res = {t: (l, n) for t, l, n in tables_dump(p, "d.sql", 10, {"amd": lambda l: (l["datdep"] or "") >= "2024-07-18"})}
        self.assertEqual(res["amd"][1], 1)
        self.assertEqual(res["amd"][0][0]["id"], "2")
        self.assertEqual(len(res["sor"][0]), 1)


if __name__ == "__main__":
    unittest.main()
