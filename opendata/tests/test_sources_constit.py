"""Décisions du Conseil constitutionnel (stock DILA) et leur rattachement par l'AN.

python3 -m unittest discover tests
"""

import json
import unittest

from src.adaptateurs.sources import constit
from src.adaptateurs.sources.an import dossiers
from src.chargement import Document
from src.domaine import IdentiteNative, Systeme
from src.domaine.objets import Dependants, Objet
from src.etl import Fichier

DECISION = """<TEXTE_JURI_CONSTIT><META><META_COMMUN><ID>CONSTEXT000054998618</ID><NATURE>DC</NATURE></META_COMMUN>
<META_SPEC><META_JURI><NUMERO>2026-910</NUMERO><DATE_DEC>2026-03-27</DATE_DEC><SOLUTION>Non conformité partielle</SOLUTION></META_JURI>
<META_JURI_CONSTIT><LOI_DEF nor="SFHX2508281L" num="2026-247" date="2026-03-31"/>
<URL_CC>https://www.conseil-constitutionnel.fr/decision/2026/2026910DC.htm</URL_CC></META_JURI_CONSTIT></META_SPEC></META>
</TEXTE_JURI_CONSTIT>"""


class Constit(unittest.TestCase):
    def test_decision(self):
        (o,) = list(constit.analyser(Document(Fichier("x", ""), "juri/constit/a.xml", DECISION.encode())))
        self.assertEqual(o.identite, IdentiteNative(Systeme.CONSTIT, "decision", "2026-910"))
        self.assertEqual((o.valeurs["type"], o.valeurs["solution"], o.valeurs["nor_loi"]),
                         ("DC", "Non conformité partielle", "SFHX2508281L"))
        self.assertNotIn("dossier_id", o.valeurs)          # le lien au dossier vient de l'AN

    def test_nor_supprime_ignore(self):
        (o,) = list(constit.analyser(Document(Fichier("x", ""), "a.xml", DECISION.replace("SFHX2508281L", "SUPPRIME").encode())))
        self.assertIsNone(o.valeurs["nor_loi"])


class Archive(unittest.TestCase):
    def test_membres_du_stock(self):
        import io
        import tarfile
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "CONSTIT_1.tar.gz"
            with tarfile.open(chemin, "w:gz") as tar:
                for nom, contenu in (("20250716-211907/constit/global/CONS/TEXT/00/00/51/CONSTEXT1.xml", DECISION),
                                     ("20250716-211907/liste_suppression_constit.dat", "x")):
                    info = tarfile.TarInfo(nom)
                    info.size = len(contenu.encode())
                    tar.addfile(info, io.BytesIO(contenu.encode()))
            f = Fichier("CONSTIT_1.tar.gz", "")
            docs = list(constit.documents([f], {f.nom: chemin}))
        self.assertEqual([d.id_source for d in docs], ["CONSTEXT1"])


class DossierAN(unittest.TestCase):
    def test_decision_et_texte_publie(self):
        d = {"dossierParlementaire": {
            "uid": "DLR1", "legislature": "17", "titreDossier": {"titre": "X"}, "procedureParlementaire": {},
            "actesLegislatifs": {"acteLegislatif": [
                {"@xsi:type": "ConclusionEtapeCC_Type", "uid": "L17-CC", "codeActe": "CC-CONCLUSION",
                 "numDecision": "910", "anneeDecision": "2026", "dateActe": "2026-03-27T00:00:00.000+01:00"},
                {"@xsi:type": "Promulgation_Type", "uid": "L17-PL", "codeActe": "PROM-PUB", "codeLoi": "2026-247",
                 "titreLoi": "LOI n° 2026-247 du 31 mars 2026", "dateActe": "2026-04-01T00:00:00.000+02:00",
                 "infoJO": {"referenceNOR": "SFHX2508281L", "numJO": "83",
                            "urlLegifrance": "http://www.legifrance.gouv.fr/WAspad/UnTexteDeJorf?numjo=SFHX2508281L"}}]}}}
        elements = list(dossiers.dossier(Document(dossiers.DOSSIERS, "x", json.dumps(d).encode())))
        objets = {o.type: o for o in elements if isinstance(o, Objet) and o.type in ("decision_cc", "texte_publie")}
        self.assertEqual(objets["decision_cc"].identite.id_source, "2026-910")
        self.assertEqual(objets["decision_cc"].valeurs["dossier_id"].id_source, "DLR1")
        self.assertEqual((objets["texte_publie"].valeurs["nor"], objets["texte_publie"].valeurs["numero"]),
                         ("SFHX2508281L", "2026-247"))
        liens = {e.parent["nature"]: e.lignes for e in elements if isinstance(e, Dependants) and e.lignes}
        self.assertEqual(liens["decision_cc"][0]["vers_id"].id_source, "2026-910")
        self.assertEqual(liens["texte_publie"][0]["vers_id"].id_source, "SFHX2508281L")


if __name__ == "__main__":
    unittest.main()
