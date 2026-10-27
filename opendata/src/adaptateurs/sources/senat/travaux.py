"""Amendements (AMELI) et scrutins publics (DOSLEG) du Sénat, depuis la session 2024-2025.

Références, toutes explicites :
- amendement → dossier : `txt_ameli.doslegsignet` ; → article : `sub.lib` ; auteurs : `amdsen`
  (rang 1 = auteur, les suivants cosignataires) → `sen_ameli.mat` (matricule) ;
- amendement → article suivi : numéro officiel de `sub.lib` (`amd.subpos` = 0 : sur la subdivision
  elle-même ; une annexe : l'article parent `sub.merid`) et clé du dossier `SENAT:dossier:<signet>` ;
- amendement → étape : seulement par le dossier AN qui cite le signet (`senatChemin`), la lecture qui
  cite le numéro du texte AMELI et dont le code concorde (`txt_ameli.lecid`), puis l'étape de cette
  lecture : commission au fond (texte de commission, `txttyp` C) ou séance (`txttyp` S) ;
- avis publiés : de la commission (`avcid`) et du Gouvernement (`avgid`) ;
- scrutin → dossier : `scr.code` → `date_seance` → `lecass` → `lecture` → `loi.signet`
  (`date_seance.lecidt` désigne en fait une lecture par assemblée, `lecass.lecassidt`) ;
- scrutin → amendement : `amescr` (numéro d'amendement) dans le texte du même dossier ;
- votes : `votsen` (matricule, position, statut : délégation, déport…) ;
- sort (« adopté », « rejeté ») : absent de DOSLEG, il est pris de l'annonce du président au compte
  rendu intégral du jour du scrutin (`resultats`), jamais déduit des voix.
Les dumps complètent leurs clés d'espaces : elles sont nettoyées avant toute jointure.
"""

import re

from ....chargement import Document, Flux, charger
from ....domaine.objets import Candidat, CasRevue, Dependants, Objet
from ....etl import Etape, Fichier
from ....textes import article_suivi, numero_article
from ..an import dossiers as dossiers_an
from ..an.commun import an
from . import resultats
from .commun import DONNEES, LICENCE, Systeme, document_ligne, jour, senat, table_dump
from .dossiers import DOSLEG

AMELI = Fichier("ameli.zip", f"{DONNEES}/ameli/ameli.zip")
MEMBRE_AMELI, MEMBRE_DOSLEG = "var/opt/opendata/ameli.sql", "dosleg.sql"
PREMIERE_ANNEE = 2024
SORTS = {"Adopté": "adopte", "Adopté - vote unique": "adopte", "Adopté avec modification": "adopte",
         "Rejeté": "rejete", "Rejeté - vote unique": "rejete", "Retiré": "retire", "Non soutenu": "non_soutenu",
         "Tombé": "tombe", "Satisfait ou sans objet": "tombe"}
AVIS = {"F": "favorable", "D": "defavorable", "S": "sagesse", "R": "retrait", "G": "avis_du_gouvernement"}
POSITIONS = {"1": "pour", "2": "contre", "3": "abstention", "4": "non_votant"}
# Lecture AMELI (`lec_ameli`) -> code de la lecture dans les dossiers de l'AN.
LECTURES = {"1": "SN1", "2": "SN2", "3": "CMP", "4": "SNNLEC"}
# Étape d'examen selon le texte AMELI : texte de commission (C) -> commission saisie au fond ;
# texte de séance (S) -> séance publique du Sénat (conclusions de CMP : `CMP-DEBATS-SN`).
EXAMEN = {"C": re.compile(r"-COM-FOND$"), "S": re.compile(r"^(?:SN[^-]+-DEBATS|CMP-DEBATS-SN)$")}
# Subdivisions AMELI (`typsub`) sans article existant : intitulé du texte, titre, chapitre, section.
SANS_ARTICLE = {"1": "intitule", "2": "division", "3": "division", "8": "division", "9": "division"}


def propre(x):
    return x.strip() if isinstance(x, str) else x


def table(chemin, membre, nom):
    return [{k.strip('"'): propre(v) for k, v in l.items()} for l in table_dump(chemin, membre, nom)]


