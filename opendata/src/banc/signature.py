"""Signatures du banc de revue, en deux niveaux.

1. **Requêtes : Ed25519 brut.** Chaque requête à l'API de revue est signée par la clé privée de son
   auteur (navigateur, poste de génération, script). Le message signé tient en cinq lignes :
   méthode, chemin (avec la requête), date, nonce, sha256 du corps. En-têtes : `X-Revue-Cle`
   (empreinte de la clé publique), `X-Revue-Date` (UTC, ±5 min), `X-Revue-Nonce` (une seule fois),
   `X-Revue-Signature` (base64).
2. **Confiance : GPG.** Une clé n'entre dans le fichier du service (`cles.json`) que signée par la
   clé GPG d'un admin de confiance (empreintes GPG données au service). Le service ne garde aucune
   clé privée : seulement les clés publiques Ed25519, leurs signatures GPG et les clés publiques
   GPG des admins.

La clé privée Ed25519 est un fichier PEM (PKCS#8) lisible par son seul propriétaire, hors du dépôt :
le navigateur l'importe tel quel (WebCrypto), un poste la lit avec `cryptography`.
"""

import base64
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ROLES = ("admin", "relecteur", "poste")
ECART_MAX = timedelta(minutes=5)          # écart d'horloge toléré, dans les deux sens
ENTETES = ("X-Revue-Cle", "X-Revue-Date", "X-Revue-Nonce", "X-Revue-Signature")
VERSION_INSCRIPTION = "big-brother/revue/cle/v1"


class Refus(Exception):
    """Requête ou clé refusée ; `code` dit pourquoi (journalisé, renvoyé au client)."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code} : {detail}" if detail else code)
        self.code = code


@dataclass(frozen=True)
class Cle:
    """Une clé inscrite au service : qui, quel rôle, et qui l'a inscrite (empreinte GPG)."""
    nom: str
    role: str
    publique: bytes                       # 32 octets Ed25519
    signee_par: str

    @property
    def empreinte(self) -> str:
        return empreinte(self.publique)


def b64(octets: bytes) -> str:
    return base64.b64encode(octets).decode()


def empreinte(publique: bytes) -> str:
    return hashlib.sha256(publique).hexdigest()


# Clés ---------------------------------------------------------------------------------------
def creer_paire(fichier: Path) -> bytes:
    """Écrit une clé privée neuve (PEM, lisible par son seul propriétaire) ; retourne la clé publique.
    Ne remplace jamais une clé existante."""
    privee = Ed25519PrivateKey.generate()
    pem = privee.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                               serialization.NoEncryption())
    fichier.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descripteur = os.open(fichier, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descripteur, "wb") as f:
        f.write(pem)
    return publique_de(privee)


def lire_privee(fichier: Path) -> Ed25519PrivateKey:
    cle = serialization.load_pem_private_key(fichier.read_bytes(), password=None)
    if not isinstance(cle, Ed25519PrivateKey):
        raise Refus("cle_illisible", f"{fichier} n'est pas une clé Ed25519")
    return cle


def publique_de(privee: Ed25519PrivateKey) -> bytes:
    return privee.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def message_inscription(nom: str, role: str, publique: bytes) -> bytes:
    """Ce que signe l'admin (GPG) pour inscrire une clé : nom, rôle et clé, rien d'autre."""
    if role not in ROLES:
        raise Refus("role_inconnu", role)
    if not nom.strip() or "\n" in nom:
        raise Refus("nom_invalide", repr(nom))
    return f"{VERSION_INSCRIPTION}\nnom={nom}\nrole={role}\ncle={b64(publique)}\n".encode()


# Requêtes -----------------------------------------------------------------------------------
def message_requete(methode: str, chemin: str, date: str, nonce: str, corps: bytes) -> bytes:
    return "\n".join((methode.upper(), chemin, date, nonce, hashlib.sha256(corps).hexdigest())).encode()


