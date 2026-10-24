"""HATVP : déclarations (rattachement explicite ou revue) et répertoire des représentants.

python3 -m unittest discover tests
"""

import unittest

from src.adaptateurs.sources.hatvp import declarations, representants
from src.chargement import Document
from src.domaine import Methode, Systeme
from src.domaine.objets import CasRevue, Dependants, Objet, Rapprochement
from src.etl import Fichier

XML = """<?xml version="1.0" encoding="UTF-8"?><declaration><uuid>fbba93e0</uuid>
<general><typeDeclaration><id>DIA</id><label>Déclaration d'intérêts et d'activités</label></typeDeclaration>
<declarationModificative>false</declarationModificative>
<declarant><nom>LAHMAR</nom><dateNaissance>01/01/1970</dateNaissance><email>[Données non publiées]</email></declarant></general>
<activProfCinqDerniereDto><items><items><description>professeur</description><employeur>éducation nationale</employeur>
<commentaire>[Données non publiées]</commentaire></items></items><neant>false</neant></activProfCinqDerniereDto>
<participationFinanciereDto><items/><neant>true</neant></participationFinanciereDto></declaration>"""


def ligne(**autres):
    return {"civilite": "M.", "prenom": "Abdelkader", "nom": "LAHMAR", "type_mandat": "depute", "id_origine": "841729",
            "qualite": "Député", "type_document": "dia", "date_depot": "2024-08-04", "date_publication": "2024-09-01",
            "nom_fichier": "x.pdf", "open_data": "x.xml", "url_dossier": "/pages_nominatives/lahmar-abdelkader", **autres}


class Declarations(unittest.TestCase):
    def analyser(self, l, annuaire=None):
        return list(declarations.declaration(Document(Fichier("x", ""), "declarations/x.xml", XML.encode(), "x", l),
                                             annuaire or {}))

    def test_depute_relie_par_id_origine(self):
        elements = self.analyser(ligne())
        (r,) = [e for e in elements if isinstance(e, Rapprochement)]
        self.assertEqual((r.connue.id_source, r.autre.id_source, r.methode), ("PA841729", "lahmar-abdelkader",
                                                                               Methode.EXPLICIT_REFERENCE))
        d = next(e for e in elements if isinstance(e, Objet))
        self.assertEqual((d.identite.id_source, d.valeurs["type"], d.valeurs["personne_id"].id_source),
                         ("fbba93e0", "DIA", "lahmar-abdelkader"))

    def test_rubriques_sans_donnees_privees(self):
        rubriques = next(e for e in self.analyser(ligne()) if isinstance(e, Dependants)).lignes
        activites = next(r for r in rubriques if r["rubrique"] == "activProfCinqDerniereDto")
        self.assertFalse(activites["neant"])
        self.assertNotIn("commentaire", str(activites["contenu"]))
        self.assertIn("professeur", str(activites["contenu"]))
        self.assertTrue(next(r for r in rubriques if r["rubrique"] == "participationFinanciereDto")["neant"])

    def test_membre_du_gouvernement_en_revue(self):
        elements = self.analyser(ligne(type_mandat="gouvernement", id_origine=""), {"abdelkader lahmar": [
            {"acteur": "PA841729", "libelle": "Abdelkader Lahmar", "depute": True, "membre_gouvernement": False}]})
        self.assertFalse([e for e in elements if isinstance(e, Rapprochement)])
        cas = elements[0]
        self.assertIsInstance(cas, CasRevue)
        self.assertEqual((cas.type, cas.sujet[1].systeme, len(cas.candidats)), ("identite_declarant", Systeme.HATVP, 1))


class Representants(unittest.TestCase):
    def test_representant_et_actions(self):
        p = {"typeIdentifiantNational": "SIREN", "identifiantNational": "497632109", "denomination": "SUNROCK",
             "categorieOrganisation": {"label": "Société commerciale"}, "datePremierePublication": "13/02/2025 09:39:12",
             "telephoneDeContact": "01 00 00 00 00",
             "activites": {"listSecteursActivites": [{"label": "Economie"}]},
             "exercices": [{"publicationCourante": {"dateDebut": "01-01-2026", "dateFin": "31-12-2026", "nombreActivite": 1,
                                                    "montantDepense": "< 10 000 euros", "activites": [{"publicationCourante": {
                                                        "identifiantFiche": "GVTUKD23", "objet": "PLFSS : préserver X",
                                                        "publicationDate": "15/03/2024 à 15:58:39",
                                                        "actionsRepresentationInteret": [{"reponsablesPublics": ["Député, sénateur"],
                                                                                          "actionsMenees": ["Transmettre"]}]}}]}}]}
        elements = list(representants.representant(Document(Fichier("x", ""), "p", b"x", "x", p)))
        r = elements[0]
        self.assertEqual((r.identite.id_source, r.valeurs["secteurs"]), ("SIREN:497632109", ["Economie"]))
        self.assertNotIn("telephone", str(r.valeurs))
        action = next(e for e in elements if isinstance(e, Objet) and e.type == "action_representation")
        self.assertEqual((action.valeurs["objet"], action.valeurs["responsables_publics"]),
                         ("PLFSS : préserver X", ["Député, sénateur"]))
        self.assertEqual(elements[-1].lignes[0]["nombre_actions"], 1)


if __name__ == "__main__":
    unittest.main()
