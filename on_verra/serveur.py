"""Serveur web local : interface de consultation et API JSON en lecture seule sur la base SQLite."""

import json
import mimetypes
import sqlite3
from functools import lru_cache
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .hemicycle import charger as charger_hemicycle
from .placement import placer

WEB = Path(__file__).parent / "web"
TRIS_LOIS = {
    "saillance": "l.saillance DESC, l.titre",
    "date": "derniere_date DESC, l.titre",
    "titre": "l.titre",
}
LIMITE_LOIS = 1000

REQ_LOIS = """
SELECT l.id, l.titre, l.niveau, l.saillance, l.raisons, l.legislature, l.promulgation,
       COALESCE((SELECT MAX(date) FROM scrutins WHERE loi_id = l.id),
                (SELECT MAX(date) FROM engagements_49_3 WHERE loi_id = l.id)) AS derniere_date,
       (SELECT COUNT(*) FROM scrutins WHERE loi_id = l.id) AS nb_votes,
       (SELECT COUNT(*) FROM engagements_49_3 WHERE loi_id = l.id) AS nb_49_3
FROM lois l
"""

# Députés en fonction à une date, avec le groupe d'appartenance du jour et la dernière place connue.
REQ_EN_FONCTION = """
SELECT m.acteur_ref AS acteur, d.prenom, d.nom,
       -- Siège : celui noté lors de son vote le plus proche dans le temps, sinon le dernier du mandat.
       COALESCE((SELECT v.num_place FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid
                  WHERE v.acteur_ref = m.acteur_ref AND s.legislature = :legislature
                    AND v.num_place IS NOT NULL
                  ORDER BY ABS(julianday(s.date) - julianday(:date)) LIMIT 1), m.place) AS place,
       (SELECT a.groupe_ref FROM appartenances a
         WHERE a.acteur_ref = m.acteur_ref AND a.date_debut <= :date
           AND (a.date_fin IS NULL OR a.date_fin >= :date)
         ORDER BY a.date_debut DESC LIMIT 1) AS groupe
FROM mandats m JOIN deputes d USING (acteur_ref)
WHERE m.legislature = :legislature AND m.date_debut <= :date
  AND (m.date_fin IS NULL OR m.date_fin >= :date)
ORDER BY m.acteur_ref
"""


class Erreur(Exception):
    def __init__(self, statut: HTTPStatus, message: str):
        super().__init__(message)
        self.statut = statut


@lru_cache(maxsize=1)
def sieges() -> list[dict]:
    return charger_hemicycle()["sieges"]


def lignes(curseur) -> list[dict]:
    return [dict(r) for r in curseur]


def api_lois(db: sqlite3.Connection, params: dict) -> dict:
    filtres, valeurs = [], []
    if q := params.get("q"):
        filtres.append("l.titre LIKE ?")
        valeurs.append(f"%{q}%")
    if leg := params.get("legislature"):
        filtres.append("l.legislature = ?")
        valeurs.append(leg)
    if niveau := params.get("niveau"):
        filtres.append("l.niveau = ?")
        valeurs.append(niveau)
    tri = TRIS_LOIS.get(params.get("tri", "saillance"), TRIS_LOIS["saillance"])
    where = f"WHERE {' AND '.join(filtres)}" if filtres else ""
    rows = db.execute(f"{REQ_LOIS} {where} ORDER BY {tri} LIMIT {LIMITE_LOIS}", valeurs)
    return {"lois": lignes(rows)}


def api_loi(db: sqlite3.Connection, loi_id: str) -> dict:
    loi = db.execute("SELECT * FROM lois WHERE id = ?", (loi_id,)).fetchone()
    if not loi:
        raise Erreur(HTTPStatus.NOT_FOUND, "Loi inconnue")
    scrutins = lignes(db.execute(
        "SELECT uid, numero, legislature, date, lecture, sort, type_vote, nb_votants, pour, contre, "
        "abstentions FROM scrutins WHERE loi_id = ? ORDER BY date, numero", (loi_id,)))
    engagements = lignes(db.execute("SELECT * FROM engagements_49_3 WHERE loi_id = ? ORDER BY date", (loi_id,)))
    motions = lignes(db.execute(
        "SELECT scrutin_uid AS uid, numero, legislature, date, pour, requis, adoptee, engagement_id "
        "FROM motions_censure WHERE loi_id = ? ORDER BY date, numero", (loi_id,)))
    return {"loi": dict(loi), "scrutins": scrutins, "engagements": engagements, "motions": motions}


def hemicycle_du_jour(db: sqlite3.Connection, legislature: str, date: str, votes: dict[str, dict]) -> dict:
    """Sièges, groupes et positions de tous les députés en fonction ce jour-là.

    votes : {acteur: {"position", "groupe", "delegation", "cause", "num_place"}} pour ceux qui ont voté.
    """
    deputes = lignes(db.execute(REQ_EN_FONCTION, {"date": date, "legislature": legislature}))
    for d in deputes:
        v = votes.get(d["acteur"])
        if v:
            d["groupe"] = v["groupe"] or d["groupe"]
            d["place"] = v["num_place"] or d["place"]
    places, mode = placer(deputes, sieges())

    refs = {d["groupe"] for d in deputes if d["groupe"]}
    infos = {r["organe_ref"]: r for r in lignes(db.execute(
        f"SELECT organe_ref, abrege, libelle, couleur FROM groupes "
        f"WHERE organe_ref IN ({','.join('?' * len(refs))})", list(refs)))}
    groupes = {}
    for ref in refs:
        g = infos.get(ref, {"abrege": "?", "libelle": "Groupe inconnu", "couleur": None})
        groupes[ref] = {"ref": ref, "abrege": g["abrege"], "libelle": g["libelle"], "couleur": g["couleur"],
                        "membres": 0, "pour": 0, "contre": 0, "abstention": 0, "non_votant": 0, "sans_vote": 0}

    resultat = []
    for d in deputes:
        v = votes.get(d["acteur"], {})
        position = v.get("position")
        if d["groupe"] in groupes:
            g = groupes[d["groupe"]]
            g["membres"] += 1
            g[position or "sans_vote"] += 1
        resultat.append({"acteur": d["acteur"], "prenom": d["prenom"], "nom": d["nom"], "groupe": d["groupe"],
                         "siege": places.get(d["acteur"]), "position": position,
                         "delegation": bool(v.get("delegation")), "cause": v.get("cause")})
    return {"mode_places": mode, "groupes": list(groupes.values()), "deputes": resultat}


