"""Versions de texte et suivi des articles (Akoma Ntoso du Sénat).

python3 -m unittest discover tests
"""

import unittest

from src import textes
from src.adaptateurs.sources.senat import textes as senat_textes
from src.chargement import Document
from src.domaine.objets import Objet
from src.etl import Fichier

AKN = """<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"><bill><meta><identification>
<FRBRExpression><FRBRdate name="#depot" date="2026-06-03"/></FRBRExpression></identification></meta><body>
<chapter><article eId="art_1er"><num>Article 1<sup>er</sup></num><alinea><content><p>Le code est modifié.</p></content></alinea></article>
<article eId="art_2_bis"><num>Article 2 bis</num><alinea><content><p>(Supprimé)</p></content></alinea></article></chapter>
</body></bill></akomaNtoso>"""


class Numeros(unittest.TestCase):
    def test_numero_article(self):
        self.assertEqual(textes.numero_article("Article 1er"), "1")
        self.assertEqual(textes.numero_article("Article 3 bis A"), "3 bis A")
        self.assertEqual(textes.numero_article("Article unique"), "unique")
        self.assertIsNone(textes.numero_article("Annexe"))
        self.assertEqual(textes.numero_article("Article 2 bis (nouveau)"), "2 bis")
        self.assertEqual(textes.numero_article("Article 4\xa0(Supprimé)"), "4")

    def test_numero_strict(self):
        # titre et numéro collés (« Article 1er<br/>Rectification… » lu sans le saut de ligne)
        self.assertIsNone(textes.numero_article("Article 1erRectification des tableaux d’équilibre"))
        self.assertIsNone(textes.numero_article("Article 2 et 3"))
        self.assertEqual(textes.numero_article("Article 13 bis AAAA (nouveau)"), "13 bis AAAA")
        self.assertEqual(textes.numero_article("Article liminaire"), "liminaire")

    def test_intitules_groupes_et_plages(self):
        self.assertEqual(textes.numeros_articles("Articles 2 et 3"), ["2", "3"])
        self.assertEqual(textes.numeros_articles("Articles 1er bis, 2 et 3"), ["1 bis", "2", "3"])
        self.assertEqual(textes.numeros_articles("Articles 4 septies et 4 octies"), ["4 septies", "4 octies"])
        # une plage ne se développe pas : un « 19 bis AB » peut se trouver entre les bornes
        self.assertIsNone(textes.numeros_articles("Articles 19 bis A à 19 bis C"))
        self.assertIsNone(textes.numeros_articles("Articles 6 à 14"))

    def test_mentions(self):
        self.assertTrue(textes.mention_seule("(Supprimés)"))
        self.assertFalse(textes.mention_seule("Article 4 (Supprimé)"))
        self.assertTrue(textes.omission("…………………………….………"))
        self.assertEqual(textes.statut_mention(["Suppression conforme"]), "supprime")
        self.assertEqual(textes.statut_mention(["Non modifié"]), "non_modifie")
        self.assertEqual(textes.statut_mention(["Conforme"]), "conforme")
        self.assertIsNone(textes.statut_mention(["nouveau"]))

    def test_suivi_meme_dossier_meme_numero(self):
        self.assertEqual(textes.article_suivi("SENAT:dossier:pjl25-689", "2 bis"),
                         textes.article_suivi("SENAT:dossier:pjl25-689", "2 bis"))


