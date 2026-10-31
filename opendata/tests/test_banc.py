"""Banc de revue (app interne) : décider un cas, juger une synthèse, et ne jamais écrire depuis
une autre origine ou sous un autre nom d'hôte. python3 -m unittest discover tests
"""

import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import HTTPServer
from pathlib import Path

from src import revue
from src.adaptateurs.stockage import EntrepotMemoire
from src.banc import Banc, charger_lots, gestionnaire
from src.chargement import ContexteCanon, ecrire
from src.domaine import EnregistrementSource, Systeme
from src.domaine.objets import CasRevue
from src.identites import RegistreIdentites

SYNTHESE = {"id": "lot1-a", "lot": "lot1", "type": "amendement", "libelle": "n° 12", "synthese": "Supprime l'article.",
            "empreinte": "e1", "dispositif": "Supprimer cet article.", "expose": "…", "regles": False}


class BancTest(unittest.TestCase):
    def setUp(self):
        self.entrepot = EntrepotMemoire()
        registre = RegistreIdentites(self.entrepot)
        source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
        ecrire(ContexteCanon(self.entrepot, registre, {}, {}),
               CasRevue("amendement_introuvable", "amendement_cite:AN:RU1:12", "constat", "introuvable"), source, None)
        self.banc = Banc(self.entrepot, registre, {SYNTHESE["id"]: SYNTHESE})

    def test_decider_applique(self):
        d = self.banc.decider({"cle": "amendement_cite:AN:RU1:12", "choix": None, "par": " relecteur ", "motif": ""})
        self.assertEqual((d["cas"]["statut"], d["cas"]["decide_par"], d["cas"]["decision"]["motif"]),
                         ("APPLIQUE", "relecteur", None))

    def test_decider_sans_nom_ou_choix_impossible(self):
        with self.assertRaises(ValueError):
            self.banc.decider({"cle": "amendement_cite:AN:RU1:12", "choix": None, "par": " "})
        with self.assertRaises(ValueError):
            self.banc.decider({"cle": "amendement_cite:AN:RU1:12", "choix": 0, "par": "x"})   # constat
        self.assertEqual(self.entrepot.cas("amendement_cite:AN:RU1:12")["statut"], "A_REVOIR")

    def test_juger_vaut_pour_l_empreinte(self):
        self.banc.juger({"synthese_id": "lot1-a", "empreinte": "e1", "verdict": "infidele", "commentaire": " inversé ", "par": "x"})
        self.assertEqual(self.banc.liste_syntheses()["jugements"]["lot1-a"]["commentaire"], "inversé")
        with self.assertRaises(KeyError):          # page ouverte avant la réécriture de la synthèse
            self.banc.juger({"synthese_id": "lot1-a", "empreinte": "e0", "verdict": "fidele", "par": "x"})
        with self.assertRaises(ValueError):
            self.banc.juger({"synthese_id": "lot1-a", "empreinte": "e1", "verdict": "oui", "par": "x"})
        # la synthèse est réécrite : l'ancien jugement ne vaut plus
        self.banc.syntheses["lot1-a"] = {**SYNTHESE, "empreinte": "e2"}
        self.assertEqual(self.banc.liste_syntheses()["jugements"], {})

    def test_lots_lus_et_verifies(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(charger_lots(Path(d) / "absent"), {})
            (Path(d) / "lot1.json").write_text(json.dumps([SYNTHESE]))
            self.assertEqual(list(charger_lots(Path(d))), ["lot1-a"])
            (Path(d) / "lot2.json").write_text(json.dumps([SYNTHESE]))
            with self.assertRaisesRegex(ValueError, "en double"):
                charger_lots(Path(d))

    def test_http_refuse_autre_hote_et_autre_origine(self):
        serveur = HTTPServer(("127.0.0.1", 0), gestionnaire(self.banc, set()))
        hote = f"127.0.0.1:{serveur.server_port}"
        serveur.RequestHandlerClass = gestionnaire(self.banc, {hote})
        threading.Thread(target=serveur.serve_forever, daemon=True).start()
        self.addCleanup(serveur.shutdown)

        def requete(methode, chemin, corps=None, **entetes):
            cx = HTTPConnection("127.0.0.1", serveur.server_port)
            cx.request(methode, chemin, json.dumps(corps) if corps is not None else None,
                       {"Host": hote, "Content-Type": "application/json", **entetes})
            r = cx.getresponse()
            return r.status, r.read()

        corps = {"synthese_id": "lot1-a", "empreinte": "e1", "verdict": "fidele", "par": "x"}
        self.assertEqual(requete("GET", "/api/etat", Host="banc.example:80")[0], 403)
        self.assertEqual(requete("POST", "/api/juger", corps, Origin="https://ailleurs.example")[0], 403)
        self.assertEqual(requete("POST", "/api/juger", corps, **{"Content-Type": "text/plain"})[0], 403)
        self.assertEqual(self.entrepot.jugements_syntheses(), [])
        self.assertEqual(requete("POST", "/api/juger", corps, Origin=f"http://{hote}")[0], 200)
        statut, page = requete("GET", "/")
        self.assertEqual((statut, b"Banc de revue" in page), (200, True))
        statut, cas = requete("GET", "/api/cas?statut=A_REVOIR")
        self.assertEqual((statut, json.loads(cas)["cas"][0]["cle"]), (200, "amendement_cite:AN:RU1:12"))
        self.assertEqual(requete("GET", "/api/cas?decalage=x")[0], 400)


if __name__ == "__main__":
    unittest.main()
