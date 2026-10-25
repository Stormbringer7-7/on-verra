"""Revue humaine des rapprochements : rien n'est appliqué sans décision, et la décision tient.

Le contrat est rejoué sur Postgres dans `test_postgres.py`. python3 -m unittest discover tests
"""

import tempfile
import unittest
from pathlib import Path

from src import revue
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, ecrire
from src.domaine import EnregistrementSource, IdentiteNative, Methode, Statut, Systeme
from src.domaine.objets import Candidat, CasRevue, Objet
from src.identites import RegistreIdentites

AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)


class ContratRevue:
    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)
        self.ctx = ContexteCanon(self.entrepot, self.registre, {}, {})
        self.source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
        for pa, nom in (("PA1", "Yannick Monnet"), ("PA2", "Yannick Monnet")):
            ecrire(self.ctx, Objet("personne", AN("acteur", pa), {"nom": nom, "nom_affiche": nom}), self.source, None)
        ecrire(self.ctx, Objet("reunion", AN("reunion", "RU1"), {"type": "commission", "chambre": "AN"}), self.source, None)
        self.intervention = Objet("intervention", AN("intervention", "CRC1#3"), {
            "reunion_id": AN("reunion", "RU1"), "ordre": 3, "orateur_libelle": "M. Yannick Monnet",
            "texte": "Avis défavorable.", "empreinte": "e"})
        ecrire(self.ctx, self.intervention, self.source, None)
        self.cas = CasRevue("orateur_commission", "orateur_commission:RU1:M. Yannick Monnet", "champ",
                            "deux homonymes", champ="orateur_id", cibles=(("intervention", AN("intervention", "CRC1#3")),),
                            candidats=(Candidat("personne", AN("acteur", "PA1"), "Yannick Monnet", {"presence": "présent"}),
                                       Candidat("personne", AN("acteur", "PA2"), "Yannick Monnet", {"presence": "non listé"})))

    def orateur(self):
        i = self.registre.resoudre(AN("intervention", "CRC1#3"))
        return self.entrepot.lire("intervention", i).get("orateur_id")

    def test_rien_sans_decision(self):
        ecrire(self.ctx, self.cas, self.source, None)
        self.assertIsNone(self.orateur())
        (c,) = self.entrepot.cas_revue()
        self.assertEqual((c["statut"], len(c["candidats"]), c["candidats"][0]["indices"]), ("A_REVOIR", 2, {"presence": "présent"}))

    def test_decision_champ_appliquee_et_tenue_au_rechargement(self):
        ecrire(self.ctx, self.cas, self.source, None)
        revue.decider(self.entrepot, self.registre, self.cas.cle, 0, "relecteur", "présent à la réunion")
        pa1 = self.registre.resoudre(AN("acteur", "PA1"))
        self.assertEqual(self.orateur(), pa1)
        # rechargement : l'adaptateur réécrit l'intervention sans orateur ; la décision tient
        from src.chargement import charger_decisions
        self.ctx.decisions = charger_decisions(self.entrepot)
        ecrire(self.ctx, self.intervention, self.source, None)
        ecrire(self.ctx, self.cas, self.source, None)
        self.assertEqual(self.orateur(), pa1)
        (c,) = self.entrepot.cas_revue()
        self.assertEqual((c["statut"], c["decide_par"], c["decision"]["motif"]), ("APPLIQUE", "relecteur", "présent à la réunion"))

    def test_decision_identite_cree_une_correspondance_manuelle(self):
        sujet = IdentiteNative(Systeme.SENAT, "membre_gouvernement", "20872D")
        cas = CasRevue("identite_membre_gouvernement", "identite_membre_gouvernement:20872D", "identite", "x",
                       sujet=("personne", sujet), candidats=(Candidat("personne", AN("acteur", "PA1"), "Y. Monnet"),))
        ecrire(self.ctx, cas, self.source, None)
        self.assertIsNone(self.registre.resoudre(sujet))
        revue.decider(self.entrepot, self.registre, cas.cle, 0, "relecteur")
        self.assertEqual(self.registre.resoudre(sujet), self.registre.resoudre(AN("acteur", "PA1")))
        (c,) = [c for c in self.entrepot.correspondances(sujet)]
        self.assertEqual((c.methode, c.statut, c.preuve["decide_par"]), (Methode.MANUAL, Statut.VERIFIED, "relecteur"))

    def test_aucun_cree_la_personne_telle_que_publiee(self):
        sujet = IdentiteNative(Systeme.SENAT, "membre_gouvernement", "21518R")
        cas = CasRevue("identite_membre_gouvernement", "identite_membre_gouvernement:21518R", "identite", "x",
                       sujet=("personne", sujet), contexte={"si_aucun": {"type": "personne", "valeurs": {
                           "nom": "Serge PAPIN", "nom_affiche": "Serge PAPIN"}}})
        ecrire(self.ctx, cas, self.source, None)
        revue.decider(self.entrepot, self.registre, cas.cle, None, "relecteur")
        self.assertEqual(self.entrepot.lire("personne", self.registre.resoudre(sujet))["nom"], "Serge PAPIN")

    def test_cas_sans_objet_caduc_puis_revu_s_il_revient(self):
        for cle in ("article_sans_numero:T1:0", "article_sans_numero:T1:1", "article_sans_numero:T2:0"):
            ecrire(self.ctx, CasRevue("article_sans_numero", cle, "constat", "x"), self.source, None)
        revue.decider(self.entrepot, self.registre, "article_sans_numero:T1:1", None, "relecteur")
        # relecture de T1 : seul le cas 0 est encore émis
        self.assertEqual(self.entrepot.classer_caducs("article_sans_numero:T1:", {"article_sans_numero:T1:0"}), 0)
        self.assertEqual(self.entrepot.classer_caducs("article_sans_numero:T1:", set()), 1)
        statuts = {c["cle"]: c["statut"] for c in self.entrepot.cas_revue()}
        self.assertEqual(statuts, {"article_sans_numero:T1:0": "CADUC", "article_sans_numero:T1:1": "APPLIQUE",
                                   "article_sans_numero:T2:0": "A_REVOIR"})      # décidé : jamais touché
        ecrire(self.ctx, CasRevue("article_sans_numero", "article_sans_numero:T1:0", "constat", "x"), self.source, None)
        self.assertEqual({c["cle"]: c["statut"] for c in self.entrepot.cas_revue()}["article_sans_numero:T1:0"], "A_REVOIR")

    def test_constat_sans_choix(self):
        cas = CasRevue("amendement_introuvable", "amendement_cite:AN:RU1:12", "constat", "introuvable")
        ecrire(self.ctx, cas, self.source, None)
        with self.assertRaises(ValueError):
            revue.decider(self.entrepot, self.registre, cas.cle, 0, "relecteur")
        revue.decider(self.entrepot, self.registre, cas.cle, None, "relecteur", "numéro mal transcrit")
        self.assertEqual(self.entrepot.cas_revue()[0]["statut"], "APPLIQUE")

    def test_reference_inconnue_consignee(self):
        ecrire(self.ctx, Objet("intervention", AN("intervention", "CRC1#4"), {
            "reunion_id": AN("reunion", "RU1"), "ordre": 4, "orateur_id": AN("acteur", "PA404"),
            "orateur_libelle": "x", "texte": "t", "empreinte": "e"}), self.source, None)
        (c,) = self.entrepot.cas_revue("reference_inconnue")
        self.assertIn("AN:acteur:PA404", c["constat"])

    def test_rapport_complet(self):
        ecrire(self.ctx, self.cas, self.source, None)
        with tempfile.TemporaryDirectory() as d:
            chemin = revue.rapport(self.entrepot, Path(d))
            texte = chemin.read_text()
            self.assertIn("Orateurs des comptes rendus de commission", texte)
            self.assertIn("orateur_commission:RU1:M. Yannick Monnet", texte)
            self.assertTrue((Path(d) / "orateur_commission.csv").exists())


class RevueMemoire(ContratRevue, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)


if __name__ == "__main__":
    unittest.main()


class Controles(unittest.TestCase):
    def test_invariants_sur_donnees_fiables_puis_violation(self):
        e = EntrepotMemoire()
        r = RegistreIdentites(e)
        ctx = ContexteCanon(e, r, {}, {})
        source, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
        ecrire(ctx, Objet("personne", AN("acteur", "PA1"), {"nom": "X", "nom_affiche": "X"}), source, None)
        self.assertFalse([c for c in e.controles() if c["bloquant"] and c["nombre"]])
        # une proposition par nom forcée en VERIFIED : l'invariant doit le voir
        c = r.rapprocher("personne", r.resoudre(AN("acteur", "PA1")), IdentiteNative(Systeme.HATVP, "declarant", "x"),
                         Methode.NAME_DATE, {"nom": "X"})
        c.statut = Statut.VERIFIED
        e.reviser_correspondance(c)
        echecs = {c["nom"] for c in e.controles() if c["bloquant"] and c["nombre"]}
        self.assertIn("correspondance_certaine_par_nom", echecs)
