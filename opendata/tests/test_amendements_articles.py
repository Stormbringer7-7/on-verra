"""Rattachement des amendements à l'article suivi qu'ils visent et à l'étape où ils sont examinés.

Extraits réels condensés (amendements.json.zip, dossiers.json.zip de l'AN ; ameli.zip du Sénat),
relevés le 24/10/2026. python3 -m unittest discover tests
"""

import json
import unittest

from src.chargement import Document
from src.domaine.objets import CasRevue, Objet
from src.adaptateurs.sources.an import amendements, dossiers
from src.adaptateurs.sources.senat import travaux
from src.adaptateurs.sources.senat.commun import document_ligne

NUL = {"@xsi:nil": "true"}


def division(titre, designation, type_="ARTICLE", position="A", additionnel="false", rattachee=NUL):
    return {"titre": titre, "articleDesignation": designation, "type": type_, "avant_A_Apres": position,
            "divisionRattachee": rattachee, "articleAdditionnel": additionnel, "chapitreAdditionnel": "false"}


def acte(code, uid, organe, *enfants, **textes):
    a = {"codeActe": code, "uid": uid, "organeRef": organe, **textes}
    if enfants:
        a["actesLegislatifs"] = {"acteLegislatif": list(enfants)}
    return a


# DLR5L17N54085 (dossier prototype), arbre des actes condensé : lectures AN1 et SN1.
PROTOTYPE = {
    "uid": "DLR5L17N54085", "titreDossier": {"senatChemin": "http://www.senat.fr/dossier-legislatif/pjl25-689.html"},
    "actesLegislatifs": {"acteLegislatif": [
        acte("AN1", "L17-AN1-54085", "PO838901",
             acte("AN1-DEPOT", "L17-VD231245DI", "PO838901", texteAssocie="PRJLANR5L17B2632"),
             acte("AN1-COM", "L17-AN1-COM-54085", "PO838901",
                  acte("AN1-COM-FOND", "L17-VD231246CF", "PO419610",
                       acte("AN1-COM-FOND-RAPPORT", "L17-VD231837", "PO419610", texteAssocie="RAPPANR5L17B2765",
                            texteAdopte="PRJLANR5L17BTC2765")),
                  acte("AN1-COM-AVIS", "L17-VD231318CA", "PO419865")),
             acte("AN1-DEBATS", "L17-AN1-DEBATS-54085", "PO838901",
                  acte("AN1-DEBATS-SEANCE", "L17-AN1-DEBATS-SEANCE-54085", "PO838901"))),
        acte("SN1", "L17-SN1-54085", "PO78718",
             acte("SN1-DEPOT", "L17-VD232372DIN", "PO78718", texteAssocie="PRJLSNR5S479B0689"),
             acte("SN1-COM", "L17-SN1-COM-54085", "PO78718",
                  acte("SN1-COM-FOND", "L17-VD232373CF", "PO516753",
                       acte("SN1-COM-FOND-RAPPORT", "L17-VD232655", "PO516753", texteAssocie="RAPPSNR5S479B0762",
                            texteAdopte="PRJLSNR5S479BTC0763"))),
             acte("SN1-DEBATS", "L17-SN1-DEBATS-54085", "PO78718"))]}}

# DLR5L17N50588 (PLFSS 2025) : la lecture CMP porte deux actes `CMP-DEBATS-AN`, dont l'un
# (« …-50975 ») figure aussi dans un autre dossier.
PLFSS = {
    "uid": "DLR5L17N50588", "titreDossier": {"senatChemin": "https://www.senat.fr/dossier-legislatif/plfss2025.html"},
    "actesLegislatifs": {"acteLegislatif": [
        acte("CMP", "L17-CMP-50588", "PO851140",
             acte("CMP-COM", "L17-CMP-COM-50588", "PO851140",
                  acte("CMP-COM-RAPPORT-AN", "L17-VD222494", "PO838901", texteAssocie="RAPPANR5L17B0638",
                       texteAdopte="PRJLANR5L17BTC0638")),
             acte("CMP-DEBATS-AN", "L17-CMP-DEBATS-AN-50975", "PO838901"),
             acte("CMP-DEBATS-AN", "L17-CMP-DEBATS-AN-50588", "PO838901"))]}}

