"""Diff mot à mot des articles et attribution d'une modification à un amendement (src/diffs.py).

python3 -m unittest discover tests
"""

import unittest

from src import diffs
from src.domaine import IdentiteNative, Systeme

# Article 13 de la proposition de loi sur l'aide à mourir (DLR5L17N51670), tel que publié dans
# PIONANR5L17B1100 (déposé) puis PIONANR5L17BTC1364 (texte de la commission), condensé.
AVANT = ("La sous‑section 3 de la section 2 bis du chapitre Ier du titre Ier du livre Ier de la première partie du "
         "code de la santé publique, telle qu’elle résulte des articles 5 à 12 de la présente loi, est complétée par "
         "un article L. 1111‑12‑11 ainsi rédigé :\n« Art. L. 1111‑12‑11. – Un décret en Conseil d’État précise les "
         "conditions d’application du présent chapitre, notamment :\n« 1° Les modalités d’information de la personne "
         "qui demande l’aide à mourir ;")
APRES = AVANT.replace("du présent chapitre", "de la présente sous-section")
# Dispositif de l'amendement AS1162 (AMANR5L17PO420120B1100P0D1N001162), tel que publié.
DISPOSITIF = ("<p style=\"text-align: justify;\">&#x00C0; l&#x2019;alin&#x00E9;a&nbsp;2, substituer aux mots&nbsp;:</p>"
              "<p style=\"text-align: justify;\">&#x00AB;&nbsp;du pr&#x00E9;sent chapitre&nbsp;&#x00BB;</p>"
              "<p style=\"text-align: justify;\">les mots&nbsp;:</p><p style=\"text-align: justify;\">&#x00AB;&nbsp;de "
              "la pr&#x00E9;sente sous-section&nbsp;&#x00BB;.</p>")


def amendement(numero, cible=("article", "13"), sort="adopte", dispositif=DISPOSITIF):
    return diffs.Amendement(IdentiteNative(Systeme.AN, "amendement", f"AM{numero}"), numero, cible, sort, dispositif)


class Diff(unittest.TestCase):
    def test_diff_mot_a_mot_exemple_reel(self):
        d = diffs.diff_mots(AVANT, APRES)
        self.assertEqual([op for op in d["operations"] if op[0] != "="],
                         [["-", "du présent chapitre"], ["+", "de la présente sous-section"]])
        self.assertEqual((d["mots_supprimes"], d["mots_ajoutes"]), (3, 4))
        self.assertEqual("".join(t for op, t in d["operations"] if op != "-"), APRES)
        self.assertEqual("".join(t for op, t in d["operations"] if op != "+"), AVANT)

    def test_typographie_et_mentions_ne_sont_pas_des_changements(self):
        # AN (HTML) et Sénat (Akoma Ntoso) n'écrivent pas pareil : insécables, apostrophes, tirets
        # insécables, accents décomposés, mention « (nouveau) » ajoutée par la navette.
        avant = "a bis) À la fin de l’article L. 611‑1‑1, le mot : « calculé » est supprimé ;"
        apres = "a bis) (nouveau) À la fin de l'article L.\xa0611-1-1, le mot : « calculé » est supprimé ;"
        self.assertFalse(diffs.change(diffs.diff_mots(avant, apres)))
        self.assertTrue(diffs.change(diffs.diff_mots(avant, apres.replace("supprimé", "remplacé"))))

    def test_alinea_insere(self):
        d = diffs.diff_mots("I. – Premier.\nII. – Second.", "I. – Premier.\nI bis. – Inséré ici.\nII. – Second.")
        self.assertEqual([op for op in d["operations"] if op[0] != "="], [["+", "I bis. – Inséré ici.\n"]])
        self.assertEqual(d["mots_ajoutes"], 4)

    def test_bloc_trop_grand_non_detaille(self):
        avant, apres = " ".join(f"a{i}" for i in range(600)), " ".join(f"b{i}" for i in range(600))
        d = diffs.diff_mots(avant, apres)
        self.assertEqual([op for op, _ in d["operations"]], ["-", "+"])


class Designation(unittest.TestCase):
    def test_vise_an(self):
        self.assertEqual(diffs.vise("Article PREMIER", "A"), ("article", "1"))
        self.assertEqual(diffs.vise("Article 3 bis", "A"), ("article", "3 bis"))
        self.assertEqual(diffs.vise("Article 3", "Après"), ("apres", "3"))
        self.assertEqual(diffs.vise("Article 1er", "Avant"), ("avant", "1"))
        self.assertIsNone(diffs.vise("relative au droit à l’aide à mourir", "A"))       # TITRE

    def test_vise_senat(self):
        self.assertEqual(diffs.vise("Article 4 (précédemment examiné)"), ("article", "4"))
        self.assertEqual(diffs.vise("Article 19 quater  (nouveau)(Supprimé)"), ("article", "19 quater"))
        self.assertEqual(diffs.vise("Article(s) additionnel(s) après l'article 4 (précédemment examiné)"), ("apres", "4"))
        self.assertIsNone(diffs.vise("Intitulé de la proposition de loi"))
        self.assertIsNone(diffs.vise("Chapitre II : Conditions d'accès"))

    def test_article_insere_vise_par_sa_racine(self):
        self.assertTrue(diffs.vise_article(("apres", "9"), "9 bis", nouveau=True))
        self.assertFalse(diffs.vise_article(("apres", "9"), "9 bis", nouveau=False))
        self.assertFalse(diffs.vise_article(("apres", "9"), "10 bis", nouveau=True))
        self.assertTrue(diffs.vise_article(("article", "9 bis"), "9 bis", nouveau=False))


