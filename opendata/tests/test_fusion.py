"""Fusion d'entités : sur décision de revue ou référence explicite sourcée ; toutes les références suivent, rien n'est perdu.

Le contrat est rejoué sur les deux adaptateurs : en mémoire, et sur Postgres (base d'essais de
`test_postgres.py`) dans ce même fichier. python3 -m unittest discover tests
"""

import unittest
from datetime import date

from src import revue
from src.adaptateurs.sources import rne
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, charger_decisions, ecrire
from src.domaine import EnregistrementSource, IdentiteNative, Methode, Statut, Systeme
from src.domaine.objets import Candidat, CasRevue, Dependants, Objet, Rapprochement
from src.identites import RegistreIdentites
from tests.test_postgres import CX, remettre_a_zero
from tests.test_sources_rne import DEPUTES, annuaire, depute, doc

AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
SENAT = lambda t, i: IdentiteNative(Systeme.SENAT, t, i)
DOSSIER_AN, DOSSIER_SENAT = AN("dossier", "DLR5L17N1"), SENAT("dossier", "ppl25-940")


class ContratFusion:
    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)
        self.ctx = ContexteCanon(self.entrepot, self.registre, {}, {})
        self.source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
        for pa, nom in (("PA795386", "Mathieu Lefèvre"), ("PA330008", "Xavier Breton")):
            self.ecrire(Objet("personne", AN("acteur", pa), {"nom": nom, "nom_affiche": nom}))

    def ecrire(self, *elements):
        for e in elements:
            ecrire(self.ctx, e, self.source, None)

    def bloquants(self):
        return {c["nom"]: c["exemples"] for c in self.entrepot.controles() if c["bloquant"] and c["nombre"]}

    def dossiers_separes(self):
        """Un dossier créé côté Sénat (non cité par l'AN), puis l'AN le cite lors d'une navette ultérieure."""
        self.ecrire(Objet("dossier", DOSSIER_SENAT, {"titre": "Proposition de loi visant à protéger les enfants",
                                                       "date_depot": date(2025, 9, 1)}),
                    Objet("etape", SENAT("etape", "ppl25-940#1"), {"dossier_id": DOSSIER_SENAT, "type": "depot",
                                                                   "ordre": 1, "chambre": "SENAT"}),
                    Dependants("lien", {"de_id": DOSSIER_SENAT, "nature": "rapporteur"},
                               [{"vers_id": AN("acteur", "PA330008"), "ordre": 1}]),
                    Objet("dossier", DOSSIER_AN, {"titre": "Protéger les enfants"}),
                    Dependants("lien", {"de_id": DOSSIER_AN, "nature": "rapporteur"},
                               [{"vers_id": AN("acteur", "PA330008"), "ordre": 1}]))
        return self.registre.resoudre(DOSSIER_AN), self.registre.resoudre(DOSSIER_SENAT)

    def test_dossier_senat_cite_ensuite_par_l_an(self):
        # Référence explicite (l'AN cite le signet) vers l'identité propre du dossier créé côté
        # Sénat : même dossier, fusion sans revue ; la preuve est la référence et sa source.
        a, b = self.dossiers_separes()
        self.ecrire(Rapprochement("dossier", DOSSIER_AN, DOSSIER_SENAT, Methode.EXPLICIT_REFERENCE,
                                  {"senatChemin": "http://www.senat.fr/dossier-legislatif/ppl25-940.html"}))
        self.assertEqual(self.entrepot.cas_revue("correspondance_a_revoir"), [])
        # l'identité Sénat désigne le dossier AN ; tout ce qui visait le dossier Sénat aussi
        self.assertEqual(self.registre.resoudre(DOSSIER_SENAT), a)
        self.assertEqual(self.entrepot.lire("etape", self.registre.resoudre(SENAT("etape", "ppl25-940#1")))["dossier_id"], a)
        self.assertEqual([l["vers_id"] for l in self.entrepot.dependants("lien", {"de_id": a})],
                         [self.registre.resoudre(AN("acteur", "PA330008"))])  # doublon historisé, pas dupliqué
        self.assertEqual(self.entrepot.dependants("lien", {"de_id": b}), [])
        # l'absorbée est gardée, marquée ; ses correspondances révisées, jamais supprimées
        self.assertEqual(self.entrepot.fusionnee_dans(b), a)
        self.assertIn(b, self.entrepot.retirees("dossier"))
        self.assertEqual(self.entrepot.lire("dossier", b)["titre"], "Proposition de loi visant à protéger les enfants")
        liens = {c.entite_id: c for c in self.entrepot.correspondances(DOSSIER_SENAT)}
        self.assertEqual((liens[b].statut, liens[b].preuve["fusionnee_dans"]), (Statut.REJECTED, str(a)))
        self.assertEqual((liens[a].statut, liens[a].methode, liens[a].preuve["reference"]),
                         (Statut.VERIFIED, Methode.EXPLICIT_REFERENCE, str(DOSSIER_SENAT)))
        # valeurs : celles de l'AN gagnent, un champ vide est complété, l'écart est consigné
        self.assertEqual(self.entrepot.lire("dossier", a)["titre"], "Protéger les enfants")
        self.assertEqual(self.entrepot.lire("dossier", a)["date_depot"], date(2025, 9, 1))
        (conflit,) = self.entrepot.cas_revue("conflit_fusion")
        self.assertEqual(conflit["contexte"]["conflits"]["titre"],
                         {"gardee": "Protéger les enfants", "ecartee": "Proposition de loi visant à protéger les enfants"})
        self.assertEqual(self.bloquants(), {})
        # rechargement : le Sénat réécrit son dossier, sur l'entité gardée ; la référence se rejoue sans effet
        self.ecrire(Objet("dossier", DOSSIER_SENAT, {"titre": "Proposition de loi visant à protéger les enfants"}),
                    Rapprochement("dossier", DOSSIER_AN, DOSSIER_SENAT, Methode.EXPLICIT_REFERENCE, {"senatChemin": "…"}))
        self.assertEqual(self.registre.resoudre(DOSSIER_SENAT), a)
        self.assertEqual(len(self.entrepot.correspondances(DOSSIER_SENAT)), 2)
        self.assertEqual(self.bloquants(), {})

    def test_amo_cite_la_fiche_senat_fusion_sans_revue(self):
        # AMO, PA794906 : adresse type 23 « https://www.senat.fr/senateur/amard_gabriel20684b.html »
        # (Gabriel Amard, député jusqu'au 30/09/2026, sénateur ensuite : ODSEN_GENERAL 20684B)
        self.ecrire(Objet("personne", AN("acteur", "PA794906"), {"nom": "Amard", "nom_affiche": "Gabriel Amard"}),
                    Objet("personne", SENAT("senateur", "20684B"), {"civilite": "M.", "nom": "Amard",
                                                                    "nom_affiche": "Gabriel Amard"}),
                    Objet("fonction", SENAT("mandat_senateur", "1"), {"personne_id": SENAT("senateur", "20684B"),
                                                                      "type": "senateur", "titre": "Sénateur"}))
        a, b = (self.registre.resoudre(x) for x in (AN("acteur", "PA794906"), SENAT("senateur", "20684B")))
        self.ecrire(Rapprochement("personne", AN("acteur", "PA794906"), SENAT("senateur", "20684B"),
                                  Methode.EXPLICIT_REFERENCE, {"champ": "adresses/adresse[type=23]/valElec"}))
        self.assertEqual(self.registre.resoudre(SENAT("senateur", "20684B")), a)
        self.assertEqual(self.entrepot.fusionnee_dans(b), a)
        mandat = self.registre.resoudre(SENAT("mandat_senateur", "1"))
        self.assertEqual(self.entrepot.lire("fonction", mandat)["personne_id"], a)   # la frise est réunie
        self.assertEqual(self.entrepot.lire("personne", a)["civilite"], "M.")        # champ vide complété
        self.assertEqual(self.bloquants(), {})
        # un second acteur qui citerait le même matricule : déjà relié par référence, pas l'identité
        # propre d'une autre fiche → revue, jamais de fusion en chaîne
        self.ecrire(Rapprochement("personne", AN("acteur", "PA795386"), SENAT("senateur", "20684B"),
                                  Methode.EXPLICIT_REFERENCE, {"champ": "adresses/adresse[type=23]/valElec"}))
        self.assertEqual(self.registre.resoudre(SENAT("senateur", "20684B")), a)
        self.assertEqual(len(self.entrepot.cas_revue("correspondance_a_revoir")), 1)
        self.assertIsNone(self.entrepot.fusionnee_dans(self.registre.resoudre(AN("acteur", "PA795386"))))
        self.assertEqual(self.bloquants(), {})

    def test_membre_du_gouvernement_aucun_puis_relie(self):
        # cri/d20261022.xml : <cri:intervenant mat="20872D" nom="Mathieu LEF&#200;VRE" type="2">
        sujet = SENAT("membre_gouvernement", "20872D")
        cas = CasRevue("identite_membre_gouvernement", "identite_membre_gouvernement:20872D", "identite", "x",
                       sujet=("personne", sujet),
                       candidats=(Candidat("personne", AN("acteur", "PA795386"), "Mathieu Lefèvre"),),
                       contexte={"si_aucun": {"type": "personne", "valeurs": {
                           "civilite": "M.", "nom": "Mathieu LEFÈVRE", "nom_affiche": "Mathieu LEFÈVRE"}}})
        self.ecrire(cas, Objet("reunion", SENAT("reunion", "d20261022"), {"type": "seance", "chambre": "SENAT"}))
        revue.decider(self.entrepot, self.registre, cas.cle, None, "relecteur")     # « aucun » : créée côté Sénat
        b = self.registre.resoudre(sujet)
        self.ecrire(Objet("intervention", SENAT("intervention", "d20261022#int_16"), {
            "reunion_id": SENAT("reunion", "d20261022"), "ordre": 16, "orateur_id": sujet,
            "orateur_libelle": "M. Mathieu Lefèvre", "texte": "…", "empreinte": "e"}))
        # la relectrice revient sur sa décision : c'est l'acteur AN
        revue.decider(self.entrepot, self.registre, cas.cle, 0, "relectrice", "fiche du Gouvernement")
        a = self.registre.resoudre(AN("acteur", "PA795386"))
        self.assertEqual(self.registre.resoudre(sujet), a)
        i = self.registre.resoudre(SENAT("intervention", "d20261022#int_16"))
        self.assertEqual(self.entrepot.lire("intervention", i)["orateur_id"], a)
        (c,) = [c for c in self.entrepot.correspondances(sujet) if c.certaine]
        self.assertEqual((c.entite_id, c.methode, c.preuve["cas"], c.preuve["decide_par"]),
                         (a, Methode.MANUAL, cas.cle, "relectrice"))
        self.assertEqual(self.entrepot.fusionnee_dans(b), a)
        self.assertEqual(self.bloquants(), {})

    def test_personne_rne_fusionnee_avec_un_parlementaire(self):
        # elus_deputes_dep_csv.csv : circonscription 0101, BRETON Xavier ; AMO : PA330008
        cle_cas = f"elu_local:{rne.cle('depute', depute())}"
        an = {"xavier breton": [{"acteur": "PA330008", "libelle": "Xavier Breton", "depute": True,
                                 "membre_gouvernement": False}]}
        charger = lambda: [self.ecrire(e) for e in rne.mandat(doc(DEPUTES, depute()), annuaire(an=an))]
        charger()
        revue.decider(self.entrepot, self.registre, cle_cas, None, "relecteur")     # « aucun » : RNE:personne:…
        identite_b = IdentiteNative(Systeme.RNE, "personne", rne.cle("depute", depute()))
        b = self.registre.resoudre(identite_b)
        mandat = self.registre.resoudre(IdentiteNative(Systeme.RNE, "mandat", rne.cle("depute", depute())))
        self.assertEqual(self.entrepot.lire("mandat_rne", mandat)["personne_id"], b)
        # une personne relit : c'est le député ; la fusion est tracée par un cas fusion_entites
        cas = revue.fusionner(self.entrepot, self.registre, "personne", identite_b, AN("acteur", "PA330008"),
                              "relectrice", "même circonscription, même date, fiche AN")
        a = self.registre.resoudre(AN("acteur", "PA330008"))
        self.assertEqual((cas["statut"], self.registre.resoudre(identite_b)), ("APPLIQUE", a))
        self.assertEqual(self.entrepot.lire("mandat_rne", mandat)["personne_id"], a)
        # les décisions qui visaient la personne RNE restent valides : elles désignent l'acteur
        self.ctx.decisions = charger_decisions(self.entrepot, self.registre)
        charger()
        self.assertEqual(self.entrepot.lire("mandat_rne", mandat)["personne_id"], a)
        self.assertEqual(self.bloquants(), {})
        # rejouer la commande ne fait rien
        revue.fusionner(self.entrepot, self.registre, "personne", identite_b, AN("acteur", "PA330008"), "relectrice")
        self.assertEqual(len(self.entrepot.correspondances(identite_b)), 2)

    def test_reference_d_une_autre_entite_pas_une_fusion(self):
        # 1 cas réel : pjl24-869 cité par deux dossiers AN ; choisir l'un rejette le lien de l'autre
        a = self.registre.identifier("dossier", AN("dossier", "DLR5L17N54218"))
        b = self.registre.identifier("dossier", AN("dossier", "DLR5L17N52599"))
        senat = SENAT("dossier", "pjl24-869")
        for d in (b, a):
            self.registre.rapprocher("dossier", d, senat, Methode.EXPLICIT_REFERENCE, {"senatChemin": "…"})
        self.ecrire(CasRevue("correspondance_a_revoir", f"correspondance_a_revoir:{senat}", "identite", "x",
                             sujet=("dossier", senat), candidats=(Candidat("dossier", AN("dossier", "DLR5L17N54218")),)))
        revue.decider(self.entrepot, self.registre, f"correspondance_a_revoir:{senat}", 0, "relectrice")
        self.assertEqual(self.registre.resoudre(senat), a)
        self.assertIsNone(self.entrepot.fusionnee_dans(b))                     # b garde son identité AN
        self.assertEqual(self.registre.resoudre(AN("dossier", "DLR5L17N52599")), b)

    def test_jamais_sans_decision_ni_entre_types(self):
        a, b = self.dossiers_separes()
        with self.assertRaises(ValueError):
            self.registre.fusionner("dossier", b, a, {})
        p = self.registre.resoudre(AN("acteur", "PA330008"))
        with self.assertRaises(KeyError):
            self.registre.fusionner("dossier", b, p, {"cas": "x"})
        # transaction annulée : rien n'a bougé
        self.assertEqual(self.registre.resoudre(DOSSIER_SENAT), b)
        self.assertEqual([c.statut for c in self.entrepot.correspondances(DOSSIER_SENAT)], [Statut.VERIFIED])
        self.assertIsNone(self.entrepot.fusionnee_dans(b))

    def test_fusions_en_chaine_et_controles(self):
        a, b = self.dossiers_separes()
        c = self.registre.identifier("dossier", AN("dossier", "DLR5L17N2"))
        for x, y, cle in ((b, a, "fusion_entites:1"), (a, c, "fusion_entites:2")):
            self.ecrire(CasRevue("fusion_entites", cle, "constat", "x"))
            revue.decider(self.entrepot, self.registre, cle, None, "relectrice")
            self.registre.fusionner("dossier", x, y, {"cas": cle})
        self.assertEqual((self.entrepot.fusionnee_dans(b), self.entrepot.fusionnee_dans(a)), (c, c))
        self.assertEqual(self.registre.resoudre(DOSSIER_SENAT), c)
        self.assertEqual(self.bloquants(), {})
        # une référence posée ensuite vers une entité fusionnée est un invariant violé
        e = self.registre.resoudre(SENAT("etape", "ppl25-940#1"))
        from src.domaine import Provenance
        self.entrepot.corriger("etape", e, {"dossier_id": b}, Provenance(self.source))
        self.assertIn("reference_vers_entite_fusionnee", self.bloquants())


class FusionMemoire(ContratFusion, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class FusionPostgres(ContratFusion, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation, analytique.cas_revue CASCADE")
        return EntrepotPostgres(CX)


if __name__ == "__main__":
    unittest.main()