def signer_requete(privee: Ed25519PrivateKey, methode: str, chemin: str, corps: bytes = b"",
                   maintenant: datetime | None = None, nonce: str | None = None) -> dict[str, str]:
    """En-têtes à joindre à la requête (client : poste, script, tests)."""
    date = (maintenant or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    nonce = nonce or secrets.token_urlsafe(18)
    signature = privee.sign(message_requete(methode, chemin, date, nonce, corps))
    return dict(zip(ENTETES, (empreinte(publique_de(privee)), date, nonce, b64(signature))))


class Verificateur:
    """Vérifie une requête signée. `nonces` : port qui consomme un nonce une seule fois
    (`consommer_nonce(cle, nonce, expire_le) -> bool`, cf. l'Entrepot)."""

    def __init__(self, cles: dict[str, Cle], nonces, horloge=lambda: datetime.now(timezone.utc)):
        self.cles, self.nonces, self.horloge = cles, nonces, horloge

    def verifier(self, methode: str, chemin: str, entetes, corps: bytes, roles: tuple[str, ...] = ROLES) -> Cle:
        valeurs = [entetes.get(e) for e in ENTETES]
        if not all(valeurs):
            raise Refus("non_signee", "en-têtes " + ", ".join(e for e, v in zip(ENTETES, valeurs) if not v))
        id_cle, date, nonce, signature = valeurs
        cle = self.cles.get(id_cle)
        if cle is None:
            raise Refus("cle_inconnue", id_cle)
        try:
            quand = datetime.strptime(date, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            raise Refus("date_illisible", date)
        if abs(self.horloge() - quand) > ECART_MAX:
            raise Refus("date_hors_delai", date)
        if not 16 <= len(nonce) <= 128:
            raise Refus("nonce_invalide")
        try:
            Ed25519PublicKey.from_public_bytes(cle.publique).verify(
                base64.b64decode(signature, validate=True), message_requete(methode, chemin, date, nonce, corps))
        except (InvalidSignature, ValueError):
            raise Refus("signature_invalide", cle.nom)
        if cle.role not in roles:
            raise Refus("role_insuffisant", f"{cle.nom} est {cle.role}, il faut {' ou '.join(roles)}")
        # le nonce n'est consommé qu'une fois la signature prouvée : un tiers ne peut pas en brûler
        if not self.nonces.consommer_nonce(cle.empreinte, nonce, quand + 2 * ECART_MAX):
            raise Refus("nonce_rejoue", nonce)
        return cle


# Fichier des clés du service, vérifié par GPG -----------------------------------------------
def verifier_gpg(message: bytes, signature: str, cles_admins: list[Path], admins: set[str]) -> str:
    """Vérifie une signature GPG détachée avec les seules clés des admins ; retourne l'empreinte de
    la clé primaire qui a signé. Refuse une clé expirée ou révoquée, ou un signataire hors `admins`."""
    with tempfile.TemporaryDirectory() as maison:
        for f in cles_admins:
            subprocess.run(["gpg", "--homedir", maison, "--batch", "--quiet", "--import", str(f)],
                           check=True, capture_output=True)
        fichier = Path(maison) / "signature.asc"
        fichier.write_text(signature)
        r = subprocess.run(["gpg", "--homedir", maison, "--batch", "--status-fd", "1", "--verify", str(fichier), "-"],
                           input=message, capture_output=True)
    etats = [l.split()[1:] for l in r.stdout.decode(errors="replace").splitlines() if l.startswith("[GNUPG:] ")]
    if r.returncode != 0 or not any(e[0] == "GOODSIG" for e in etats):
        raise Refus("signature_gpg_invalide")
    valide = next((e for e in etats if e[0] == "VALIDSIG"), None)
    primaire = valide[-1] if valide else ""
    if primaire.upper() not in {a.upper() for a in admins}:
        raise Refus("signataire_gpg_non_admin", primaire)
    return primaire.upper()


def charger_cles(fichier: Path, cles_admins: list[Path], admins: set[str]) -> dict[str, Cle]:
    """Lit `cles.json` ([{nom, role, cle, signature_gpg}]) : chaque entrée doit être signée par un
    admin de confiance, sinon le service ne démarre pas (rien n'est ignoré en silence)."""
    if not admins:
        raise Refus("aucun_admin", "donner au moins une empreinte GPG d'admin de confiance")
    cles = {}
    for e in json.loads(fichier.read_text(encoding="utf-8")) if fichier.exists() else []:
        publique = base64.b64decode(e["cle"], validate=True)
        if len(publique) != 32:
            raise Refus("cle_invalide", e.get("nom", "?"))
        try:
            par = verifier_gpg(message_inscription(e["nom"], e["role"], publique), e["signature_gpg"], cles_admins, admins)
        except Refus as r:
            raise Refus(r.code, f"clé {e['nom']} : {r}")
        cle = Cle(e["nom"], e["role"], publique, par)
        if cle.empreinte in cles:
            raise Refus("cle_en_double", e["nom"])
        cles[cle.empreinte] = cle
    return cles


def signer_gpg(message: bytes, gpg_cle: str) -> str:
    """Côté admin, sur son poste : signature détachée en armure (gpg demande la phrase secrète)."""
    r = subprocess.run(["gpg", "--local-user", gpg_cle, "--armor", "--detach-sign", "--output", "-"],
                       input=message, capture_output=True)
    if r.returncode != 0:
        raise Refus("signature_gpg_impossible", r.stderr.decode(errors="replace").strip())
    return r.stdout.decode()


def inscrire(fichier: Path, nom: str, role: str, publique: bytes, gpg_cle: str) -> dict:
    """Ajoute une clé au fichier du service, signée par l'admin (`gpg_cle`). Une clé déjà inscrite
    est refusée : on la retire d'abord."""
    entrees = json.loads(fichier.read_text(encoding="utf-8")) if fichier.exists() else []
    if any(e["cle"] == b64(publique) for e in entrees):
        raise Refus("cle_en_double", nom)
    entree = {"nom": nom, "role": role, "cle": b64(publique),
              "signature_gpg": signer_gpg(message_inscription(nom, role, publique), gpg_cle)}
    fichier.parent.mkdir(parents=True, exist_ok=True)
    fichier.write_text(json.dumps([*entrees, entree], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return entree
