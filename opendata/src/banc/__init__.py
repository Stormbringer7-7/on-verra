"""Banc de revue : app interne, privée, pour les deux revues humaines.

- Rapprochements : les cas de `analytique.cas_revue` (docs/rapprochements.md), triés par priorité ;
  une décision passe par `revue.decider` (enregistrée, appliquée aussitôt, rejouée à chaque chargement).
- Synthèses d'un modèle : chaque synthèse d'un lot (`data/relecture/*.json`) est jugée fidèle ou non
  au texte officiel ; le jugement vaut pour son empreinte (`analytique.relecture_synthese`).

    python -m src revue servir                 # http://127.0.0.1:8084

Jamais exposé : écoute la machine seule par défaut, refuse un en-tête Host étranger (rebinding
DNS) et une écriture venue d'une autre origine. Serveur à un fil : une connexion Postgres, peu de
relecteurs à la fois.
"""

import json
import uuid
from datetime import date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .. import revue

PAGE = Path(__file__).with_name("index.html")
PAR_PAGE = 50
CHAMPS_SYNTHESE = ("id", "lot", "type", "synthese", "empreinte")
VERDICTS = ("fidele", "infidele")


def charger_lots(dossier: Path) -> dict[str, dict]:
    """Synthèses à juger, par identifiant : chaque fichier JSON du dossier est une liste de synthèses
    ({id, lot, type, synthese, empreinte, …} : le format du banc de relecture)."""
    syntheses = {}
    for fichier in sorted(dossier.glob("*.json")) if dossier.is_dir() else []:
        for s in json.loads(fichier.read_text(encoding="utf-8")):
            if manque := [c for c in CHAMPS_SYNTHESE if not s.get(c)]:
                raise ValueError(f"{fichier.name} : synthèse {s.get('id')} sans {', '.join(manque)}")
            if s["id"] in syntheses:
                raise ValueError(f"{fichier.name} : synthèse {s['id']} en double")
            syntheses[s["id"]] = s
    return syntheses


class Banc:
    """Les commandes du banc, sans HTTP (testées sur l'entrepot mémoire)."""

    def __init__(self, entrepot, registre, syntheses: dict[str, dict]):
        self.entrepot, self.registre, self.syntheses = entrepot, registre, syntheses

    def etat(self) -> dict:
        return {"types": {t: {"titre": titre, "consigne": consigne} for t, (titre, consigne) in revue.TYPES.items()},
                "comptes": self.entrepot.compter_cas(), "syntheses": len(self.syntheses)}

    def cas(self, type_: str | None, statut: str | None, decalage: int) -> dict:
        cas = self.entrepot.page_cas(type_, statut, PAR_PAGE + 1, decalage)
        return {"cas": cas[:PAR_PAGE], "suite": len(cas) > PAR_PAGE}

    def decider(self, corps: dict) -> dict:
        choix = corps.get("choix")
        if choix is not None and not isinstance(choix, int):
            raise ValueError("choix : indice du candidat ou null (aucun)")
        revue.decider(self.entrepot, self.registre, _texte(corps, "cle"), choix, _texte(corps, "par"),
                      (corps.get("motif") or "").strip() or None)
        return {"cas": self.entrepot.cas(corps["cle"])}

    def liste_syntheses(self) -> dict:
        jugements = {j["synthese_id"]: j for j in self.entrepot.jugements_syntheses()
                     if (s := self.syntheses.get(j["synthese_id"])) and s["empreinte"] == j["empreinte"]}
        return {"syntheses": list(self.syntheses.values()), "jugements": jugements}

    def juger(self, corps: dict) -> dict:
        s = self.syntheses.get(_texte(corps, "synthese_id"))
        if s is None or s["empreinte"] != corps.get("empreinte"):
            raise KeyError("synthèse inconnue, ou réécrite depuis l'ouverture de la page : recharger")
        if corps.get("verdict") not in VERDICTS:
            raise ValueError(f"verdict : {' ou '.join(VERDICTS)}")
        jugement = {"synthese_id": s["id"], "empreinte": s["empreinte"], "lot": s["lot"], "verdict": corps["verdict"],
                    "commentaire": (corps.get("commentaire") or "").strip(), "juge_par": _texte(corps, "par")}
        self.entrepot.juger_synthese(jugement)
        return {"jugement": jugement}


