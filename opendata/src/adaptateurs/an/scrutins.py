"""Scrutins publics : tous les scrutins (votes finaux, articles, amendements, motions de procédure)
et les motions de censure, avec votes nominatifs."""

import re
from collections import Counter
from pathlib import Path
from typing import Iterator

from ...etl import Contexte, Etape, Ligne
from .commun import SUFFIXES, fichier, liste, objets, place, votants
from .dossiers import IndexDossiers, cle_titre

# Vote final : sur l'ensemble (ou l'article unique) d'un texte de loi, pas d'une résolution.
RE_VOTE_FINAL = re.compile(
    r"^l'(ensemble|article unique) (?:du projet|de la proposition) de loi", re.IGNORECASE
)
# Autres scrutins, reconnus au début de leur intitulé ; le reste est "autre" (première partie
# d'un budget, résolution, déclaration du gouvernement…).
NATURES = [
    ("amendement", re.compile(r"^(?:l'|les |le )(?:sous-)?amendements?\b", re.IGNORECASE)),
    ("article", re.compile(r"^(?:l'|les )articles?\b", re.IGNORECASE)),
    ("motion", re.compile(r"^la motion\b", re.IGNORECASE)),
]
FINALES = ("ensemble", "article_unique")
RE_LECTURE = re.compile(r"\(([^()]*)\)\.?\s*$")
# Texte visé par un scrutin quelconque : "l'amendement n° 12 ... du projet de loi X (première lecture)."
RE_TEXTE_VISE = re.compile(r"\b(?:du|de la|sur le|sur la) ((?:projet|proposition) de loi\b.*)", re.IGNORECASE)
RE_PREFIXE = re.compile(r"^l'(?:ensemble|article unique) (?:du |de la )", re.IGNORECASE)

POSITIONS = {"pours": "pour", "contres": "contre", "abstentions": "abstention", "nonVotants": "non_votant"}
# Décompte nominatif : la 14e écrit "pour" et "contre" au singulier.
NOMINATIF = {**POSITIONS, "pour": "pour", "contre": "contre"}
POSITIONS_MAP = {**POSITIONS, "nonVotantsVolontaires": "non_votant",
                 "pour": "pour", "contre": "contre"}


def source(legislature: str):
    return fichier("scrutins", legislature, "loi/scrutins/"
                   f"Scrutins{SUFFIXES.get(legislature, '')}.json.zip")


def ligne_groupe(compte: dict[str, int]) -> str | None:
    """Position la plus fréquente du groupe ; None si personne n'a voté ou en cas d'égalité.

    Le champ officiel positionMajoritaire n'est pas fiable : sur 58 scrutins de la 17e
    législature, il désigne une position minoritaire (ex. "abstention" pour 57 contre, 6 abst.).
    """
    (premiere, n1), (_, n2) = sorted(compte.items(), key=lambda kv: -kv[1])[:2]
    return premiere if n1 > n2 else None


def titre_texte(titre_scrutin: str) -> str:
    """'l'ensemble du projet de loi X (première lecture).' -> 'Projet de loi X'"""
    t = RE_LECTURE.sub("", titre_scrutin).strip().rstrip(".")
    t = RE_PREFIXE.sub("", t).replace("’", "'")
    return t[:1].upper() + t[1:]


def nature(titre: str) -> str:
    titre = titre.replace("’", "'")
    m = RE_VOTE_FINAL.match(titre)
    if m:
        return "ensemble" if m.group(1).lower() == "ensemble" else "article_unique"
    return next((n for n, motif in NATURES if motif.match(titre)), "autre")


def dossier_du_scrutin(s: dict, index: IndexDossiers) -> str | None:
    """Dossier visé par un scrutin quelconque (vote final, amendement, article, motion de procédure)."""
    ref = index.scrutin_vers_dossier.get(s["uid"]) or ((s["objet"].get("dossierLegislatif") or {}).get("dossierRef"))
    if ref:
        return ref
    m = RE_TEXTE_VISE.search(s["titre"])
    return index.titre_vers_dossier.get(cle_titre(RE_LECTURE.sub("", m.group(1)).strip().rstrip("."))) if m else None


def lignes_motion(s: dict) -> Iterator[Ligne]:
    """Motion de censure : seuls les votes "pour" existent, il n'y a ni contre ni abstention."""
    dec = s["syntheseVote"]
    pour, requis = int(dec["decompte"]["pour"]), int(dec["nbrSuffragesRequis"])
    yield Ligne("motions_censure", {"scrutin_uid": s["uid"], "numero": int(s["numero"]),
                                    "legislature": s["legislature"], "date": s["dateScrutin"], "titre": s["titre"],
                                    "article": "49-3" if "alinéa 3" in s["titre"] else "49-2",
                                    "pour": pour, "requis": requis, "adoptee": int(pour >= requis)})
    for g in liste(s["ventilationVotes"]["organe"]["groupes"]["groupe"]):
        nominatif = g["vote"]["decompteNominatif"] or {}
        for v in votants(nominatif.get("pours") or nominatif.get("pour")):
            yield Ligne("votes_censure", {"scrutin_uid": s["uid"], "acteur_ref": v["acteurRef"],
                                          "groupe_ref": g["organeRef"],
                                          "par_delegation": int(v.get("parDelegation") == "true"),
                                          "num_place": place(v.get("numPlace"))})