class Referentiel:
    """Tables de correspondance lues une fois : textes, subdivisions, sorts, sénateurs, séances."""

    def __init__(self, ameli, dosleg, examens=None):
        annees = {s["id"]: int(s["ann"]) for s in table(ameli, MEMBRE_AMELI, "ses")}
        self.textes = {t["id"]: t for t in table(ameli, MEMBRE_AMELI, "txt_ameli")
                       if annees.get(t["sesdepid"], 0) >= PREMIERE_ANNEE and t.get("doslegsignet")}
        self.divisions = {s["id"]: s for s in table(ameli, MEMBRE_AMELI, "sub") if s["txtid"] in self.textes}
        self.subdivisions = {i: s["lib"] for i, s in self.divisions.items()}
        # Lectures dont une commission pour avis a reçu délégation au fond d'articles (`sai.isdelegfond`) :
        # les amendements de commission n'y sont pas tous examinés par la commission au fond.
        self.delegations = {(self.textes[s["txtid"]]["doslegsignet"], self.textes[s["txtid"]]["lecid"])
                            for s in table(ameli, MEMBRE_AMELI, "sai") if s["txtid"] in self.textes and s["isdelegfond"] == "O"}
        self.examens = examens                 # dossiers.Examens de l'AN, pour l'étape ; None : pas d'étape
        self.sorts = {s["id"]: s["lib"] for s in table(ameli, MEMBRE_AMELI, "sor")}
        self.matricules = {s["entid"]: s["mat"] for s in table(ameli, MEMBRE_AMELI, "sen_ameli")}
        self.auteurs: dict[str, list[dict]] = {}
        for a in table(ameli, MEMBRE_AMELI, "amdsen"):
            self.auteurs.setdefault(a["amdid"], []).append(a)
        signets = {l["loicod"]: l["signet"] for l in table(dosleg, MEMBRE_DOSLEG, "loi")}
        self.signets = set(signets.values())   # dossiers créés par senat.dossiers : un suivi en a besoin
        lectures = {l["lecidt"]: signets.get(l["loicod"]) for l in table(dosleg, MEMBRE_DOSLEG, "lecture")}
        par_assemblee = {l["lecassidt"]: lectures.get(l["lecidt"]) for l in table(dosleg, MEMBRE_DOSLEG, "lecass")}
        self.dossier_de_seance = {d["code"]: par_assemblee.get(d["lecidt"])
                                  for d in table(dosleg, MEMBRE_DOSLEG, "date_seance")}
        self.amendements_de_scrutin: dict[tuple[str, str], list[str]] = {}
        for a in table(dosleg, MEMBRE_DOSLEG, "amescr"):
            self.amendements_de_scrutin.setdefault((a["sesann"], a["scrnum"]), []).append(a["amescrnum"])
        self.votes: dict[tuple[str, str], list[dict]] = {}
        for v in table(dosleg, MEMBRE_DOSLEG, "votsen"):
            if int(v["sesann"]) >= PREMIERE_ANNEE:
                self.votes.setdefault((v["sesann"], v["scrnum"]), []).append(v)
        self.statuts = {s["stavotidt"]: s["stavotlib"] for s in table(dosleg, MEMBRE_DOSLEG, "stavot")}
        # (signet, numéro) -> amendements : un dossier a un texte par lecture, qui peuvent réutiliser
        # les mêmes numéros ; un numéro qui désigne plusieurs amendements n'est pas relié.
        self.amendement_par_numero: dict[tuple[str, str], list[str]] = {}

    def indexer(self, amendements: list[dict]):
        for a in amendements:
            cle = (self.textes[a["txtid"]]["doslegsignet"], re.sub(r"\D", "", a["num"] or ""))
            self.amendement_par_numero.setdefault(cle, []).append(a["id"])

    def amendements_votes(self, signet: str | None, numero: str) -> list[str]:
        """Amendements du dossier portant ce numéro : un seul, c'est lui ; plusieurs ou aucun, revue."""
        return self.amendement_par_numero.get((signet, re.sub(r"\D", "", numero)), []) if signet else []


def article_vise(a: dict, ref: Referentiel) -> tuple[str, str | None]:
    """Mêmes natures que pour l'AN (`an.amendements.article_vise`) : (« article », numéro), une
    absence voulue (« additionnel », « intitule », « division », « sans_division ») ou « illisible »."""
    sub = ref.divisions.get(a.get("subid"))
    if not sub:
        return "sans_division", None
    if (a.get("subpos") or "0") != "0" or sub["lib"].startswith("Article additionnel"):
        return "additionnel", None                 # avant (-10, -20) ou après (10, 20) la subdivision
    if sub["typid"] in SANS_ARTICLE:
        return SANS_ARTICLE[sub["typid"]], None
    if sub["typid"] == "7":                        # annexe (« État B ») : l'article qui la porte
        sub = ref.divisions.get(sub["merid"]) or {}
    numero = numero_article(sub.get("lib") or "") if sub.get("typid") == "4" else None
    return ("article", numero) if numero else ("illisible", None)


