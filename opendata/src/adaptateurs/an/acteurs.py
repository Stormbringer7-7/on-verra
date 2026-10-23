"""Référentiel AMO : groupes politiques, députés, mandats et appartenances aux groupes."""

import sqlite3
from pathlib import Path
from typing import Iterator

from ...etl import Contexte, Etape, Ligne, lire_json_zip
from .commun import fichier, liste, place

# Le fichier AMO30 est historique : celui de la dernière législature couvre tous les mandats.
ACTEURS = fichier("acteurs", "17", "amo/tous_acteurs_mandats_organes_xi_legislature/"
                                   "AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip")
# Groupes sans couleur officielle (quelques-uns en 15e, tous en 14e) : couleur d'un groupe de la
# même famille politique. (législature, abrégé) -> (législature, abrégé) du modèle.
COULEURS_EMPRUNTEES = {
    ("15", "NG"): ("15", "SOC"), ("15", "LC"): ("15", "UDI-A-I"),
    ("15", "UDI-AGIR"): ("15", "UDI-A-I"), ("15", "UDI-I"): ("15", "UDI-A-I"),
    ("14", "SRC"): ("15", "SOC"), ("14", "SER"): ("15", "SOC"),
    ("14", "UMP"): ("15", "LR"), ("14", "R-UMP"): ("15", "LR"), ("14", "LES-REP"): ("15", "LR"),
    ("14", "UDI"): ("15", "UDI-A-I"), ("14", "ECOLO"): ("16", "ECOLO"), ("14", "GDR"): ("15", "GDR"),
    ("14", "RRDP"): ("15", "LT"), ("14", "NI"): ("15", "NI"),
}


def lignes(chemin: Path) -> Iterator[Ligne]:
    for d in lire_json_zip(chemin, "organe/"):
        o = d["organe"]
        if o.get("codeType") == "GP":
            yield Ligne("groupes", {"organe_ref": o["uid"], "libelle": o["libelle"],
                                    "abrege": o.get("libelleAbrev") or o.get("libelleAbrege"),
                                    "legislature": o.get("legislature"), "couleur": o.get("couleurAssociee")})

    for d in lire_json_zip(chemin, "acteur/"):
        a = d["acteur"]
        tous = liste(a["mandats"]["mandat"])
        mandats = [m for m in tous if m["typeOrgane"] == "ASSEMBLEE"]
        if not mandats:
            continue
        uid = a["uid"]["#text"] if isinstance(a["uid"], dict) else a["uid"]
        for m in tous:
            if m["typeOrgane"] == "GP":
                yield Ligne("appartenances", {"mandat_ref": m["uid"], "acteur_ref": uid,
                                              "groupe_ref": m["organes"]["organeRef"],
                                              "date_debut": m["dateDebut"], "date_fin": m.get("dateFin")})
        ident = a["etatCivil"]["ident"]
        dernier = max(mandats, key=lambda m: m["dateDebut"])
        lieu = (dernier.get("election") or {}).get("lieu") or {}
        yield Ligne("deputes", {"acteur_ref": uid, "civilite": ident.get("civ"), "prenom": ident["prenom"],
                                "nom": ident["nom"], "departement": lieu.get("departement"),
                                "num_departement": lieu.get("numDepartement"), "num_circo": lieu.get("numCirco")})
        for m in mandats:
            # dateDebut = date de l'élection, même pour un ancien ministre qui reprend son siège
            # des mois plus tard : la prise de fonction est la vraie date d'entrée en séance.
            mandature = m.get("mandature") or {}
            yield Ligne("mandats", {"mandat_ref": m["uid"], "acteur_ref": uid, "legislature": m["legislature"],
                                    "date_debut": mandature.get("datePriseFonction") or m["dateDebut"],
                                    "date_fin": m.get("dateFin"), "place": place(mandature.get("placeHemicycle"))})


def emprunter_couleurs(db: sqlite3.Connection):
    for (legislature, abrege), (leg_modele, modele) in COULEURS_EMPRUNTEES.items():
        db.execute("UPDATE groupes SET couleur = (SELECT couleur FROM groupes m WHERE m.abrege = ? "
                   "AND m.legislature = ? AND m.couleur IS NOT NULL) "
                   "WHERE legislature = ? AND abrege = ? AND couleur IS NULL",
                   (modele, leg_modele, legislature, abrege))


def executer(ctx: Contexte):
    ctx.chargeur.ecrire_tout(lignes(ctx.fichier(ACTEURS.nom)))
    emprunter_couleurs(ctx.db)


ETAPE = Etape("an.acteurs", executer, sources=lambda p: [ACTEURS],
              description="députés, mandats, groupes et appartenances (AMO30)")
