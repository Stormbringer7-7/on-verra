"""Cas relevés sur l'essai Qwen 2.5 7B (dossier « Protéger l'eau potable »).

    python3 -m unittest test_controle
"""

import unittest

from controle import controler

SOURCE = ("Amendement CD33 (AN). Dispositif : après le mot « lien », insérer le mot « notamment ». "
          "Exposé : article L. 2224-7-5 du code ; zones soumises à contrainte environnementale (ZSCE) ; "
          "captages du Grenelle de l’environnement ; alinéa 5.")


def introuvables(resume):
    return [i["valeur"] for i in controler(resume, SOURCE)["introuvables"]]


class Controle(unittest.TestCase):
    def test_nom_invente_apres_civilite(self):
        self.assertEqual(introuvables("Son auteur, M. Dupont, ajoute le mot « notamment »."), ["Dupont"])

    def test_reference_inventee(self):
        self.assertEqual(introuvables("Il modifie l'article L. 2224-7-7 et l'alinéa 5."), ["L. 2224-7-7"])

    def test_citation_non_exacte(self):
        self.assertEqual(introuvables("Il remplace « inscription dans le cadre »."), ["inscription dans le cadre"])

    def test_elements_presents_malgre_casse_et_accents(self):
        self.assertEqual(introuvables("Il vise les Zones Soumises à Contrainte Environnementale (ZSCE) du Grenelle."), [])

    def test_debut_de_phrase_ignore(self):
        self.assertEqual(introuvables("Cet amendement précise le texte. Selon l'auteur, c'est plus clair."), [])

    def test_sans_synthese(self):
        self.assertEqual(controler(None, SOURCE)["statut"], "sans_synthese")


if __name__ == "__main__":
    unittest.main()
