"""Dossiers législatifs du Sénat (DOSLEG, table `loi`).

Un dossier que l'AN cite (`senatChemin`) est déjà relié au dossier canonique par l'adaptateur
AN : le Sénat n'y réécrit rien (deux sources pour les mêmes champs, ce serait le dernier écrivain
qui gagne). Tous les autres dossiers du Sénat sont créés, quelle que soit leur session : les
débats d'aujourd'hui citent aussi des textes déposés il y a plusieurs sessions.
"""

from ....chargement import Flux, charger
from ....domaine.objets import Objet
from ....etl import Etape, Fichier
from .commun import DONNEES, LICENCE, Systeme, document_ligne, jour, senat, table_dump

DOSLEG = Fichier("dosleg.zip", f"{DONNEES}/dosleg/dosleg.zip")
def dossier(doc):
    l = doc.donnees
    yield Objet("dossier", senat("dossier", l["signet"]), {
        "titre": " ".join(x for x in ((l.get("loient") or "").strip(), (l.get("loitit") or "").strip()) if x)
                 or l["signet"],
        "titre_court": (l.get("motclef") or "").strip() or None,
        "procedure_acceleree": l.get("proaccdat") is not None,
        "date_depot": None}, f"/loi/{l['loicod']}", f"https://www.senat.fr/dossier-legislatif/{l['signet']}.html")


def executer(ctx):
    chemin = ctx.fichier(DOSLEG.nom)

    def documents():
        for l in table_dump(chemin, "dosleg.sql", "loi"):
            # déjà relié à un dossier AN : rien à écrire côté Sénat
            if l.get("signet") and not ctx.registre.resoudre(senat("dossier", l["signet"])):
                yield document_ligne(DOSLEG, "loi", l["loicod"], l)

    charger(ctx, Flux(Systeme.SENAT, LICENCE, documents, dossier))


ETAPE = Etape("senat.dossiers", executer, apres=("an.travaux",), sources=lambda p: [DOSLEG],
              description="dossiers du Sénat (DOSLEG) non cités par l'AN, ceux-là étant déjà reliés")
