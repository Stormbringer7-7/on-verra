"""Contrat du port Entrepot et règles du registre des identités.

Les classes `Contrat*` sont rejouées sur chaque adaptateur : en mémoire ici, sur Postgres dans
`test_postgres.py`. python3 -m unittest discover tests
"""

import unittest
import uuid

from src.adaptateurs.stockage import EntrepotMemoire
from src.adaptateurs.synthese import SansSynthese
from src.domaine import (Affirmation, EnregistrementSource, IdentiteNative, Methode, Provenance, Statut,
                         Systeme, TypeAffirmation)
from src.identites import RegistreIdentites

PA = IdentiteNative(Systeme.AN, "acteur", "PA720614")
HATVP = IdentiteNative(Systeme.HATVP, "declarant", "12345")


class ContratIdentites:
    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)

    def test_meme_identifiant_meme_entite(self):
        a = self.registre.identifier("personne", PA)
        self.assertEqual(self.registre.identifier("personne", PA), a)
        self.assertEqual(len(self.entrepot.correspondances_de(a)), 1)

    def test_nom_et_dates_jamais_certain(self):
        a = self.registre.identifier("personne", PA)
        c = self.registre.rapprocher("personne", a, HATVP, Methode.NAME_DATE, {"nom": "Exemple", "mandat": "2022-"})
        self.assertEqual(c.statut, Statut.NEEDS_REVIEW)
        self.assertIsNone(self.registre.resoudre(HATVP))
        self.assertEqual([x.id for x in self.entrepot.a_revoir()], [c.id])

    def test_reference_explicite_certaine(self):
        a = self.registre.identifier("dossier", IdentiteNative(Systeme.AN, "dossier", "DLR5L17N1"))
        senat = IdentiteNative(Systeme.SENAT, "dossier", "pjl25-001")
        c = self.registre.rapprocher("dossier", a, senat, Methode.EXPLICIT_REFERENCE, {"senatChemin": "…"})
        self.assertEqual(c.statut, Statut.VERIFIED)
        self.assertEqual(self.registre.resoudre(senat), a)

    def test_conflit_part_en_revue_sans_ecraser(self):
        a = self.registre.identifier("personne", PA)
        b = self.registre.identifier("personne", IdentiteNative(Systeme.AN, "acteur", "PA1"))
        self.registre.rapprocher("personne", a, HATVP, Methode.EXPLICIT_REFERENCE, {"lien": "x"})
        c = self.registre.rapprocher("personne", b, HATVP, Methode.EXPLICIT_REFERENCE, {"lien": "y"})
        self.assertEqual(c.statut, Statut.NEEDS_REVIEW)
        self.assertEqual(c.preuve["conflit_avec"], str(a))
        self.assertEqual(self.registre.resoudre(HATVP), a)
        with self.assertRaises(ValueError):
            self.registre.valider(c, "relecteur")

    def test_rapprochement_sans_preuve_refuse(self):
        a = self.registre.identifier("personne", PA)
        with self.assertRaises(ValueError):
            self.registre.rapprocher("personne", a, HATVP, Methode.MANUAL, {})

    def test_validation_et_rejet_audites(self):
        a = self.registre.identifier("personne", PA)
        c = self.registre.rapprocher("personne", a, HATVP, Methode.NAME_DATE, {"nom": "Exemple"})
        self.registre.valider(c, "relecteur")
        self.assertEqual(self.registre.resoudre(HATVP), a)
        self.registre.rejeter(c, "relecteur", "homonyme")
        lien = self.entrepot.correspondances(HATVP)[0]
        self.assertEqual((lien.statut, lien.revu_par, lien.preuve["motif_rejet"]),
                         (Statut.REJECTED, "relecteur", "homonyme"))
        self.assertIsNone(self.registre.resoudre(HATVP))

    def test_rapprochement_idempotent(self):
        a = self.registre.identifier("personne", PA)
        c1 = self.registre.rapprocher("personne", a, HATVP, Methode.NAME_DATE, {"nom": "Exemple"})
        c2 = self.registre.rapprocher("personne", a, HATVP, Methode.NAME_DATE, {"nom": "Exemple"})
        self.assertEqual(c1.id, c2.id)


