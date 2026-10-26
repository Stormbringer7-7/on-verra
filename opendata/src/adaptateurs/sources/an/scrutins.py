"""Scrutins publics de l'AN : décompte, positions de groupe, votes nominatifs.

Rattachements, tous par référence explicite :
- dossier et étape : l'acte du dossier qui cite le scrutin (`voteRefs`), sinon
  `objet/dossierLegislatif`, sinon le dossier de l'amendement voté ; plus de rapprochement par titre ;
- amendement : le numéro cité par l'intitulé (« l'amendement n° 8 de Mme X… ») dans la séance
  du scrutin (`seanceRef`), via l'amendement discuté dans cette séance sous ce numéro.

Mises au point (`miseAuPoint`) : ce qu'un député a fait savoir après le scrutin (« voulait voter
pour… »), y compris après un dysfonctionnement du système de vote. Fait distinct du vote : liens
`mise_au_point` scrutin → personne ; le vote enregistré (`canon.vote`) n'est jamais modifié.

La position majoritaire publiée (`positionMajoritaire`) n'est pas fiable (elle désigne parfois une
position minoritaire) : `position_majoritaire` est recalculée depuis le décompte du groupe.
Motions de censure : seuls les « pour » sont publiés.
"""

import re

from ....chargement import Document, Flux
from ....domaine.objets import Dependants, Objet
from .cas import amendement_cite
from .commun import LICENCE, Systeme, an, documents, fichier, jour, liste, lire, val

SCRUTINS = fichier("scrutins.json.zip", "loi/scrutins/Scrutins.json.zip")
RE_VOTE_FINAL = re.compile(r"^l'(ensemble|article unique) (?:du projet|de la proposition) de loi", re.I)
NATURES = [("amendement", re.compile(r"^(?:l'|les |le )(?:sous-)?amendements?\b", re.I)),
           ("article", re.compile(r"^(?:l'|les )articles?\b", re.I)),
           ("motion", re.compile(r"^la motion\b", re.I))]
AMENDEMENT_CITE = re.compile(r"\bamendements? n[°o]\s*(\d+)", re.I)
NOMINATIF = {"pours": "pour", "contres": "contre", "abstentions": "abstention", "nonVotants": "non_votant",
             "pour": "pour", "contre": "contre"}
# miseAuPoint/<clé> et miseAuPoint/dysfonctionnement/<clé> -> position voulue, selon la mise au point
MISE_AU_POINT = {"pours": "pour", "pour": "pour", "contres": "contre", "contre": "contre",
                 "abstentions": "abstention", "nonVotants": "non_votant",
                 "nonVotantsVolontaires": "non_votant_volontaire"}


def nature(titre: str) -> str:
    titre = titre.replace("’", "'")
    if m := RE_VOTE_FINAL.match(titre):
        return "ensemble" if m.group(1).lower() == "ensemble" else "article_unique"
    return next((n for n, motif in NATURES if motif.match(titre)), "autre")


def votants(noeud):
    if isinstance(noeud, list):
        for n in noeud:
            yield from votants(n)
    elif isinstance(noeud, dict):
        if "acteurRef" in noeud:
            yield noeud
        else:
            for v in noeud.values():
                yield from votants(v)


def majoritaire(compte: dict[str, int]) -> str | None:
    (premiere, n1), (_, n2) = sorted(compte.items(), key=lambda kv: -kv[1])[:2]
    return premiere if n1 > n2 else None


def mises_au_point(s: dict) -> list[dict]:
    """Lignes `lien` scrutin → personne, telles que publiées : position voulue, clé publiée,
    dysfonctionnement ou non. Une personne citée deux fois n'est gardée qu'à sa première mention."""
    m = s.get("miseAuPoint") or {}
    lignes = {}
    for dysfonctionnement, groupe in ((False, m), (True, m.get("dysfonctionnement") or {})):
        for cle, position in MISE_AU_POINT.items():
            for v in votants(groupe.get(cle)):
                ref = val(v["acteurRef"])
                lignes.setdefault(ref, {"vers_id": an("acteur", ref), "ordre": len(lignes), "attributs": {
                    "position": position, "cle_publiee": cle, "dysfonctionnement": dysfonctionnement,
                    "par_delegation": val(v.get("parDelegation")) == "true"}})
    return list(lignes.values())


