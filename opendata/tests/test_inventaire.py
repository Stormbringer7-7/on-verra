"""Inventaire des sources : relevé de structure JSON, XML, CSV et dump SQL.

python3 -m unittest discover tests
"""

import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from src.inventaire.releve import Releve, echantillon, relever


class Structure(unittest.TestCase):
    def test_json(self):
        r = Releve()
        r.json({"uid": "PA1", "mandats": [{"organeRef": "PO1"}, {"organeRef": "PO2"}]})
        res = r.resultat()
        self.assertEqual(res["chemins"]["/mandats[]/organeRef"]["n"], 2)
        self.assertEqual(res["chemins"]["/mandats[]/organeRef"]["exemples"], ["PO1", "PO2"])
        self.assertIn("/uid", res["identifiants"])
        self.assertIn("/mandats[]/organeRef", res["identifiants"])

    def test_xml(self):
        r = Releve()
        r.xml(io.BytesIO(b'<a xmlns="urn:x"><b id="1">texte</b><b id="2"/></a>'))
        res = r.resultat()
        self.assertEqual(res["chemins"]["/a/b"]["n"], 2)
        self.assertEqual(res["chemins"]["/a/b@id"]["exemples"], ["1", "2"])

    def test_csv_point_virgule_et_cp1252(self):
        r = Releve()
        r.csv("Nom;Département\nÉlise;Aisne\n".encode("cp1252"))
        self.assertEqual(r.resultat()["chemins"]["/Département"]["exemples"], ["Aisne"])

    def test_dump_sql(self):
        r = Releve()
        r.sql(io.BytesIO(b"CREATE TABLE public.texte (\n    texcod integer NOT NULL,\n    texnum text\n);\n"
                         b"COPY public.texte (texcod, texnum) FROM stdin;\n1\t12\n2\t13\n\\.\n"))
        res = r.resultat()["chemins"]
        self.assertEqual(res["/texte/texcod"]["exemples"], ["integer NOT NULL"])
        self.assertEqual(res["/texte"]["n"], 2)

    def test_echantillon_reparti(self):
        noms = [str(i) for i in range(4000)]
        choisis = echantillon(noms)
        self.assertEqual(len(choisis), 400)
        self.assertEqual(choisis[0], "0")
        self.assertGreater(int(choisis[-1]), 3900)

    def test_archive_zip(self):
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "a.json.zip"
            with zipfile.ZipFile(chemin, "w") as z:
                z.writestr("json/x.json", json.dumps({"scrutin": {"uid": "VT1"}}))
                z.writestr("lisez-moi.txt", "ignoré")
            res = relever(chemin)
        self.assertEqual((res["membres_total"], res["membres_lus"]), (2, 1))
        self.assertIn("/scrutin/uid", res["chemins"])


if __name__ == "__main__":
    unittest.main()