# Un dossier repris d'une législature à l'autre a plusieurs lectures « AN2 » (DLR5L11N19503, droit de
# vote des étrangers, ppl99-329) : chacune est une lecture distincte, pas une étape ambiguë.
REPRIS = {
    "uid": "DLR5L11N19503", "titreDossier": {"senatChemin": "http://www.senat.fr/dossier-legislatif/ppl99-329.html"},
    "actesLegislatifs": {"acteLegislatif": [
        acte("AN2", "L16-AN2-19503", "PO791932",
             acte("AN2-DEPOT", "L16-VD208376DIN", "PO791932", texteAssocie="PIONANR5L16B0138"),
             acte("AN2-COM", "L16-AN2-COM-19503", "PO791932", acte("AN2-COM-FOND", "L16-VD208377CF", "PO59051"))),
        acte("AN2", "L17-AN2-19503", "PO838901",
             acte("AN2-DEPOT", "L17-VD220573DIN", "PO838901", texteAssocie="PIONANR5L17B0149"),
             acte("AN2-COM", "L17-AN2-COM-19503", "PO838901",
                  acte("AN2-COM-FOND", "L17-VD220574CF", "PO59051",
                       acte("AN2-COM-FOND-RAPPORT", "L17-VD230262", "PO59051", texteAssocie="RAPPANR5L17B2428",
                            texteAdopte="PIONANR5L17BTC2428"))))]}}


def amendement_an(chemin, uid, texte, div):
    a = {"amendement": {"uid": uid, "texteLegislatifRef": texte, "identification": {"numeroLong": "1"},
                        "pointeurFragmentTexte": {"division": div}, "cycleDeVie": {}, "signataires": {}}}
    return Document(amendements.AMENDEMENTS, f"json/{chemin}/{texte}/{uid}.json", json.dumps(a).encode())


class ArticleViseAN(unittest.TestCase):
    def test_divisions_reelles(self):
        cas = [
            # AMANR5L17PO419610B2632P0D1N000154 (CE154)
            (division("Article 4", "ARTICLE 4"), ("article", "4")),
            # AMANR5L17PO838901B2341P0D2N000001 : « PREMIER » est l'ordinal
            (division("Article PREMIER ter", "ARTICLE PREMIER TER"), ("article", "1 ter")),
            # AMANR5L17PO838901B1906P2D1N001664 : titre en capitales, deux-points final
            (division("ARTICLE 64 :", "ARTICLE 64 :"), ("article", "64")),
            # AMANR5L17PO59048B0324P2D1N001974 : annexe rattachée à l'article qui l'approuve
            (division("ÉTAT B", "ARTICLE 42", "ANNEXE", rattachee="ARTICLE 42"), ("article", "42")),
            # AMANR5L17PO419610B2632P0D1N000457 : « APRÈS L'ARTICLE PREMIER, insérer l'article suivant: »
            (division("Article PREMIER", "APRÈS L'ARTICLE PREMIER, insérer l'article suivant:", position="Après",
                      additionnel="true"), ("additionnel", None)),
            # AMANR5L17PO838901BTC2765P0D1N000357 : intitulé du titre Ier (« AVANT ART. PREMIER »)
            (division("TITRE Ier", "AVANT L'ARTICLE PREMIER", "CHAPITRE"), ("division", None)),
            (division("visant à améliorer la protection des commerçants grâce à l’usage d’outils numériques", "TITRE",
                      "TITRE"), ("intitule", None)),
            # AMANR5L17PO419610B3058P0D1N000723 : aucune division publiée
            ({}, ("sans_division", None)),
            # AMANR5L17PO419610B1034P0D1N000006 : « bi » n'est ni un adverbe ni une lettre d'insertion
            (division("Article 3 bi", "ARTICLE 3 BI"), ("illisible", None)),
            # AMANR5L17PO838901BTC2117P0D1N000011 : article groupé (« D_Article_2_et_3 ») mal désigné
            (division("Article Article 2", "ARTICLE ARTICLE 2"), ("illisible", None)),
        ]
        for div, attendu in cas:
            self.assertEqual(amendements.article_vise(div), attendu, div.get("titre"))