class Senat(unittest.TestCase):
    def test_version(self):
        donnees = ("pjl25-689", {}, "pjl25-689", "déposé au Sénat")
        elements = list(senat_textes.version(Document(Fichier("x", ""), "akn/pjl25-689.akn.xml", AKN.encode(), "pjl25-689", donnees)))
        v = elements[0]
        self.assertEqual((v.type, v.valeurs["nature"], str(v.valeurs["date"])), ("version_texte", "déposé au Sénat", "2026-06-03"))
        articles = [e for e in elements if isinstance(e, Objet) and e.type == "version_article"]
        self.assertEqual([(a.valeurs["numero"], a.valeurs["statut"]) for a in articles], [("1", "present"), ("2 bis", "supprime")])
        self.assertEqual(articles[1].valeurs["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#2 bis")


if __name__ == "__main__":
    unittest.main()


class TextesDefinitifs(unittest.TestCase):
    """Un texte adopté définitivement est renuméroté (1 à N, sans « bis ») : aucun suivi.
    Exemples réels : tas25-166 (Sénat), PIONANR5L17BTA0332 (AN), marqués `oritxtado = 'D'` dans DOSLEG."""

    def test_senat_definitif_sans_suivi(self):
        donnees = ("tas25-166", {"definitif": True}, "pjl25-689", "texte adopté définitivement")
        elements = list(senat_textes.version(Document(Fichier("x", ""), "akn/tas25-166.akn.xml", AKN.encode(), "tas25-166", donnees)))
        articles = [e for e in elements if isinstance(e, Objet) and e.type == "version_article"]
        self.assertEqual([a.valeurs["numero"] for a in articles], ["1", "2 bis"])
        self.assertTrue(all(a.valeurs["article_suivi_id"] is None for a in articles))
        self.assertFalse([e for e in elements if isinstance(e, Objet) and e.type == "article_suivi"])

    def test_an_definitif_sans_suivi(self):
        from src.adaptateurs.sources.an import textes as an_textes
        html = "<html><body><p class='assnat9ArticleNum'>Article 3</p><p class='assnatLoiTexte'>Le code est modifié.</p></body></html>"
        donnees = ("PIONANR5L17BTA0332", "DLR5L17N51670", "SENAT:dossier:ppl24-661", None)
        doc = Document(Fichier("x", ""), "textes/x.html", html.encode(), "x", donnees)
        (a,) = [e for e in an_textes.version(doc, frozenset({332})) if isinstance(e, Objet) and e.type == "version_article"]
        self.assertEqual((a.valeurs["numero"], a.valeurs["article_suivi_id"]), ("3", None))
        (b,) = [e for e in an_textes.version(doc) if isinstance(e, Objet) and e.type == "version_article"]
        self.assertIsNotNone(b.valeurs["article_suivi_id"])                 # non définitif : suivi

    def test_senat_sous_alineas_sans_doublon(self):
        akn = AKN.replace('<alinea><content><p>Le code est modifié.</p></content></alinea>',
                          '<alinea><num>1°</num><alinea><content><p>a) Premier.</p></content></alinea>'
                          '<content><p>1° Le code est ainsi modifié :</p></content></alinea>')
        donnees = ("pjl25-689", {}, "pjl25-689", "déposé au Sénat")
        elements = list(senat_textes.version(Document(Fichier("x", ""), "akn/x.akn.xml", akn.encode(), "x", donnees)))
        premier = next(e for e in elements if isinstance(e, Objet) and e.type == "version_article")
        self.assertEqual(premier.valeurs["texte"], "1° Le code est ainsi modifié :\na) Premier.")


class AssembleeNationale(unittest.TestCase):
    def test_articles_du_html(self):
        from src.adaptateurs.sources.an import textes as an_textes
        html = ("<html><body><p class='assnat5ChapitreNum0'>Chapitre Ier</p>"
                "<p class='assnat9ArticleNum'>Article 1<sup>er</sup></p><p class='assnatLoiTexte'>Le code est modifié.</p>"
                "<p class='assnatLoiTexte'>1° Un alinéa.</p><p class='assnat9ArticleNum'>Article 2 bis (nouveau)</p>"
                "<p class='assnatMentionsousarticle'>(Supprimé)</p></body></html>")
        donnees = ("PRJLANR5L17BTA0295", "DLR5L17N54085", "SENAT:dossier:pjl25-689", None)
        elements = list(an_textes.version(Document(Fichier("x", ""), "textes/x.html", html.encode(), "x", donnees)))
        articles = [e for e in elements if isinstance(e, Objet) and e.type == "version_article"]
        self.assertEqual([(a.valeurs["numero"], a.valeurs["statut"]) for a in articles], [("1", "present"), ("2 bis", "supprime")])
        self.assertEqual(articles[0].valeurs["texte"], "Le code est modifié.\n1° Un alinéa.")
        # même clé de suivi que le Sénat : c'est le même article des deux côtés de la navette
        self.assertEqual(articles[1].valeurs["article_suivi_id"].id_source, "SENAT:dossier:pjl25-689#2 bis")
        self.assertEqual(elements[0].valeurs["nature"], "adopte")

    def test_cas_reels_du_html(self):
        # PIONANR5L17B0872, B1034, B0013, B3211, BTC1617, B3017 (relevés le 24/10/2026), condensés
        from src.adaptateurs.sources.an import textes as an_textes
        from src.domaine.objets import CasRevue, Ensemble
        html = ("<html><body>"
                "<p class='assnat9ArticleNum'>Article 1<sup>er</sup><br />Rectification des tableaux d’équilibre</p>"
                "<p class='assnatLoiTexte'>Est approuvé le tableau.</p>"
                "<p class='assnat9ArticleNum'>Article 2</p><p class='assnat9ArticleNum'>(Non modifié)</p>"
                "<p class='assnatLoiTexte'>Le code du travail est modifié.</p>"
                "<p class='assnat9ArticleNum'>Articles 3 et 4</p><p class='assnat9ArticleNum'>(Supprimés)</p>"
                "<p class='assnat9ArticleNum'>Article 5<br /><span>Supprimé</span></p>"
                "<p class='assnat9ArticleNum'>……………………………………</p>"
                "<p class='assnat9ArticleNum'>Articles 6 à 14</p><p class='assnatMentionsousarticle'>(Supprimés)</p>"
                "<p class='assnatLoiTexte'>Délibéré en séance publique, à Paris, le 24 janvier 2006.</p>"
                "<p class='assnatLoiTexte'>Signé : X</p></body></html>")
        donnees = ("PIONANR5L17B0872", "DLR1", "AN:dossier:DLR1", None)
        elements = list(an_textes.version(Document(Fichier("x", ""), "textes/x.html", html.encode(), "x", donnees)))
        articles = [e for e in elements if isinstance(e, Objet) and e.type == "version_article"]
        self.assertEqual([(a.valeurs["numero"], a.valeurs["statut"]) for a in articles], [
            ("1", "present"), ("2", "non_modifie"), ("3", "supprime"), ("4", "supprime"), ("5", "supprime"),
            ("Articles 6 à 14", "supprime")])
        self.assertEqual(articles[0].valeurs["intitule"], "Rectification des tableaux d’équilibre")
        self.assertEqual(articles[1].valeurs["texte"], "Le code du travail est modifié.")
        self.assertIsNone(articles[5].valeurs["article_suivi_id"])          # plage : pas de suivi
        self.assertNotIn("Délibéré", articles[5].valeurs["texte"])
        (cas,) = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual((cas.type, cas.nature), ("articles_plage", "constat"))
        (ensemble,) = [e for e in elements if isinstance(e, Ensemble)]
        self.assertEqual(len(ensemble.identites), 6)
        self.assertEqual(ensemble.cas, (cas.cle,))

    def test_gabarit_sans_balisage_en_revue(self):
        from src.adaptateurs.sources.an import textes as an_textes
        from src.domaine.objets import CasRevue
        html = "<html><body><p>Article unique</p><p>Le code est modifié.</p></body></html>"
        donnees = ("PIONANR5L17B0062", "DLR1", "AN:dossier:DLR1", None)
        elements = list(an_textes.version(Document(Fichier("x", ""), "textes/x.html", html.encode(), "x", donnees)))
        self.assertFalse([e for e in elements if isinstance(e, Objet) and e.type == "version_article"])
        (cas,) = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual((cas.type, cas.contexte["titres_probables"]), ("texte_non_decoupe", 1))
