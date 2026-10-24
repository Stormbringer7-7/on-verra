"""Agenda de la séance publique du Sénat : jours de discussion d'un dossier, passés et prévus (DOSLEG).

`date_seance` donne, pour une lecture du Sénat, chaque jour où elle est inscrite en séance
publique ; les jours à venir sont l'ordre du jour arrêté par la Conférence des présidents (le
même que « Discussion en séance publique les 27, 28… » de la page du dossier). Référence au
dossier, explicite : `date_seance.lecidt` → `lecass.lecassidt` → `lecture` → `loi.signet`.

L'ordre du jour change : la table est lue comme un seul document, et une date qui n'y figure plus
est marquée retirée (`Ensemble`), jamais supprimée. Pas de lien à la réunion : le compte rendu du
jour n'existe pas avant la séance, et le jour seul ne désigne pas un point de l'ordre du jour.
Seules les dates depuis le 18/07/2024 (17e législature de l'AN) sont chargées.
"""

import json

from ....chargement import Document, Flux, charger
from ....domaine.objets import Ensemble, Objet
from ....etl import Etape
from .commun import LICENCE, Systeme, jour, senat
from .dossiers import DOSLEG
from .senateurs import SENAT
from .travaux import MEMBRE_DOSLEG, table

DEPUIS = "2024-07-18"
# typlec.typleccod -> lecture, au vocabulaire de canon.etape
LECTURES = {"1": "1", "2": "2", "3": "3", "7": "4", "4": "cmp", "5": "nouvelle", "6": "definitive"}


def seances(chemin) -> list[dict]:
    """Jours de séance publique depuis `DEPUIS`, joints à leur lecture et au signet du dossier."""
    signets = {l["loicod"]: l["signet"] for l in table(chemin, MEMBRE_DOSLEG, "loi")}
    lectures = {l["lecidt"]: l for l in table(chemin, MEMBRE_DOSLEG, "lecture")}
    par_assemblee = {l["lecassidt"]: l for l in table(chemin, MEMBRE_DOSLEG, "lecass")}
    lignes = []
    for d in table(chemin, MEMBRE_DOSLEG, "date_seance"):
        if not d["date_s"] or d["date_s"][:10] < DEPUIS:
            continue
        lecass = par_assemblee.get(d["lecidt"]) or {}
        lecture = lectures.get(lecass.get("lecidt")) or {}
        lignes.append({"code": d["code"], "date": d["date_s"][:10], "statut": d["statut"],
                       "lecassidt": d["lecidt"], "codass": lecass.get("codass"),
                       "typleccod": lecture.get("typleccod"), "leccom": lecture.get("leccom"),
                       "signet": signets.get(lecture.get("loicod"))})
    return sorted(lignes, key=lambda l: (l["date"], int(l["code"])))


def document(chemin) -> Document:
    lignes = seances(chemin)
    return Document(DOSLEG, "date_seance", json.dumps(lignes, sort_keys=True, ensure_ascii=False).encode(),
                    "date_seance", lignes)


def agenda(doc: Document):
    identites = []
    for l in doc.donnees:
        if not l["signet"] or l["codass"] == "A":
            continue                            # chaîne vers le dossier rompue, ou lecture de l'AN : rien n'est supposé
        identite = senat("date_seance", l["code"])
        identites.append(identite)
        lecture = (l["leccom"] or "").strip()
        yield Objet("evenement_agenda", identite, {
            "dossier_id": senat("dossier", l["signet"]), "organisation_id": SENAT, "date": jour(l["date"]),
            "libelle": "Séance publique du Sénat" + (f" — {lecture}" if lecture else ""),
            "type_etape": "seance", "chambre": "SENAT", "lecture": LECTURES.get(l["typleccod"]),
            "code_source": lecture or None}, f"/date_seance[code='{l['code']}']",
            f"https://www.senat.fr/dossier-legislatif/{l['signet']}.html")
    yield Ensemble("evenement_agenda", "organisation_id", SENAT, tuple(identites))


def executer(ctx):
    chemin = ctx.fichier(DOSLEG.nom)
    charger(ctx, Flux(Systeme.SENAT, LICENCE, lambda: iter([document(chemin)]), agenda))


ETAPE = Etape("senat.agenda", executer, apres=("senat.senateurs", "senat.dossiers"), sources=lambda p: [DOSLEG],
              description="jours de séance publique du Sénat par dossier, passés et prévus (DOSLEG date_seance)")