class RattachementAN(unittest.TestCase):
    examens = dossiers.Examens([PROTOTYPE, PLFSS, REPRIS])

    def analyser(self, chemin, uid, texte, div):
        elements = list(amendements.amendement(amendement_an(chemin, uid, texte, div), self.examens))
        am = next(e for e in elements if isinstance(e, Objet) and e.type == "amendement")
        return elements, am.valeurs

    def test_commission_au_fond(self):
        elements, v = self.analyser("DLR5L17N54085", "AMANR5L17PO419610B2632P0D1N000154", "PRJLANR5L17B2632",
                                    division("Article 4", "ARTICLE 4"))
        # clé du dossier Sénat cité par l'AN : le même article des deux côtés de la navette
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#4")
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-VD231246CF")       # AN1-COM-FOND
        suivi = elements[0]                    # déclaré avant l'amendement qui le cite
        self.assertEqual((suivi.type, suivi.identite, suivi.valeurs["numero_initial"]),
                         ("article_suivi", v["article_suivi_id"], "4"))
        self.assertEqual(suivi.valeurs["dossier_id"].id_source, "DLR5L17N54085")

    def test_commission_pour_avis_et_seance(self):
        _, v = self.analyser("DLR5L17N54085", "AMANR5L17PO419865B2632P0D1N000248", "PRJLANR5L17B2632",
                             division("Article 4", "ARTICLE 4"))
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-VD231318CA")       # AN1-COM-AVIS
        _, v = self.analyser("DLR5L17N54085", "AMANR5L17PO838901BTC2765P0D1N001423", "PRJLANR5L17BTC2765",
                             division("Article 4", "ARTICLE 4"))
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-AN1-DEBATS-54085")  # pas AN1-COM, même organe
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#4")

    def test_additionnel_sans_suivi_ni_revue(self):
        elements, v = self.analyser("DLR5L17N54085", "AMANR5L17PO419610B2632P0D1N000457", "PRJLANR5L17B2632",
                                    division("Article PREMIER", "APRÈS L'ARTICLE PREMIER, insérer l'article suivant:",
                                             position="Après", additionnel="true"))
        self.assertIsNone(v["article_suivi_id"])
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-VD231246CF")
        self.assertFalse([e for e in elements if isinstance(e, CasRevue) or getattr(e, "type", "") == "article_suivi"])

    def test_illisible_en_revue(self):
        elements, v = self.analyser("DLR5L17N54085", "AMANR5L17PO419610B2632P0D1N000154", "PRJLANR5L17B2632",
                                    division("Article 3 bi", "ARTICLE 3 BI"))
        self.assertIsNone(v["article_suivi_id"])
        cas = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual([(c.type, c.nature) for c in cas], [("article_vise_illisible", "constat")])

    def test_etape_ambigue_en_revue(self):
        elements, v = self.analyser("DLR5L17N50588", "AMANR5L17PO838901B0638P0D1N000011", "PRJLANR5L17BTC0638",
                                    division("Article 23", "ARTICLE 23"))
        self.assertIsNone(v["etape_id"])
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:plfss2025#23")
        cas = next(e for e in elements if isinstance(e, CasRevue))
        self.assertEqual((cas.type, cas.nature, cas.champ), ("etape_ambigue", "champ", "etape_id"))
        self.assertEqual(sorted(c.identite.id_source for c in cas.candidats),
                         ["DLR5L17N50588:L17-CMP-DEBATS-AN-50588", "DLR5L17N50588:L17-CMP-DEBATS-AN-50975"])

    def test_lectures_reprises_distinctes(self):
        _, v = self.analyser("DLR5L11N19503", "AMANR5L17PO59051B0149P0D1N000007", "PIONANR5L17B0149",
                             division("Article PREMIER", "ARTICLE PREMIER"))
        self.assertEqual(v["etape_id"].id_source, "DLR5L11N19503:L17-VD220574CF")
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:ppl99-329#1")

    def test_sans_etape_publiee(self):
        # Séance de la lecture pas encore publiée dans le dossier (aucun acte `AN2-DEBATS`) : vide, pas de revue.
        elements, v = self.analyser("DLR5L11N19503", "AMANR5L17PO838901BTC2428P0D1N000267", "PIONANR5L17BTC2428",
                                    division("Article PREMIER", "ARTICLE PREMIER"))
        self.assertIsNone(v["etape_id"])
        self.assertFalse([e for e in elements if isinstance(e, CasRevue)])

    def test_dossier_inconnu_sans_suivi(self):
        # 119 amendements réels sont rangés sous un dossier absent de l'archive des dossiers
        elements, v = self.analyser("DLR5L17N99999", "AMANR5L17PO59051B0149P0D1N000007", "PIONANR5L17B0149",
                                    division("Article PREMIER", "ARTICLE PREMIER"))
        self.assertIsNone(v["article_suivi_id"])           # article_suivi.dossier_id est obligatoire
        self.assertFalse([e for e in elements if isinstance(e, Objet) and e.type == "article_suivi"])


