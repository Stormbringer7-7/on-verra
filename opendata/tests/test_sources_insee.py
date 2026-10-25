"""Code officiel géographique : hiérarchie des territoires par codes INSEE.

python3 -m unittest discover tests
"""

import unittest

from src.adaptateurs.sources import insee
from src.adaptateurs.sources.senat.commun import document_ligne
from src.domaine import IdentiteNative, Systeme


class Territoires(unittest.TestCase):
    def test_commune_et_commune_deleguee_meme_code(self):
        com = {"TYPECOM": "COM", "COM": "01033", "DEP": "01", "LIBELLE": "Valserhône", "COMPARENT": ""}
        comd = {"TYPECOM": "COMD", "COM": "01033", "DEP": "01", "LIBELLE": "Bellegarde-sur-Valserine", "COMPARENT": "01033"}
        (c,) = insee.commune(document_ligne(insee.COMMUNES, "c", "COM:01033", com))
        (d,) = insee.commune(document_ligne(insee.COMMUNES, "c", "COMD:01033", comd))
        self.assertNotEqual(c.identite, d.identite)
        self.assertEqual(c.valeurs["parent_id"], IdentiteNative(Systeme.INSEE, "departement", "01"))
        self.assertEqual(d.valeurs["parent_id"], IdentiteNative(Systeme.INSEE, "commune", "01033"))

    def test_departement_dans_sa_region(self):
        (d,) = insee.departement(document_ligne(insee.DEPARTEMENTS, "d", "01", {"DEP": "01", "REG": "84", "LIBELLE": "Ain"}))
        self.assertEqual((d.valeurs["type"], d.valeurs["parent_id"].id_source), ("departement", "84"))


if __name__ == "__main__":
    unittest.main()