def loi_vote_final(s: dict, index: IndexDossiers, dossiers: dict) -> dict:
    """Loi d'un vote final : son dossier, sinon une loi identifiée par le titre du texte."""
    dossier_ref = index.scrutin_vers_dossier.get(s["uid"]) or \
        ((s["objet"].get("dossierLegislatif") or {}).get("dossierRef")) or \
        index.titre_vers_dossier.get(cle_titre(titre_texte(s["titre"])))
    if dossier_ref:
        info = dossiers.get(dossier_ref, {})
        return {"id": dossier_ref, "dossier_ref": dossier_ref,
                "titre": info.get("titre") or titre_texte(s["titre"]), "procedure": info.get("procedure")}
    titre = titre_texte(s["titre"])
    # Un même titre peut être redéposé d'une législature à l'autre : ce sont deux lois.
    return {"id": f"titre:{s['legislature']}:{titre.lower()}", "dossier_ref": None,
            "titre": titre, "procedure": None}


def loi_autre_scrutin(s: dict, index: IndexDossiers, dossiers: dict) -> dict | None:
    """Loi visée par un article, un amendement ou une motion : seulement si son dossier est connu."""
    dossier_ref = dossier_du_scrutin(s, index)
    info = dossiers.get(dossier_ref) if dossier_ref else None
    if not info:
        return None
    return {"id": dossier_ref, "dossier_ref": dossier_ref, "titre": info["titre"], "procedure": info.get("procedure")}


def lignes_scrutin(s: dict, nature: str, loi: dict | None) -> Iterator[Ligne]:
    lecture = RE_LECTURE.search(s["titre"])
    if loi:
        yield Ligne("lois", loi, conflit="ignorer")

    dec = s["syntheseVote"]["decompte"]
    yield Ligne("scrutins", {
        "uid": s["uid"], "numero": int(s["numero"]), "legislature": s["legislature"], "date": s["dateScrutin"],
        "titre": s["titre"], "nature": nature, "lecture": lecture.group(1) if lecture else None,
        "type_vote": s["typeVote"]["libelleTypeVote"], "sort": s["sort"]["code"],
        "loi_id": loi["id"] if loi else None,
        "nb_votants": int(s["syntheseVote"]["nombreVotants"]), "pour": int(dec["pour"]),
        "contre": int(dec["contre"]), "abstentions": int(dec["abstentions"]),
        "non_votants": int(dec.get("nonVotants") or 0)})

    for g in liste(s["ventilationVotes"]["organe"]["groupes"]["groupe"]):
        voix = g["vote"]["decompteVoix"]
        # "abstention" au singulier en 14e.
        compte = {"pour": int(voix["pour"]), "contre": int(voix["contre"]),
                  "abstention": int(voix.get("abstentions", voix.get("abstention")))}
        yield Ligne("positions_groupes", {
            "scrutin_uid": s["uid"], "groupe_ref": g["organeRef"], "ligne": ligne_groupe(compte),
            "position_officielle": g["vote"]["positionMajoritaire"], "membres": int(g["nombreMembresGroupe"]),
            "pour": compte["pour"], "contre": compte["contre"], "abstentions": compte["abstention"]})
        nominatif = g["vote"]["decompteNominatif"] or {}
        for cle, position in NOMINATIF.items():
            for v in votants(nominatif.get(cle)):
                yield Ligne("votes", {
                    "scrutin_uid": s["uid"], "acteur_ref": v["acteurRef"], "mandat_ref": v.get("mandatRef"),
                    "groupe_ref": g["organeRef"], "position": position,
                    "par_delegation": int(v.get("parDelegation") == "true"),
                    "cause": v.get("causePositionVote"), "num_place": place(v.get("numPlace"))})

    for cle, contenu in (s.get("miseAuPoint") or {}).items():
        if cle == "dysfonctionnement":
            positions = [(POSITIONS_MAP[sous_cle], sous_contenu, 1)
                         for sous_cle, sous_contenu in (contenu or {}).items()]
        elif cle in POSITIONS_MAP:
            positions = [(POSITIONS_MAP[cle], contenu, 0)]
        else:
            continue
        for position, noeud, dysfonctionnement in positions:
            for v in votants(noeud):
                yield Ligne("mises_au_point", {"scrutin_uid": s["uid"], "acteur_ref": v["acteurRef"],
                                               "position_souhaitee": position,
                                               "dysfonctionnement": dysfonctionnement}, conflit="inserer")


def lignes(chemin: Path, index: IndexDossiers, dossiers: dict, nb_scrutins: Counter) -> Iterator[Ligne]:
    """Scrutins et motions de censure d'un fichier ; compte au passage les scrutins par dossier."""
    for s in objets(chemin, "scrutin"):
        if s["typeVote"]["codeTypeVote"] == "MOC":
            yield from lignes_motion(s)
            continue
        dossier = dossier_du_scrutin(s, index)
        if dossier:
            nb_scrutins[dossier] += 1
        n = nature(s["titre"])
        loi = loi_vote_final(s, index, dossiers) if n in FINALES else loi_autre_scrutin(s, index, dossiers)
        yield from lignes_scrutin(s, n, loi)


def executer(ctx: Contexte):
    # Un dossier peut être ouvert sous une législature et voté sous la suivante :
    # les dossiers sont cumulés, les rapprochements restent par législature.
    dossiers, nb_scrutins = {}, Counter()
    for leg, index in ctx.artefacts["an.dossiers"].items():
        dossiers.update(index.dossiers)
        avant = ctx.chargeur.ecrites["scrutins"]
        ctx.chargeur.ecrire_tout(lignes(ctx.fichier(source(leg).nom), index, dossiers, nb_scrutins))
        print(f"{leg}e législature : {ctx.chargeur.ecrites['scrutins'] - avant} scrutins")
    ctx.artefacts["an.dossiers_cumules"] = dossiers
    ctx.artefacts["an.nb_scrutins"] = nb_scrutins


ETAPE = Etape("an.scrutins", executer, apres=("an.acteurs", "an.dossiers"),
              sources=lambda p: [source(leg) for leg in p["legislatures"]],
              description="tous les scrutins, votes nominatifs, lignes de groupe, motions de censure")