def etapes(texte: dict, ref: Referentiel) -> list[str]:
    """Étapes (« dossier:acte » de l'AN) où le texte AMELI est examiné ; vide si la chaîne de
    références n'aboutit pas à une seule lecture."""
    if ref.examens is None:
        return []
    signet = texte["doslegsignet"]
    lectures = ref.examens.lectures_senat.get(signet, [])
    numero = re.match(r"\d+", texte["num"] or "")
    if len({l[0] for l in lectures}) != 1 or not numero:
        return []                                  # signet cité par aucun ou par plusieurs dossiers AN
    cites = [l for l in lectures if str(int(numero.group())) in l[2]]
    if len(cites) != 1 or cites[0][1] != LECTURES.get(texte["lecid"]):
        return []
    if texte["txttyp"] == "C" and (signet, texte["lecid"]) in ref.delegations:
        return []
    motif = EXAMEN.get(texte["txttyp"])
    return [e for code, e, _ in cites[0][3] if motif and motif.search(code)]


def amendement(doc: Document, ref: Referentiel):
    a = doc.donnees
    texte = ref.textes[a["txtid"]]
    ident = senat("amendement", a["id"])
    signet, cas = texte["doslegsignet"], []
    nature, numero = article_vise(a, ref)
    suivi = article_suivi(f"SENAT:dossier:{signet}", numero) if nature == "article" and signet in ref.signets else None
    if suivi:
        yield Objet("article_suivi", suivi, {"dossier_id": senat("dossier", signet), "numero_initial": numero},
                    f"/sub/{a['subid']}")
    elif nature == "illisible":
        cas.append(CasRevue("article_vise_illisible", f"article_vise_illisible:{ident}", "constat",
                            f"{ident.id_source} : la subdivision « {ref.subdivisions.get(a['subid'])} » n'a pas de "
                            "numéro d'article lisible", contexte={"subdivision": ref.subdivisions.get(a["subid"])}))
    examinees = etapes(texte, ref)
    if len(examinees) > 1:
        cas.append(CasRevue("etape_ambigue", f"etape_ambigue:{ident}", "champ",
                            f"{ident.id_source} : le texte {texte['num']} désigne {len(examinees)} étapes du dossier {signet}",
                            champ="etape_id", cibles=(("amendement", ident),),
                            candidats=tuple(Candidat("etape", an("acte", e), e) for e in examinees),
                            contexte={"texte": texte["num"], "lecture": texte["lecid"], "dossier": signet}))
    yield Objet("amendement", ident, {
        "dossier_id": senat("dossier", signet), "chambre": "SENAT", "numero": a["num"],
        "article_suivi_id": suivi, "etape_id": an("acte", examinees[0]) if len(examinees) == 1 else None,
        "division": ref.subdivisions.get(a["subid"]), "sort": SORTS.get(ref.sorts.get(a["sorid"]), "en_attente"),
        "sort_source": ref.sorts.get(a["sorid"]), "date_depot": jour(a["datdep"]),
        "dispositif": a["dis"], "expose": a["obj"]}, f"/amd/{a['id']}")
    avis = [{"emetteur": emetteur, "avis": AVIS[code], "avis_source": code}
            for emetteur, code in (("commission", a.get("avcid")), ("gouvernement", a.get("avgid"))) if code in AVIS]
    yield Dependants("avis_amendement", {"amendement_id": ident}, avis, f"/amd/{a['id']}")
    signataires = sorted(ref.auteurs.get(a["id"], []), key=lambda s: int(s["rng"] or 0))
    personnes = [senat("senateur", m) for s in signataires if (m := ref.matricules.get(s["senid"]))]
    for nature, cibles in (("auteur", personnes[:1]), ("cosignataire", personnes[1:])):
        yield Dependants("lien", {"de_id": ident, "nature": nature},
                         [{"vers_id": c, "ordre": i} for i, c in enumerate(dict.fromkeys(cibles))], "/amdsen",
                         ("vers_id",))
    yield from cas


