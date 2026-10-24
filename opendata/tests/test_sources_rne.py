"""RNE : une fiche par mandat telle que publiée, reliée à une personne par la revue seulement.

python3 -m unittest discover tests
"""

import unittest

from src import revue
from src.adaptateurs.sources import rne
from src.adaptateurs.sources.senat.commun import document_ligne
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, charger_decisions, ecrire
from src.domaine import EnregistrementSource, IdentiteNative, Systeme
from src.domaine.objets import CasRevue, Objet
from src.etl import Fichier
from src.identites import RegistreIdentites

MAIRES = "elus_maires_mai_csv.csv"
EPCI = "elus_conseillers_communautaires_epci_csv.csv"
DEPUTES = "elus_deputes_dep_csv.csv"


def maire(**autres):
    return {"Code du département": "01", "Libellé du département": "Ain", "Code de la commune": "01001",
            "Libellé de la commune": "L'Abergement-Clémenciat", "Nom de l'élu": "EVALET TAPONAT", "Prénom de l'élu": "Line",
            "Code sexe": "F", "Libellé de la catégorie socio-professionnelle": "Ingénieur et cadre technique d'entreprise",
            "Date de début du mandat": "2026-03-15", "Date de début de la fonction": "2026-03-23", **autres}


def conseiller(**autres):
    # ligne réelle (livraison du 11/08/2026), sans la date de naissance
    return {"Code du département": "01", "Libellé du département": "Ain", "N° SIREN": "200069193",
            "Libellé de l'EPCI": "Cc De La Dombes", "Code de la commune de rattachement": "01001",
            "Libellé de la commune de rattachement": "L'Abergement-Clémenciat", "Nom de l'élu": "EVALET TAPONAT",
            "Prénom de l'élu": "Line", "Code sexe": "F",
            "Libellé de la catégorie socio-professionnelle": "Ingénieur et cadre technique d'entreprise",
            "Date de début du mandat": "2026-03-15", "Libellé de la fonction": "", "Date de début de la fonction": "",
            **autres}


def depute():
    return {"Code du département": "01", "Libellé du département": "Ain", "Code de la circonscription législative": "0101",
            "Libellé de la circonscription législative": "1Ère Circonscription", "Nom de l'élu": "BRETON",
            "Prénom de l'élu": "Xavier", "Code sexe": "M", "Libellé de la catégorie socio-professionnelle": "",
            "Date de début du mandat": "2024-07-08"}


def doc(nom, l):
    return document_ligne(Fichier(nom, rne.API), nom, rne.cle(rne.TYPE_DE[nom], l), l)


def annuaire(lignes_rne=(), an=None, etablies=None, sieges=None):
    index = {}
    for nom, l in lignes_rne:
        index.setdefault(rne.normaliser(rne.nom_complet(l)), []).append(
            {"cle": rne.cle(rne.TYPE_DE[nom], l), "dep": l.get("Code du département")})
    return rne.Annuaire(an or {}, {}, etablies or {}, sieges or {}, index)