def api_scrutin(db: sqlite3.Connection, uid: str) -> dict:
    s = db.execute("SELECT s.*, l.titre AS loi, l.id AS loi_id FROM scrutins s JOIN lois l ON l.id = s.loi_id "
                   "WHERE s.uid = ?", (uid,)).fetchone()
    if not s:
        raise Erreur(HTTPStatus.NOT_FOUND, "Scrutin inconnu")
    votes = {r["acteur_ref"]: {"position": r["position"], "groupe": r["groupe_ref"], "delegation": r["par_delegation"],
                               "cause": r["cause"], "num_place": r["num_place"]}
             for r in db.execute("SELECT * FROM votes WHERE scrutin_uid = ?", (uid,))}
    lignes_groupes = {r["groupe_ref"]: r["ligne"] for r in db.execute(
        "SELECT groupe_ref, ligne FROM positions_groupes WHERE scrutin_uid = ?", (uid,))}
    donnees = hemicycle_du_jour(db, s["legislature"], s["date"], votes)
    for g in donnees["groupes"]:
        g["ligne"] = lignes_groupes.get(g["ref"])
    return {"type": "scrutin", "scrutin": dict(s), **donnees}


def api_motion(db: sqlite3.Connection, uid: str) -> dict:
    m = db.execute("SELECT m.*, l.titre AS loi FROM motions_censure m LEFT JOIN lois l ON l.id = m.loi_id "
                   "WHERE m.scrutin_uid = ?", (uid,)).fetchone()
    if not m:
        raise Erreur(HTTPStatus.NOT_FOUND, "Motion inconnue")
    votes = {r["acteur_ref"]: {"position": "pour", "groupe": r["groupe_ref"], "delegation": r["par_delegation"],
                               "cause": None, "num_place": r["num_place"]}
             for r in db.execute("SELECT * FROM votes_censure WHERE scrutin_uid = ?", (uid,))}
    return {"type": "motion", "motion": dict(m), **hemicycle_du_jour(db, m["legislature"], m["date"], votes)}


ROUTES = {"lois": api_lois}
ROUTES_ID = {"lois": api_loi, "scrutins": api_scrutin, "motions": api_motion}


def creer_gestionnaire(base: Path):
    class Gestionnaire(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def envoyer(self, statut: HTTPStatus, corps: bytes, type_contenu: str):
            self.send_response(statut)
            self.send_header("Content-Type", type_contenu)
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(corps)

        def json(self, statut: HTTPStatus, donnees: dict):
            self.envoyer(statut, json.dumps(donnees, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            url = urlparse(self.path)
            morceaux = [unquote(m) for m in url.path.strip("/").split("/") if m]
            try:
                if morceaux[:1] == ["api"]:
                    self.api(morceaux[1:], {k: v[0] for k, v in parse_qs(url.query).items()})
                else:
                    self.statique(morceaux)
            except Erreur as e:
                self.json(e.statut, {"erreur": str(e)})

        def api(self, morceaux: list[str], params: dict):
            # Lecture seule : la base ne peut pas être modifiée depuis l'interface.
            db = sqlite3.connect(f"{base.as_uri()}?mode=ro", uri=True)
            db.row_factory = sqlite3.Row
            try:
                if len(morceaux) == 1 and morceaux[0] in ROUTES:
                    self.json(HTTPStatus.OK, ROUTES[morceaux[0]](db, params))
                elif len(morceaux) == 2 and morceaux[0] in ROUTES_ID:
                    self.json(HTTPStatus.OK, ROUTES_ID[morceaux[0]](db, morceaux[1]))
                else:
                    raise Erreur(HTTPStatus.NOT_FOUND, "Route inconnue")
            finally:
                db.close()

        def statique(self, morceaux: list[str]):
            chemin = (WEB / "/".join(morceaux or ["index.html"])).resolve()
            if not chemin.is_relative_to(WEB.resolve()) or not chemin.is_file():
                raise Erreur(HTTPStatus.NOT_FOUND, "Fichier introuvable")
            type_contenu = mimetypes.guess_type(chemin.name)[0] or "application/octet-stream"
            if type_contenu.startswith("text/") or type_contenu.endswith(("javascript", "json")):
                type_contenu += "; charset=utf-8"
            self.envoyer(HTTPStatus.OK, chemin.read_bytes(), type_contenu)

    return Gestionnaire


def servir(base: Path, hote: str, port: int):
    if not base.exists():
        raise SystemExit("Base absente : lancez d'abord `python -m on_verra importer`.")
    serveur = ThreadingHTTPServer((hote, port), creer_gestionnaire(base))
    print(f"Interface disponible sur http://{hote}:{port}  (Ctrl+C pour arrêter)")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