class Dispositif(unittest.TestCase):
    def test_citations(self):
        self.assertEqual(diffs.citations(DISPOSITIF), ["du présent chapitre", "de la présente sous-section"])
        # Passage sur plusieurs alinéas : chaque alinéa s'ouvre par « et seul le dernier se ferme.
        self.assertEqual(diffs.citations("<p>Rédiger ainsi l’alinéa :</p><p>« I. – Un ;</p><p>« II. – Deux. »</p>"),
                         ["I. – Un", "II. – Deux"])

    def test_preuves(self):
        d = diffs.diff_mots(AVANT, APRES)
        self.assertEqual(diffs.preuve(DISPOSITIF, AVANT, APRES, False, d), "insere")
        self.assertIsNone(diffs.preuve(DISPOSITIF, APRES, AVANT, False, diffs.diff_mots(APRES, AVANT)))
        supprimer = "<p>À la fin de l’alinéa 5, supprimer les mots :</p><p>« et de recueil des avis mentionnés »</p>"
        avant, apres = "La procédure de vérification et de recueil des avis mentionnés au II.", "La procédure de vérification au II."
        self.assertEqual(diffs.preuve(supprimer, avant, apres, False, diffs.diff_mots(avant, apres)), "retire")
        self.assertEqual(diffs.preuve("<p>Supprimer cet article.</p>", AVANT, "", True, diffs.diff_mots(AVANT, "")),
                         "suppression")

    def test_article_additionnel_sans_guillemets(self):
        # Le dispositif d'un article additionnel est le texte de l'article lui-même.
        dispositif = ("<p>Après l’article L. 112‑1‑3 du code rural, il est inséré un article L. 112‑1‑4 ainsi rédigé :</p>"
                      "<p>« Art. L. 112‑1‑4. – Font l’objet de l’étude préalable les projets de travaux. »</p>")
        apres = ("Après l’article L. 112‑1‑3 du code rural, il est inséré un article L. 112‑1‑4 ainsi rédigé :\n"
                 "« Art. L. 112‑1‑4. – Font l’objet de l’étude préalable les projets de travaux. »")
        self.assertEqual(diffs.preuve(dispositif, "", apres, False, diffs.diff_mots("", apres)), "insere")


class Attribution(unittest.TestCase):
    def attribuer(self, amendements, avant=AVANT, apres=APRES, numero="13", nouveau=False, cmp=False):
        return diffs.attribuer(diffs.diff_mots(avant, apres), avant, apres, False, numero, nouveau, amendements, cmp)

    def test_seul_amendement_adopte_dispositif_retrouve(self):
        a = self.attribuer([amendement("AS1162"), amendement("AS9", sort="rejete"), amendement("AS10", ("article", "12"))])
        self.assertEqual((a.origine, a.statut, a.amendement.id_source), ("amendement", "VERIFIED", "AMAS1162"))

    def test_plusieurs_candidats_en_revue(self):
        a = self.attribuer([amendement("AS1162"), amendement("AS1163")])
        self.assertEqual((a.origine, a.statut, a.amendement), ("amendement", "NEEDS_REVIEW", None))
        self.assertEqual([c.numero for c in a.candidats], ["AS1162", "AS1163"])

    def test_changement_non_explique_en_revue(self):
        # Le seul amendement adopté n'explique pas tout l'ajout : un autre changement s'y mêle.
        apres = APRES.replace("Un décret", "Un décret simple")
        a = self.attribuer([amendement("AS1162")], apres=apres)
        self.assertEqual((a.statut, a.amendement), ("NEEDS_REVIEW", None))
        self.assertIn("ne se retrouve pas", a.motif)

    def test_adopte_avec_modification_en_revue(self):
        self.assertEqual(self.attribuer([amendement("COM-1", sort="adopte_modifie")]).statut, "NEEDS_REVIEW")

    def test_sans_candidat_origine_inconnue(self):
        self.assertEqual((self.attribuer([]).origine, self.attribuer([]).statut), ("inconnue", "NEEDS_REVIEW"))
        self.assertIn("aucun amendement connu", self.attribuer(None).motif)

    def test_texte_de_cmp(self):
        a = self.attribuer(None, cmp=True)
        self.assertEqual((a.origine, a.statut, a.amendement), ("compromis_cmp", "VERIFIED", None))


if __name__ == "__main__":
    unittest.main()