def scrutin(doc: Document, actes_du_scrutin: dict[str, tuple[str, str]], chercher_amendements,
            dossier_de_l_amendement=lambda uid: None):
    s = lire(doc)["scrutin"]
    uid, ident = s["uid"], an("scrutin", s["uid"])
    titre = s.get("titre") or (s.get("objet") or {}).get("libelle") or ""
    dossier, acte = actes_du_scrutin.get(uid, (None, None))
    dossier = dossier or val(((s.get("objet") or {}).get("dossierLegislatif") or {}).get("dossierRef"))
    seance = val(s.get("seanceRef"))
    cites, manques = chercher_amendements(seance, AMENDEMENT_CITE.findall(titre)[:1], dossier) if seance else ([], [])
    dossier = dossier or (dossier_de_l_amendement(cites[0]) if cites else None)
    synthese = s.get("syntheseVote") or {}
    decompte = synthese.get("decompte") or {}
    entier = lambda x: int(val(x)) if val(x) not in (None, "") else None
    yield Objet("scrutin", ident, {
        "chambre": "AN", "numero": s["numero"], "legislature": s.get("legislature"), "date": jour(s["dateScrutin"]),
        "titre": titre, "nature": "motion_censure" if s["typeVote"]["codeTypeVote"] == "MOC" else nature(titre),
        "type_vote": s["typeVote"].get("libelleTypeVote"), "sort": (s.get("sort") or {}).get("code"),
        "votants": entier(synthese.get("nombreVotants")), "pour": entier(decompte.get("pour")),
        "contre": entier(decompte.get("contre")), "abstentions": entier(decompte.get("abstentions")),
        "non_votants": entier(decompte.get("nonVotants")), "dossier_id": an("dossier", dossier),
        "etape_id": an("acte", acte) if acte else None,
        "amendement_id": an("amendement", cites[0]) if cites else None},
        "/scrutin", f"https://www.assemblee-nationale.fr/dyn/17/scrutins/{s['numero']}")

    positions, votes = [], {}
    for g in liste((((s.get("ventilationVotes") or {}).get("organe") or {}).get("groupes") or {}).get("groupe")):
        groupe = an("organe", val(g.get("organeRef")))
        voix = (g.get("vote") or {}).get("decompteVoix") or {}
        compte = {"pour": entier(voix.get("pour")) or 0, "contre": entier(voix.get("contre")) or 0,
                  "abstention": entier(voix.get("abstentions", voix.get("abstention"))) or 0}
        positions.append({"groupe_id": groupe, "position_majoritaire": majoritaire(compte),
                          "membres": entier(g.get("nombreMembresGroupe")), "pour": compte["pour"],
                          "contre": compte["contre"], "abstentions": compte["abstention"],
                          "non_votants": entier(voix.get("nonVotants"))})
        nominatif = (g.get("vote") or {}).get("decompteNominatif") or {}
        for cle, position in NOMINATIF.items():
            for v in votants(nominatif.get(cle)):
                votes[val(v["acteurRef"])] = {"personne_id": an("acteur", val(v["acteurRef"])), "position": position,
                                              "groupe_id": groupe, "par_delegation": val(v.get("parDelegation")) == "true",
                                              "cause": val(v.get("causePositionVote")), "siege": entier(v.get("numPlace"))}
    for numero, candidats in manques:
        yield amendement_cite(f"amendement_cite:AN:scrutin:{uid}", numero, candidats, [("scrutin", ident)],
                              {"ou": f"scrutin {uid}", "titre": titre})
    yield Dependants("position_groupe", {"scrutin_id": ident}, positions, "/scrutin/ventilationVotes",
                     ("groupe_id",))
    yield Dependants("vote", {"scrutin_id": ident}, list(votes.values()), "/scrutin/ventilationVotes",
                     ("personne_id",))
    yield Dependants("lien", {"de_id": ident, "nature": "mise_au_point"}, mises_au_point(s), "/scrutin/miseAuPoint",
                     ("vers_id",))


def flux(chemin, actes_du_scrutin, chercher_amendements, dossier_de_l_amendement) -> list[Flux]:
    return [Flux(Systeme.AN, LICENCE, lambda: documents(SCRUTINS, chemin),
                 lambda doc: scrutin(doc, actes_du_scrutin, chercher_amendements, dossier_de_l_amendement))]
