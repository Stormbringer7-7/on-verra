"""Dossiers législatifs du Sénat (DOSLEG) : dossier (table `loi`) et ses étapes publiées.

Un dossier que l'AN cite (`senatChemin`) est déjà relié au dossier canonique par l'adaptateur
AN : le Sénat n'y réécrit rien, ni le dossier ni ses étapes (deux sources pour les mêmes champs, ce
serait le dernier écrivain qui gagne). Tous les autres dossiers du Sénat sont créés, quelle que
soit leur session : les débats d'aujourd'hui citent aussi des textes déposés il y a plusieurs
sessions.

Étapes, telles que DOSLEG les publie, rangées par lecture (`lecture`, ordre `typlec.typlecord`) puis
par assemblée (`lecass`, `ordreass`) :
- un texte (`texte`) : ce qui lui est arrivé (`oritxtcod` : déposé, transmis, de la commission,
  adopté, modifié, rejeté, considéré comme adopté en application du 49.3…), daté (`txtoritxtdat`) ;
- un rapport (`lecassrap` → `rap`), daté de son dépôt ;
- une séance (`date_seance` : sa colonne `lecidt` désigne une `lecass`).
Et au niveau de la loi : procédure accélérée (`proaccdat`), saisine et décision du Conseil
constitutionnel, promulgation, Journal officiel, état (`etaloicod` : fusionné, caduc, retiré).

Code de chaque étape (`code_source`), lu par `opendata/parcours/correspondances.toml` :
« DOSLEG-<typleccod>-<codass>-TXT<oritxtcod> » (suffixe « -REPRIS » : texte daté d'avant le dépôt
ou la transmission dans cette assemblée, repris d'une étape précédente comme base),
« DOSLEG-<typleccod>-<codass>-RAP »,
« DOSLEG-<typleccod>-<codass>-SEANCE », « DOSLEG-PROCACC », « DOSLEG-CC-SAISINE », « DOSLEG-CC »,
« DOSLEG-PROM », « DOSLEG-JO », « DOSLEG-ETAT-<etaloicod> ». Rien n'est déduit : une ligne absente
de DOSLEG n'est pas une étape.
"""

from collections import defaultdict

from ....chargement import Flux, charger
from ....domaine import Methode, Statut
from ....domaine.objets import Objet
from ....etl import Etape, Fichier
from .commun import DONNEES, LICENCE, Systeme, document_ligne, jour, senat, table_dump

DOSLEG = Fichier("dosleg.zip", f"{DONNEES}/dosleg/dosleg.zip")

# typleccod -> lecture (canon.etape.lecture)
LECTURES = {"1": "1", "2": "2", "3": "3", "7": "4", "4": "cmp", "5": "nouvelle", "6": "definitive", "8": "congres",
            "9": "referendum"}
CHAMBRES = {"A": "AN", "S": "SENAT", "I": "CMP"}
# etaloicod -> statut du dossier ; les états qui terminent un parcours sont aussi une étape (ETAT-…)
STATUTS = {"01": "en_cours", "02": "fusionne", "03": "rejete", "04": "promulgue", "05": "caduc", "06": "retire"}
ETATS_ETAPES = {"02", "05", "06"}
# oritxtcod d'un texte déposé ou transmis : son étape est un dépôt
DEPOTS = {"0", "1", "3", "4", "38", "46"}
DECISIONS_CC = {"01": "conforme", "02": "partiellement conforme", "03": "non conforme", "04": "se déclare incompétent"}


def _propre(ligne: dict) -> dict:
    """Les dumps complètent clés et codes d'espaces : valeurs nettoyées avant toute jointure."""
    return {k: v.strip() if isinstance(v, str) else v for k, v in ligne.items()}