def _texte(corps: dict, champ: str) -> str:
    valeur = corps.get(champ)
    if not isinstance(valeur, str) or not valeur.strip():
        raise ValueError(f"{champ} manquant")
    return valeur.strip()


def _json(valeur):
    if isinstance(valeur, (uuid.UUID, datetime, date)):
        return str(valeur)
    raise TypeError(type(valeur).__name__)


def gestionnaire(banc: Banc, hotes: set[str]):
    class Gestionnaire(BaseHTTPRequestHandler):
        server_version = "banc"

        def _repondre(self, statut: HTTPStatus, corps: bytes, type_: str):
            self.send_response(statut)
            self.send_header("Content-Type", type_)
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                             "script-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(corps)

        def _donnees(self, statut: HTTPStatus, valeur):
            self._repondre(statut, json.dumps(valeur, ensure_ascii=False, default=_json).encode(), "application/json")

        def _autorise(self) -> bool:
            if self.headers.get("Host") not in hotes:
                self._donnees(HTTPStatus.FORBIDDEN, {"erreur": "hôte refusé"})
                return False
            return True

        def _executer(self, commande):
            try:
                self._donnees(HTTPStatus.OK, commande())
            except KeyError as e:
                self._donnees(HTTPStatus.NOT_FOUND, {"erreur": str(e.args[0]) if e.args else "introuvable"})
            except ValueError as e:
                self._donnees(HTTPStatus.BAD_REQUEST, {"erreur": str(e)})

        def do_GET(self):
            if not self._autorise():
                return
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/":
                self._repondre(HTTPStatus.OK, PAGE.read_bytes(), "text/html; charset=utf-8")
            elif url.path == "/api/etat":
                self._executer(banc.etat)
            elif url.path == "/api/cas":
                self._executer(lambda: banc.cas(q.get("type") or None, q.get("statut") or None,
                                                max(0, int(q.get("decalage") or 0))))
            elif url.path == "/api/syntheses":
                self._executer(banc.liste_syntheses)
            else:
                self._donnees(HTTPStatus.NOT_FOUND, {"erreur": "introuvable"})

        def do_POST(self):
            if not self._autorise():
                return
            origine = self.headers.get("Origin")
            if origine is not None and origine != f"http://{self.headers['Host']}" \
                    or self.headers.get_content_type() != "application/json":
                self._donnees(HTTPStatus.FORBIDDEN, {"erreur": "écriture refusée"})
                return
            try:
                corps = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            except ValueError:
                self._donnees(HTTPStatus.BAD_REQUEST, {"erreur": "JSON illisible"})
                return
            commandes = {"/api/decider": banc.decider, "/api/juger": banc.juger}
            if (commande := commandes.get(urlparse(self.path).path)) is None:
                self._donnees(HTTPStatus.NOT_FOUND, {"erreur": "introuvable"})
            elif not isinstance(corps, dict):
                self._donnees(HTTPStatus.BAD_REQUEST, {"erreur": "objet JSON attendu"})
            else:
                self._executer(lambda: commande(corps))

        def log_message(self, format, *args):
            print(f"{self.address_string()} {format % args}", flush=True)

    return Gestionnaire


def servir(banc: Banc, hote: str, port: int, hotes_publics: tuple[str, ...] = ()):
    """Sert le banc. `hotes_publics` : en-têtes Host acceptés en plus de 127.0.0.1 et localhost
    (port publié par Docker, tunnel SSH)."""
    hotes = {f"{h}:{port}" for h in ("127.0.0.1", "localhost", *hotes_publics)}
    serveur = HTTPServer((hote, port), gestionnaire(banc, hotes))
    print(f"Banc de revue : http://127.0.0.1:{port} ({len(banc.syntheses)} synthèse(s) à relire)", flush=True)
    serveur.serve_forever()