def scrutin(doc: Document, ref: Referentiel):
    s = doc.donnees
    cle = (s["sesann"], s["scrnum"])
    ident = senat("scrutin", f"{s['sesann']}-{s['scrnum']}")
    signet = ref.dossier_de_seance.get(s["code"])
    numeros = ref.amendements_de_scrutin.get(cle, [])
    amendements, problemes = [], []
    for n in numeros:
        candidats = ref.amendements_votes(signet, n)
        if len(candidats) == 1:
            amendements.append(candidats[0])
        else:
            problemes.append((n, candidats))
    entier = lambda x: int(x) if x not in (None, "") else None
    titre = s["scrint"] or ""
    annonces = s.get("resultat_seance") or []
    sorts = {a["sort"] for a in annonces}
    yield Objet("scrutin", ident, {
        "chambre": "SENAT", "numero": s["scrnum"], "date": jour(s["scrdat"]), "titre": titre,
        "nature": "amendement" if numeros else "ensemble" if re.match(r"sur l[’'\s]*ensemble", titre, re.I) else "autre",
        "votants": entier(s["scrvot"]), "pour": entier(s["scrpou"]), "contre": entier(s["scrcon"]),
        "sort": next(iter(sorts)) if len(sorts) == 1 else None,
        "dossier_id": senat("dossier", signet) if signet else None,
        "amendement_id": senat("amendement", amendements[0]) if len(amendements) == 1 else None},
        f"/scr/{s['sesann']}/{s['scrnum']}",
        f"https://www.senat.fr/scrutin-public/{s['sesann']}/scr{s['sesann']}-{s['scrnum']}.html")
    if annonces and (len(sorts) != 1 or None in sorts):
        yield CasRevue("resultat_scrutin_illisible", f"resultat_scrutin_illisible:{ident}", "constat",
                       f"scrutin {s['sesann']}-{s['scrnum']} : résultat annoncé en séance "
                       + ("non reconnu" if len(annonces) == 1 else f"{len(annonces)} fois, sans un seul sort"),
                       cibles=(("scrutin", ident),),
                       contexte={"annonces": [{"compte_rendu": a["compte_rendu"], "phrase": a["phrase"]}
                                              for a in annonces], "titre": titre})
    for n, candidats in problemes:
        ambigu = len(candidats) > 1
        yield CasRevue("amendement_ambigu" if ambigu else "amendement_introuvable",
                       f"amendement_cite:SENAT:scrutin:{s['sesann']}-{s['scrnum']}:{n}", "champ" if ambigu else "constat",
                       f"scrutin {s['sesann']}-{s['scrnum']} : amendement n° {n} "
                       + (f"désigne {len(candidats)} amendements du dossier {signet}" if ambigu
                          else f"introuvable dans le dossier {signet}"),
                       champ="amendement_id", cibles=(("scrutin", ident),),
                       candidats=tuple(Candidat("amendement", senat("amendement", u), u) for u in candidats),
                       contexte={"numero": n, "dossier": signet, "titre": titre})
    votes = {}
    for v in ref.votes.get(cle, []):
        statut = ref.statuts.get(v["stavotidt"])
        votes[v["senmat"]] = {"personne_id": senat("senateur", v["senmat"]),
                              "position": POSITIONS.get(v["posvotcod"], "non_votant"),
                              "par_delegation": bool(v.get("senmatdel")),
                              "cause": statut if v["stavotidt"] not in (None, "0") else None}
    yield Dependants("vote", {"scrutin_id": ident}, list(votes.values()), f"/votsen/{s['sesann']}/{s['scrnum']}",
                     ("personne_id",))


def executer(ctx):
    ameli, dosleg = ctx.fichier(AMELI.nom), ctx.fichier(DOSLEG.nom)
    # Index des dossiers de l'AN (étapes) : lu par an.travaux, qui tourne avant ; relu sinon.
    examens = ctx.artefacts.get("an.examens")
    if examens is None and dossiers_an.DOSSIERS.nom in ctx.fichiers:
        examens = dossiers_an.lire_examens(ctx.fichier(dossiers_an.DOSSIERS.nom))
    ref = Referentiel(ameli, dosleg, examens)
    annonces = resultats.lire(ctx.fichier(resultats.CRI.nom))

    lignes = [a for a in table(ameli, MEMBRE_AMELI, "amd") if a["txtid"] in ref.textes]
    ref.indexer(lignes)

    def amendements():
        for a in lignes:
            yield document_ligne(AMELI, "amd", a["id"], a)

    def scrutins():
        for s in table(dosleg, MEMBRE_DOSLEG, "scr"):
            if int(s["sesann"]) >= PREMIERE_ANNEE:
                # l'annonce du résultat fait partie du document : son empreinte la suit
                yield document_ligne(DOSLEG, "scr", f"{s['sesann']}-{s['scrnum']}",
                                     {**s, "votes": ref.votes.get((s["sesann"], s["scrnum"]), []),
                                      "resultat_seance": annonces.get(((s["scrdat"] or "")[:10], s["scrnum"]), [])})

    # Les amendements avant les scrutins, qui les citent.
    charger(ctx, Flux(Systeme.SENAT, LICENCE, amendements, lambda d: amendement(d, ref)),
            Flux(Systeme.SENAT, LICENCE, scrutins, lambda d: scrutin(d, ref)))


ETAPE = Etape("senat.travaux", executer, apres=("senat.senateurs", "senat.dossiers"), sources=lambda p: [AMELI, DOSLEG, resultats.CRI],
              description="amendements et avis (AMELI), scrutins et votes (DOSLEG), sort des scrutins (compte "
                          "rendu intégral) depuis la session 2024-2025")