def lire_dosleg(chemin) -> dict[str, dict]:
    """loicod -> la loi et tout ce que DOSLEG en publie (lectures, assemblées, textes, rapports,
    séances), libellés résolus : une seule lecture du dump, un document par loi."""
    def table(nom):
        return [_propre(l) for l in table_dump(chemin, "dosleg.sql", nom)]

    typloi = {t["typloicod"]: t["typloilib"] for t in table("typloi")}
    typlec = {t["typleccod"]: t for t in table("typlec")}
    oritxt = {t["oritxtcod"]: t["oritxtlib"] for t in table("oritxt")}
    rap = {r["rapcod"]: r for r in table("rap")}
    rapports, seances, textes = defaultdict(list), defaultdict(list), defaultdict(list)
    for r in table("lecassrap"):
        if r["rapcod"] in rap:
            rapports[r["lecassidt"]].append(rap[r["rapcod"]])
    for s in table("date_seance"):
        seances[s["lecidt"]].append(s)
    for t in table("texte"):
        textes[t["lecassidt"]].append({**t, "oritxtlib": oritxt.get(t["oritxtcod"])})
    assemblees = defaultdict(list)
    for a in table("lecass"):
        assemblees[a["lecidt"]].append({**a, "textes": textes[a["lecassidt"]], "rapports": rapports[a["lecassidt"]],
                                        "seances": seances[a["lecassidt"]]})
    lectures = defaultdict(list)
    for l in table("lecture"):
        t = typlec.get(l["typleccod"]) or {}
        lectures[l["loicod"]].append({**l, "typlecord": t.get("typlecord"), "typleclib": t.get("typleclib"),
                                      "assemblees": sorted(assemblees[l["lecidt"]], key=lambda a: int(a["ordreass"] or 0))})
    return {l["loicod"]: {**l, "typloilib": typloi.get(l["typloicod"]), "lectures": lectures[l["loicod"]]}
            for l in table("loi")}


def actes(l: dict) -> list[dict]:
    """Les étapes publiées d'une loi, dans l'ordre : lectures, puis Conseil constitutionnel,
    promulgation, JO, état ; chacune avec son identité native (clé stable)."""
    resultat = []

    def ajouter(cle, code, type_, chambre, lecture, debut, libelle=None, conclusion=None, parent=None):
        resultat.append({"cle": cle, "code": code, "type": type_, "chambre": chambre, "lecture": lecture,
                         "debut": jour(debut), "libelle": libelle, "conclusion": conclusion, "parent": parent})

    if l.get("proaccdat"):
        ajouter("procacc", "DOSLEG-PROCACC", "procedure_acceleree", None, "1", l["proaccdat"], "Procédure accélérée")
    def rang_lecture(x):
        return int(x["typlecord"] or 0), min((t["txtoritxtdat"] or "9") for a in x["assemblees"] for t in a["textes"]) \
            if any(a["textes"] for a in x["assemblees"]) else "9"
    for lec in sorted(l["lectures"], key=rang_lecture):
        typ = lec["typleccod"]
        racine = f"lecture:{lec['lecidt']}"
        ajouter(racine, f"DOSLEG-{typ}", "lecture", None, LECTURES.get(typ, typ), None, lec.get("typleclib"))
        for a in lec["assemblees"]:
            ass, prefixe = a["codass"], f"DOSLEG-{typ}-{a['codass']}"
            chambre = CHAMBRES.get(ass) if ass != "I" or typ == "4" else None
            # Texte daté d'avant le dépôt ou la transmission dans cette assemblée : le texte d'une
            # étape précédente, repris comme base (lecture définitive : le dernier texte de l'AN).
            debut = min((t["txtoritxtdat"] for t in a["textes"] if t["oritxtcod"] in DEPOTS and t["txtoritxtdat"]), default=None)
            repris = lambda t: t["oritxtcod"] not in DEPOTS and debut and (t["txtoritxtdat"] or "9") < debut
            elements = (
                [(t["txtoritxtdat"], 0 if t["oritxtcod"] in DEPOTS else 2, f"texte:{t['texcod']}",
                  f"{prefixe}-TXT{t['oritxtcod']}" + ("-REPRIS" if repris(t) else ""),
                  "depot" if t["oritxtcod"] in DEPOTS else "decision", f"Texte n° {t['texnum']}" if t.get("texnum") else None,
                  t["oritxtlib"]) for t in a["textes"]]
                + [(r["date_depot"], 1, f"rapport:{r['rapcod']}", f"{prefixe}-RAP", "rapport",
                    f"Rapport n° {r['rapnum']}" if r.get("rapnum") else None, None) for r in a["rapports"]]
                + [(s["date_s"], 1, f"seance:{a['lecassidt']}:{s['code'] or s['date_s']}", f"{prefixe}-SEANCE", "seance",
                    "Séance publique", None) for s in a["seances"]])
            for debut, _, cle, code, type_, libelle, conclusion in sorted(elements, key=lambda e: (e[0] or "9", e[1], e[2])):
                ajouter(cle, code, type_, chambre, LECTURES.get(typ, typ), debut, libelle, conclusion, racine)
    if l.get("saisine_date"):
        ajouter("cc_saisine", "DOSLEG-CC-SAISINE", "saisine_cc", "CC", "cc", l["saisine_date"], "Saisine du Conseil constitutionnel",
                f"Saisi par {l['saisine_par']}" if l.get("saisine_par") else None)
    if l.get("date_decision") or l.get("deccoccod"):
        ajouter("cc", "DOSLEG-CC", "decision_cc", "CC", "cc", l.get("date_decision"), "Décision du Conseil constitutionnel",
                " ".join(x for x in (f"n° {l['num_decision']}" if l.get("num_decision") else None,
                                     DECISIONS_CC.get(l.get("deccoccod") or "")) if x) or None)
    if l.get("date_loi"):
        ajouter("prom", "DOSLEG-PROM", "promulgation", "PR", "prom", l["date_loi"], "Promulgation",
                f"Loi n° {l['numero']}" if l.get("numero") else None)
    if l.get("loidatjo"):
        ajouter("jo", "DOSLEG-JO", "publication_jo", "JO", "prom", l["loidatjo"], "Journal officiel",
                f"JO n° {l['loinumjo']}" if l.get("loinumjo") else None)
    if l.get("etaloicod") in ETATS_ETAPES:
        ajouter("etat", f"DOSLEG-ETAT-{l['etaloicod']}", "etat", None, None, None, STATUTS[l["etaloicod"]])
    return resultat


