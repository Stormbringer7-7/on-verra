"""Signatures du banc de revue : Ed25519 conforme à la RFC 8032, requêtes refusées dès qu'un octet,
la date, le nonce ou le rôle ne va pas, et clés du service acceptées seulement signées en GPG par
un admin de confiance. python3 -m unittest discover tests
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from src.adaptateurs.stockage import EntrepotMemoire
from src.banc import signature as sig
from src.banc.signature import Cle, Refus, Verificateur

# RFC 8032, §7.1, TEST 1 et TEST 2 : (clé secrète, clé publique, message, signature)
VECTEURS = [
    ("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
     "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
     "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
     "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
     "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
]
# l'heure réelle : l'entrepot oublie les nonces expirés d'après sa propre horloge
MAINTENANT = datetime.now(timezone.utc).replace(microsecond=0)


class Ed25519(unittest.TestCase):
    def test_vecteurs_rfc_8032(self):
        for secrete, publique, message, signature in VECTEURS:
            privee = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(secrete))
            self.assertEqual(sig.publique_de(privee).hex(), publique)
            self.assertEqual(privee.sign(bytes.fromhex(message)).hex(), signature)

    def test_paire_creee_lisible_par_son_seul_proprietaire(self):
        with tempfile.TemporaryDirectory() as d:
            fichier = Path(d) / "x" / "moi.pem"
            publique = sig.creer_paire(fichier)
            self.assertEqual(fichier.stat().st_mode & 0o777, 0o600)
            self.assertEqual(sig.publique_de(sig.lire_privee(fichier)), publique)
            with self.assertRaises(FileExistsError):       # jamais une clé écrasée
                sig.creer_paire(fichier)


class Requetes(unittest.TestCase):
    def setUp(self):
        self.privee = Ed25519PrivateKey.generate()
        publique = sig.publique_de(self.privee)
        self.cle = Cle("Relecteur", "relecteur", publique, "GPG")
        self.verif = Verificateur({self.cle.empreinte: self.cle}, EntrepotMemoire(), lambda: MAINTENANT)
        self.corps = json.dumps({"reponse": "fidele"}).encode()

    def signer(self, **k):
        return sig.signer_requete(self.privee, "POST", "/reponses", self.corps, k.pop("maintenant", MAINTENANT), **k)

    def refus(self, entetes, corps=None, chemin="/reponses", **k) -> str:
        with self.assertRaises(Refus) as r:
            self.verif.verifier("POST", chemin, entetes, self.corps if corps is None else corps, **k)
        return r.exception.code

    def test_signee_acceptee_une_seule_fois(self):
        entetes = self.signer()
        self.assertEqual(self.verif.verifier("POST", "/reponses", entetes, self.corps), self.cle)
        self.assertEqual(self.refus(entetes), "nonce_rejoue")

    def test_toute_alteration_refusee(self):
        self.assertEqual(self.refus(self.signer(), corps=self.corps + b" "), "signature_invalide")
        self.assertEqual(self.refus(self.signer(), chemin="/arbitrages"), "signature_invalide")
        decalee = (MAINTENANT + timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertEqual(self.refus({**self.signer(), "X-Revue-Date": decalee}), "signature_invalide")
        self.assertEqual(self.refus({**self.signer(), "X-Revue-Signature": "pas du base64 !"}), "signature_invalide")

    def test_date_nonce_cle_role(self):
        self.assertEqual(self.refus(self.signer(maintenant=MAINTENANT - timedelta(minutes=6))), "date_hors_delai")
        self.assertEqual(self.refus(self.signer(maintenant=MAINTENANT + timedelta(minutes=6))), "date_hors_delai")
        self.assertEqual(self.refus(self.signer(nonce="court")), "nonce_invalide")
        self.assertEqual(self.refus({k: v for k, v in self.signer().items() if k != "X-Revue-Nonce"}), "non_signee")
        autre = sig.signer_requete(Ed25519PrivateKey.generate(), "POST", "/reponses", self.corps, MAINTENANT)
        self.assertEqual(self.refus(autre), "cle_inconnue")
        self.assertEqual(self.refus(self.signer(), roles=("admin",)), "role_insuffisant")

    def test_refus_sans_bruler_le_nonce(self):
        # une requête au rôle insuffisant ne consomme pas son nonce ; une signature fausse non plus
        entetes = self.signer()
        self.refus({**entetes, "X-Revue-Signature": sig.b64(b"\0" * 64)})
        self.refus(entetes, roles=("admin",))
        self.verif.verifier("POST", "/reponses", entetes, self.corps)


@unittest.skipIf(shutil.which("gpg") is None, "gpg absent")
class InscriptionGpg(unittest.TestCase):
    """Une vraie clé GPG jetable, dans un trousseau temporaire."""

    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.TemporaryDirectory()
        cls.maison = Path(cls.dossier.name) / "gnupg"
        cls.maison.mkdir(mode=0o700)
        cls.env = {**os.environ, "GNUPGHOME": str(cls.maison)}
        cls.fpr = {}
        for nom in ("Admin", "Intrus"):
            subprocess.run(["gpg", "--batch", "--passphrase", "", "--quick-gen-key", f"{nom} <{nom.lower()}@essai.invalid>",
                            "ed25519", "sign", "1d"], check=True, capture_output=True, env=cls.env)
            sortie = subprocess.run(["gpg", "--batch", "--with-colons", "--list-keys", f"{nom.lower()}@essai.invalid"],
                                    check=True, capture_output=True, env=cls.env).stdout.decode()
            cls.fpr[nom] = next(l.split(":")[9] for l in sortie.splitlines() if l.startswith("fpr:"))
        cls.admins = Path(cls.dossier.name) / "admins"
        cls.admins.mkdir()
        (cls.admins / "admin.asc").write_bytes(subprocess.run(
            ["gpg", "--armor", "--export", cls.fpr["Admin"]], check=True, capture_output=True, env=cls.env).stdout)

    @classmethod
    def tearDownClass(cls):
        cls.dossier.cleanup()

    def setUp(self):
        self.ancien = os.environ.get("GNUPGHOME")
        os.environ["GNUPGHOME"] = str(self.maison)          # `inscrire` signe avec le trousseau de l'admin
        self.cles = Path(self.dossier.name) / f"cles-{self._testMethodName}.json"
        self.publique = sig.publique_de(Ed25519PrivateKey.generate())

    def tearDown(self):
        os.environ.pop("GNUPGHOME") if self.ancien is None else os.environ.__setitem__("GNUPGHOME", self.ancien)

    def charger(self):
        return sig.charger_cles(self.cles, [self.admins / "admin.asc"], {self.fpr["Admin"]})

    def test_inscrite_par_un_admin_acceptee(self):
        sig.inscrire(self.cles, "Fxst1", "admin", self.publique, self.fpr["Admin"])
        (cle,) = self.charger().values()
        self.assertEqual((cle.nom, cle.role, cle.publique, cle.signee_par), ("Fxst1", "admin", self.publique, self.fpr["Admin"]))
        with self.assertRaises(Refus):
            sig.inscrire(self.cles, "Fxst1 bis", "relecteur", self.publique, self.fpr["Admin"])   # déjà inscrite

    def test_role_change_ou_signataire_non_admin_refuse(self):
        sig.inscrire(self.cles, "Relecteur", "relecteur", self.publique, self.fpr["Admin"])
        entrees = json.loads(self.cles.read_text())
        entrees[0]["role"] = "admin"                       # se promouvoir soi-même
        self.cles.write_text(json.dumps(entrees))
        with self.assertRaises(Refus) as r:
            self.charger()
        self.assertEqual(r.exception.code, "signature_gpg_invalide")
        self.cles.unlink()
        sig.inscrire(self.cles, "Relecteur", "relecteur", self.publique, self.fpr["Intrus"])
        with self.assertRaises(Refus) as r:
            self.charger()
        self.assertEqual(r.exception.code, "signature_gpg_invalide")   # sa clé n'est pas dans admins/

    def test_sans_admin_de_confiance_rien_ne_demarre(self):
        with self.assertRaises(Refus):
            sig.charger_cles(self.cles, [], set())


if __name__ == "__main__":
    unittest.main()