class ContratEntrepot:
    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)

    def source(self, empreinte="abc"):
        id_, _ = self.entrepot.enregistrer_source(
            EnregistrementSource(Systeme.AN, "acteurs.json.zip", "json/acteur/PA1.json", empreinte))
        return Provenance(id_, "/acteur")

    def test_empreinte_deja_vue_pas_de_doublon(self):
        brut = EnregistrementSource(Systeme.AN, "acteurs.json.zip", "json/acteur/PA1.json", "abc")
        id1, nouveau1 = self.entrepot.enregistrer_source(brut)
        id2, nouveau2 = self.entrepot.enregistrer_source(brut)
        self.assertEqual((id1, nouveau1, nouveau2), (id2, True, False))
        _, nouveau3 = self.entrepot.enregistrer_source(EnregistrementSource(
            Systeme.AN, "acteurs.json.zip", "json/acteur/PA1.json", "def"))
        self.assertTrue(nouveau3)              # nouvelle version : l'ancienne reste

    def test_ecrire_puis_lire(self):
        p = self.registre.identifier("personne", PA)
        self.entrepot.ecrire("personne", p, {"nom": "Exemple", "nom_affiche": "Camille Exemple"}, self.source())
        self.assertEqual(self.entrepot.lire("personne", p)["nom_affiche"], "Camille Exemple")

    def test_reecriture_identique_sans_historique_puis_changement_historise(self):
        p = self.registre.identifier("personne", PA)
        valeurs = {"nom": "Exemple", "nom_affiche": "Camille Exemple"}
        self.entrepot.ecrire("personne", p, valeurs, self.source("v1"))
        self.entrepot.ecrire("personne", p, valeurs, self.source("v1"))
        self.assertEqual(self.historique(p), [])
        self.entrepot.ecrire("personne", p, {**valeurs, "nom_affiche": "Camille Exemple-Modèle"}, self.source("v2"))
        self.assertEqual([h["nom_affiche"] for h in self.historique(p)], ["Camille Exemple"])
        self.assertEqual(self.entrepot.lire("personne", p)["nom_affiche"], "Camille Exemple-Modèle")

    def test_completer_un_champ_vide_n_est_pas_un_changement(self):
        p = self.registre.identifier("personne", PA)
        self.entrepot.ecrire("personne", p, {"nom": "Exemple", "nom_affiche": "C. Exemple"}, self.source("v1"))
        self.entrepot.ecrire("personne", p, {"nom": "Exemple", "nom_affiche": "C. Exemple", "prenom": "Camille"},
                             self.source("v2"))
        self.assertEqual(self.historique(p), [])
        self.assertEqual(self.entrepot.lire("personne", p)["prenom"], "Camille")

    def test_ecriture_exige_une_provenance_connue(self):
        p = self.registre.identifier("personne", PA)
        with self.assertRaises(Exception):
            self.entrepot.ecrire("personne", p, {"nom": "Exemple", "nom_affiche": "E"}, Provenance(uuid.uuid4()))

    def test_ecriture_dans_le_mauvais_type_refusee(self):
        p = self.registre.identifier("personne", PA)
        with self.assertRaises(KeyError):
            self.entrepot.ecrire("dossier", p, {"titre": "x"}, self.source())

    def test_transaction_annulee(self):
        with self.assertRaises(RuntimeError), self.registre.transaction():
            self.registre.identifier("personne", PA)
            raise RuntimeError
        self.assertIsNone(self.registre.resoudre(PA))

    def test_dependants_remplaces_en_bloc(self):
        prov = self.source()
        a = self.registre.identifier("personne", PA)
        b = self.registre.identifier("personne", IdentiteNative(Systeme.AN, "acteur", "PA2"))
        d = self.registre.identifier("dossier", IdentiteNative(Systeme.AN, "dossier", "DLR1"))
        self.entrepot.ecrire("dossier", d, {"titre": "Fin de vie"}, prov)
        for p in (a, b):
            self.entrepot.ecrire("personne", p, {"nom": "X", "nom_affiche": "X"}, prov)
        self.entrepot.remplacer_dependants("lien", {"de_id": d, "nature": "rapporteur"},
                                           [{"vers_id": a, "ordre": 1}, {"vers_id": b, "ordre": 2}], prov)
        self.entrepot.remplacer_dependants("lien", {"de_id": d, "nature": "rapporteur"}, [{"vers_id": b, "ordre": 1}],
                                           prov)
        restants = self.entrepot.dependants("lien", {"de_id": d, "nature": "rapporteur"})
        self.assertEqual([(l["vers_id"], l["source_id"]) for l in restants], [(b, prov.source_id)])

    def test_relecture_retire_les_absents_sans_supprimer(self):
        prov = self.source()
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
        d = self.registre.identifier("dossier", AN("dossier", "DLR1"))
        self.entrepot.ecrire("dossier", d, {"titre": "Fin de vie"}, prov)
        v = self.registre.identifier("version_texte", AN("version_texte", "T1"))
        self.entrepot.ecrire("version_texte", v, {"dossier_id": d, "nature": "depose", "chambre": "AN",
                                                  "format": "html_an"}, prov)
        a1, a2 = (self.registre.identifier("version_article", AN("article", f"T1#{n}")) for n in ("1", "2"))
        for a, n in ((a1, "1"), (a2, "2")):
            self.entrepot.ecrire("version_article", a, {"version_texte_id": v, "numero": n, "ordre": 0, "texte": "x",
                                                        "empreinte": "e"}, prov)
        # relecture : le texte ne donne plus que l'article 1
        self.assertEqual(self.entrepot.retirer_absents("version_article", "version_texte_id", v, {a1}), 1)
        self.assertEqual(self.entrepot.retirees("version_article"), {a2})
        self.assertIsNotNone(self.entrepot.lire("version_article", a2))      # marquée, pas supprimée
        # il réapparaît : il n'est plus retiré
        self.assertEqual(self.entrepot.retirer_absents("version_article", "version_texte_id", v, {a1, a2}), 0)
        self.assertEqual(self.entrepot.retirees("version_article"), set())

    def test_affirmation_enregistree(self):
        d = self.registre.identifier("dossier", IdentiteNative(Systeme.AN, "dossier", "DLR1"))
        self.entrepot.ecrire("dossier", d, {"titre": "Fin de vie"}, self.source())
        self.entrepot.ajouter_affirmation(Affirmation("dossier", d, "concerne", {"x": 1}, TypeAffirmation.INFERENCE,
                                                      "RULE", [self.source()]))


class Memoire(ContratIdentites, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)


class EntrepotMemoireContrat(ContratEntrepot, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)

    def historique(self, entite_id):
        return [v for (e, _, v, _) in self.entrepot.historique if e == entite_id]


class Analyse(unittest.TestCase):
    def test_affirmation_sans_preuve_refusee(self):
        with self.assertRaises(ValueError):
            Affirmation("dossier", uuid.uuid4(), "synthese", {"texte": "…"}, TypeAffirmation.SYNTHESE, "LLM", [])

    def test_sans_synthese(self):
        self.assertIsNone(SansSynthese().synthese("dossier", uuid.uuid4(), [("texte", Provenance(uuid.uuid4()))]))

    def test_identifiant_textuel_obligatoire(self):
        with self.assertRaises(ValueError):
            IdentiteNative(Systeme.AN, "acteur", 720614)


if __name__ == "__main__":
    unittest.main()