def _ident(l: dict, a: dict):
    return senat("acte", f"{l['signet']}:{a['cle']}")


def dossier(doc):
    l = doc.donnees
    ident = senat("dossier", l["signet"])
    tous = actes(l)
    depots = [a["debut"] for a in tous if a["type"] == "depot" and a["debut"]]
    yield Objet("dossier", ident, {
        "titre": " ".join(x for x in ((l.get("loient") or "").strip(), (l.get("loitit") or "").strip()) if x) or l["signet"],
        "titre_court": (l.get("motclef") or "").strip() or None,
        "type_procedure": l.get("typloilib"),
        "procedure_acceleree": l.get("proaccdat") is not None,
        "date_depot": min(depots) if depots else None,
        "statut": STATUTS.get(l.get("etaloicod") or "")}, f"/loi/{l['loicod']}",
        f"https://www.senat.fr/dossier-legislatif/{l['signet']}.html")
    for ordre, a in enumerate(tous):
        yield Objet("etape", _ident(l, a), {
            "dossier_id": ident, "parent_id": senat("acte", f"{l['signet']}:{a['parent']}") if a["parent"] else None,
            "type": a["type"], "code_source": a["code"], "libelle": a["libelle"], "chambre": a["chambre"],
            "lecture": a["lecture"], "ordre": ordre, "debut": a["debut"], "statut": "faite", "conclusion": a["conclusion"]},
            f"/loi/{l['loicod']}/{a['cle']}")


def executer(ctx):
    chemin = ctx.fichier(DOSLEG.nom)
    lois = lire_dosleg(chemin)

    def relie_par_l_an(identite) -> bool:
        """L'identité Sénat est reliée par référence (l'AN cite le dossier), pas créée par le Sénat."""
        return any(c.methode != Methode.OFFICIAL_ID and c.statut == Statut.VERIFIED
                   for c in ctx.entrepot.correspondances(identite))

    def documents():
        for l in lois.values():
            # déjà relié à un dossier AN : rien à écrire côté Sénat
            if l.get("signet") and not relie_par_l_an(senat("dossier", l["signet"])):
                yield document_ligne(DOSLEG, "loi", l["loicod"], l)

    def prealable(doc):
        l = doc.donnees
        return [("dossier", senat("dossier", l["signet"]))] + [("etape", _ident(l, a)) for a in actes(l)]

    charger(ctx, Flux(Systeme.SENAT, LICENCE, documents, dossier, prealable))


ETAPE = Etape("senat.dossiers", executer, apres=("an.travaux",), sources=lambda p: [DOSLEG],
              description="dossiers du Sénat (DOSLEG) non cités par l'AN, ceux-là étant déjà reliés, et leurs étapes")