class Analyse(unittest.TestCase):
    def test_cles_locales_stables(self):
        self.assertEqual(rne.cle("maire", maire()), "maire:01001:2026-03-23")
        self.assertEqual(rne.cle("depute", depute()), "depute:0101:2024-07-08")
        self.assertEqual(rne.cle("conseiller_communautaire", conseiller()),
                         "conseiller_communautaire:200069193:01001:2026-03-15:evalet-taponat:line")

    def test_date_de_naissance_jamais_lue(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / MAIRES
            chemin.write_text("Nom de l'élu;Prénom de l'élu;Date de naissance\nX;Y;1967-07-22\n", encoding="utf-8")
            (l,) = rne.lignes(chemin)
        self.assertNotIn("Date de naissance", l)
        self.assertNotIn("1967", doc(MAIRES, maire()).octets.decode())

    def test_fiche_seule_sans_homonyme(self):
        elements = list(rne.mandat(doc(MAIRES, maire()), annuaire()))
        (m,) = elements
        self.assertEqual((m.type, m.valeurs["organisation_id"], m.valeurs["personne_id"]),
                         ("mandat_rne", IdentiteNative(Systeme.INSEE, "commune", "01001"), None))

    def test_homonyme_du_departement_en_revue(self):
        lignes = [(MAIRES, maire()), (EPCI, conseiller())]
        elements = list(rne.mandat(doc(MAIRES, maire()), annuaire(lignes)))
        cas = elements[-1]
        self.assertIsInstance(cas, CasRevue)
        self.assertEqual((cas.type, cas.nature, cas.champ, cas.contexte["priorite"]), ("elu_local", "champ", "personne_id", 2))
        self.assertEqual(cas.contexte["mandats_homonymes"], [rne.cle("conseiller_communautaire", conseiller())])

    def test_depute_meme_siege_indice_pas_preuve(self):
        an = {"xavier breton": [{"acteur": "PA330008", "libelle": "Xavier Breton", "depute": True,
                                 "membre_gouvernement": False}]}
        elements = list(rne.mandat(doc(DEPUTES, depute()), annuaire(an=an, sieges={("0101", "2024-07-08"): "PA330008"})))
        m, cas = elements
        self.assertIsNone(m.valeurs["personne_id"])           # jamais relié par le code
        self.assertEqual((cas.contexte["priorite"], cas.candidats[0].indices["meme_siege_meme_date"]), (1, True))


class ContratRevueRne:
    """De bout en bout : « aucun » crée la personne, l'autre mandat la retrouve. Rejoué sur
    Postgres dans `test_postgres.py`."""

    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)
        self.ctx = ContexteCanon(self.entrepot, self.registre, {}, {})
        self.source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.RNE, "x", "y", "z"))
        ecrire(self.ctx, Objet("organisation", IdentiteNative(Systeme.INSEE, "commune", "01001"),
                               {"type": "commune", "nom": "L'Abergement-Clémenciat"}), self.source, None)
        ecrire(self.ctx, Objet("organisation", IdentiteNative(Systeme.INSEE, "departement", "01"),
                               {"type": "departement", "nom": "Ain"}), self.source, None)
        ecrire(self.ctx, Objet("organisation", IdentiteNative(Systeme.INSEE, "siren", "200069193"),
                               {"type": "epci", "nom": "Cc De La Dombes"}), self.source, None)
        self.lignes = [(MAIRES, maire()), (EPCI, conseiller())]

    def charger(self, nom, l):
        a = annuaire(self.lignes, etablies=rne.personnes_etablies(self.entrepot))
        self.ctx.decisions = charger_decisions(self.entrepot, self.registre)
        for e in rne.mandat(doc(nom, l), a):
            ecrire(self.ctx, e, self.source, None)

    def personne_de(self, nom, l):
        m = self.registre.resoudre(IdentiteNative(Systeme.RNE, "mandat", rne.cle(rne.TYPE_DE[nom], l)))
        return self.entrepot.lire("mandat_rne", m)["personne_id"]

    def test_regroupement_par_revue(self):
        self.charger(MAIRES, maire())
        self.charger(EPCI, conseiller())
        self.assertIsNone(self.personne_de(MAIRES, maire()))
        self.assertEqual({c["nom"]: c["nombre"] for c in self.entrepot.controles()}["elu_relie_sans_revue"], 0)
        # « aucun » sur le mandat de maire : une personne est créée, telle que publiée
        revue.decider(self.entrepot, self.registre, f"elu_local:{rne.cle('maire', maire())}", None, "relecteur")
        p = self.personne_de(MAIRES, maire())
        self.assertEqual(self.entrepot.lire("personne", p)["nom_affiche"], "Line EVALET TAPONAT")
        # rechargement : le mandat EPCI propose désormais cette personne ; la relectrice la choisit
        self.charger(EPCI, conseiller())
        cle_epci = f"elu_local:{rne.cle('conseiller_communautaire', conseiller())}"
        (cas,) = [c for c in self.entrepot.cas_revue("elu_local") if c["cle"] == cle_epci]
        self.assertEqual(len(cas["candidats"]), 1)
        revue.decider(self.entrepot, self.registre, cle_epci, 0, "relectrice", "même nom, CSP et commune")
        self.assertEqual(self.personne_de(EPCI, conseiller()), p)
        # la décision tient quand le RNE est relu
        self.charger(MAIRES, maire())
        self.charger(EPCI, conseiller())
        self.assertEqual((self.personne_de(MAIRES, maire()), self.personne_de(EPCI, conseiller())), (p, p))
        controles = {c["nom"]: c["nombre"] for c in self.entrepot.controles()}
        self.assertEqual((controles["elu_relie_sans_revue"], controles["decision_non_appliquee"]), (0, 0))


class RevueRneMemoire(ContratRevueRne, unittest.TestCase):
    def fabrique(self):
        return EntrepotMemoire()


if __name__ == "__main__":
    unittest.main()
