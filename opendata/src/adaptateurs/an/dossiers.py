"""Dossiers législatifs : parcours de chaque texte et index de rapprochement scrutin -> dossier.

Rien n'est écrit en base ici : l'étape publie un `IndexDossiers` par législature dans
`ctx.artefacts["an.dossiers"]`, lu par les étapes des scrutins et des lois.
"""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from ...etl import Contexte, Etape
from .commun import SUFFIXES, fichier, liste, objets

# "organique" et "constitutionnelle" restent dans la clé : une loi ordinaire et sa loi organique
# jumelle portent souvent le même intitulé et sont deux dossiers distincts.
RE_NATURE_TEXTE = re.compile(r"^(?:(?:projet|proposition) de loi(?: ordinaire)?)?\s*,?")


def source(legislature: str):
    return fichier("dossiers", legislature, "loi/dossiers_legislatifs/"
                   f"Dossiers_Legislatifs{SUFFIXES.get(legislature, '')}.json.zip")


@dataclass
class IndexDossiers:
    dossiers: dict[str, dict]              # uid dossier -> titre, procédure, parcours (analyser_actes)
    scrutin_vers_dossier: dict[str, str]   # via les voteRefs des actes
    titre_vers_dossier: dict[str, str]     # clé de titre de document -> dossier, pour les scrutins non référencés


def cle_titre(titre: str) -> str:
    """Clé de rapprochement entre titres : sans nature du texte, accents, ponctuation ni espaces."""
    t = titre.lower().replace("’", "'")
    t = re.sub(r",? adoptée? (?:par le sénat|par l'assemblée nationale)[^,]*,?", " ", t)
    t = t.replace("d'initiative transpartisane", "")
    t = RE_NATURE_TEXTE.sub("", t.strip())
    t = unicodedata.normalize("NFKD", t)
    return "".join(c for c in t if c.isalnum())


def parcourir(actes):
    """Tous les actes d'un arbre d'actes législatifs, en profondeur."""
    for a in liste(actes):
        yield a
        yield from parcourir((a.get("actesLegislatifs") or {}).get("acteLegislatif"))


def libelle_statut(acte: dict) -> str:
    return ((acte.get("statutConclusion") or acte.get("decision") or {}).get("libelle")) or ""


def analyser_actes(dp: dict) -> dict:
    """Parcours législatif d'un dossier : procédure accélérée, CMP, Conseil constitutionnel,
    promulgation, et engagements de responsabilité (49.3) avec leurs motions de censure."""
    infos = {"acceleree": 0, "cmp": 0, "saisine_cc": 0, "decision_cc": None,
             "promulgation": None, "engagements": []}
    for etape in liste((dp.get("actesLegislatifs") or {}).get("acteLegislatif")):
        actes = list(parcourir(etape))
        issue = next((libelle_statut(a) for a in actes if "49, alinéa 3" in libelle_statut(a)), None)
        for a in actes:
            code = a["codeActe"]
            if code.endswith("-PROCACC"):
                infos["acceleree"] = 1
            elif code == "CMP-SAISIE":
                infos["cmp"] = 1
            # La saisine "de droit" est automatique (lois organiques) : ce n'est pas une contestation.
            elif code.startswith("CC-SAISIE") and code != "CC-SAISIE-DROIT":
                infos["saisine_cc"] = 1
            elif code == "CC-CONCLUSION":
                infos["decision_cc"] = libelle_statut(a) or None
            elif code == "PROM-PUB":
                infos["promulgation"] = (a.get("dateActe") or "")[:10] or None
            # Dans un dossier de loi, une déclaration du gouvernement = engagement de responsabilité (49.3).
            elif code.endswith("-DGVT"):
                motions = [(ref, libelle_statut(m))
                           for m in parcourir((a.get("actesLegislatifs") or {}).get("acteLegislatif"))
                           if m["codeActe"].endswith("MOTION-VOTE")
                           for ref in liste((m.get("voteRefs") or {}).get("voteRef"))]
                infos["engagements"].append({"etape": etape["codeActe"], "date": a["dateActe"][:10],
                                             "issue": issue, "motions": motions})
    return infos


def refs_votes(noeud):
    if isinstance(noeud, list):
        for n in noeud:
            yield from refs_votes(n)
    elif isinstance(noeud, dict):
        for k, v in noeud.items():
            if k == "voteRefs" and v:
                yield from liste(v.get("voteRef"))
            else:
                yield from refs_votes(v)


def lire(chemin: Path) -> IndexDossiers:
    dossiers, scrutin_vers_dossier, candidats = {}, {}, {}
    for dp in objets(chemin, "dossierParlementaire", "dossierParlementaire/"):
        dossiers[dp["uid"]] = {
            "titre": dp["titreDossier"]["titre"],
            "procedure": (dp.get("procedureParlementaire") or {}).get("libelle"),
            "legislature": dp.get("legislature"),
            **analyser_actes(dp),
        }
        for ref in refs_votes(dp.get("actesLegislatifs")):
            scrutin_vers_dossier[ref] = dp["uid"]

    for doc in objets(chemin, "document", "document/"):
        if doc.get("dossierRef") and doc.get("titres"):
            candidats.setdefault(cle_titre(doc["titres"]["titrePrincipal"]), set()).add(doc["dossierRef"])

    # Un titre partagé par plusieurs dossiers n'est retenu que si un seul d'entre eux
    # a été voté à l'Assemblée ; sinon il est ambigu et on ne s'en sert pas.
    votes = set(scrutin_vers_dossier.values())
    titre_vers_dossier = {}
    for cle, refs in candidats.items():
        if len(refs) > 1:
            refs = refs & votes
        if len(refs) == 1:
            titre_vers_dossier[cle] = refs.pop()
    return IndexDossiers(dossiers, scrutin_vers_dossier, titre_vers_dossier)


def executer(ctx: Contexte):
    ctx.artefacts["an.dossiers"] = {leg: lire(ctx.fichier(source(leg).nom))
                                    for leg in ctx.parametres["legislatures"]}


ETAPE = Etape("an.dossiers", executer, sources=lambda p: [source(leg) for leg in p["legislatures"]],
              description="dossiers législatifs : parcours, 49.3, rapprochement scrutin -> dossier")