class RattachementSenat(unittest.TestCase):
    def referentiel(self):
        ref = travaux.Referentiel.__new__(travaux.Referentiel)
        # txt_ameli 107100 : texte de séance n° 763 (texte de la commission), 1re lecture, pjl25-689 ;
        # txt_ameli 106687 : PLFR pjl25-132 (la mission est l'état B de l'article 5).
        ref.textes = {"107100": {"doslegsignet": "pjl25-689", "num": "763", "lecid": "1", "txttyp": "S"},
                      "C1": {"doslegsignet": "pjl25-689", "num": "689", "lecid": "1", "txttyp": "C"},
                      "106687": {"doslegsignet": "pjl25-132", "num": "132", "lecid": "1", "txttyp": "S"}}
        ref.divisions = {"207638": {"typid": "4", "lib": "Article 21", "merid": None},
                         "207613": {"typid": "4", "lib": "Article 13", "merid": None},
                         "203440": {"typid": "4", "lib": "Article 5", "merid": None},
                         "203441": {"typid": "7", "lib": "État B", "merid": "203440"},
                         "4740": {"typid": "4", "lib": "Article additionnel après l'article 71 bis", "merid": None},
                         "S2": {"typid": "4", "lib": "Article 1er\xa0bis\xa0A\xa0(nouveau)", "merid": None},
                         "S3": {"typid": "3", "lib": "Chapitre Ier : Faciliter et renforcer les poursuites pénales",
                                "merid": None}}
        ref.subdivisions = {i: s["lib"] for i, s in ref.divisions.items()}
        ref.sorts, ref.matricules, ref.auteurs = {"N": "Non soutenu"}, {}, {}
        ref.signets, ref.delegations = {"pjl25-689", "pjl25-132"}, set()
        ref.examens = dossiers.Examens([PROTOTYPE])
        return ref

    def analyser(self, ref, **a):
        ligne = {"id": "1328039", "txtid": "107100", "num": "999", "subid": "207638", "subpos": "0", "sorid": "N",
                 "datdep": "2026-06-25 11:56:54", "dis": None, "obj": None, **a}
        elements = list(travaux.amendement(document_ligne(travaux.AMELI, "amd", ligne["id"], ligne), ref))
        return elements, next(e for e in elements if isinstance(e, Objet) and e.type == "amendement").valeurs

    def test_seance(self):
        # amd 1328039 (n° 999), « Article 21 » : le texte n° 763 est cité par la lecture SN1 de l'AN
        elements, v = self.analyser(self.referentiel())
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#21")
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-SN1-DEBATS-54085")
        self.assertEqual((elements[0].type, elements[0].valeurs["numero_initial"]), ("article_suivi", "21"))

    def test_commission_et_delegation(self):
        ref = self.referentiel()
        _, v = self.analyser(ref, txtid="C1", num="COM-12")
        self.assertEqual(v["etape_id"].id_source, "DLR5L17N54085:L17-VD232373CF")       # SN1-COM-FOND
        ref.delegations = {("pjl25-689", "1")}       # une commission pour avis a délégation au fond
        _, v = self.analyser(ref, txtid="C1", num="COM-12")
        self.assertIsNone(v["etape_id"])

    def test_lecture_discordante(self):
        ref = self.referentiel()
        ref.textes["107100"] = {**ref.textes["107100"], "lecid": "4"}     # nouvelle lecture : SN1 ne convient pas
        _, v = self.analyser(ref)
        self.assertIsNone(v["etape_id"])

    def test_divisions(self):
        ref = self.referentiel()
        # amd 1327276 : « Après l'article 13 » (subpos 20) ; amd 7726 : subdivision d'article additionnel
        for a in ({"subid": "207613", "subpos": "20"}, {"subid": "4740"}, {"subid": "S3"}, {"subid": None}):
            elements, v = self.analyser(ref, **a)
            self.assertIsNone(v["article_suivi_id"], a)
            self.assertFalse([e for e in elements if isinstance(e, CasRevue)], a)
        # amd 1300995 : « État B » rattaché à son article (`sub.merid`) -> article 5 du pjl25-132
        _, v = self.analyser(ref, txtid="106687", subid="203441")
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:pjl25-132#5")
        self.assertIsNone(v["etape_id"])                    # dossier non cité par l'AN : pas d'étape
        _, v = self.analyser(ref, subid="S2")
        self.assertEqual(v["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#1 bis A")

    def test_illisible_en_revue(self):
        ref = self.referentiel()
        # aucune subdivision AMELI illisible au 24/10/2026 : intitulé groupé réel de l'AN (PIONANR5L17B1034)
        ref.divisions["X"] = {"typid": "4", "lib": "Articles 2 et 3", "merid": None}
        ref.subdivisions["X"] = "Articles 2 et 3"
        elements, v = self.analyser(ref, subid="X")
        self.assertIsNone(v["article_suivi_id"])
        self.assertEqual([e.type for e in elements if isinstance(e, CasRevue)], ["article_vise_illisible"])


if __name__ == "__main__":
    unittest.main()
