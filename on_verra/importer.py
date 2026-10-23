"""Télécharge l'open data de l'Assemblée nationale et construit la base SQLite."""

import json
import re
import unicodedata
import sqlite3
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

from .classement import classer_lois

BASE_URL = "https://data.assemblee-nationale.fr/static/openData/repository/{leg}"
LEGISLATURES = ["15", "16", "17"]
# Le fichier AMO30 est historique : celui de la dernière législature couvre tous les mandats.
ACTEURS = ("17", "amo/tous_acteurs_mandats_organes_xi_legislature/"
                 "AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip")
COULEURS_EMPRUNTEES = {"NG": "SOC", "LC": "UDI-A-I", "UDI-AGIR": "UDI-A-I", "UDI-I": "UDI-A-I"}
PROCEDURES_NON_LEGISLATIVES = {
    "Engagement de la responsabilité gouvernementale",
    "Déclaration du gouvernement avec ou sans vote sans engagement de responsabilité",
}
# Délai maximal entre un engagement de responsabilité et le vote de la motion qui le vise.
JOURS_MOTION = 7
# Les archives de la 15e législature portent un suffixe "_XV".
SUFFIXES = {"15": "_XV"}
SOURCES = {
    "scrutins": "loi/scrutins/Scrutins{suffixe}.json.zip",
    "dossiers": "loi/dossiers_legislatifs/Dossiers_Legislatifs{suffixe}.json.zip",
}

# Seuls les textes de loi nous intéressent (pas les propositions de résolution).
RE_VOTE_FINAL = re.compile(
    r"^l'(ensemble|article unique) (?:du projet|de la proposition) de loi", re.IGNORECASE
)
RE_LECTURE = re.compile(r"\(([^()]*)\)\.?\s*$")
# Texte visé par un scrutin quelconque : "l'amendement n° 12 ... du projet de loi X (première lecture)."
RE_TEXTE_VISE = re.compile(r"\b(?:du|de la|sur le|sur la) ((?:projet|proposition) de loi\b.*)", re.IGNORECASE)
RE_PREFIXE = re.compile(r"^l'(?:ensemble|article unique) (?:du |de la )", re.IGNORECASE)

# "organique" et "constitutionnelle" restent dans la clé : une loi ordinaire et sa loi organique
# jumelle portent souvent le même intitulé et sont deux dossiers distincts.
RE_NATURE_TEXTE = re.compile(r"^(?:(?:projet|proposition) de loi(?: ordinaire)?)?\s*,?")

POSITIONS = {"pours": "pour", "contres": "contre", "abstentions": "abstention", "nonVotants": "non_votant"}
POSITIONS_MAP = {**POSITIONS, "nonVotantsVolontaires": "non_votant",
                 "pour": "pour", "contre": "contre"}


def liste(x):
    """Le JSON de l'AN met un objet seul quand il n'y a qu'un élément, une liste sinon."""
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def votants(noeud):
    """Collecte les entrées 'votant' quelle que soit l'imbrication (dict, liste, null)."""
    if isinstance(noeud, list):
        for n in noeud:
            yield from votants(n)
    elif isinstance(noeud, dict):
        if "acteurRef" in noeud:
            yield noeud
        else:
            for v in noeud.values():
                yield from votants(v)


def telecharger_fichier(dossier: Path, nom: str, legislature: str, chemin: str, forcer: bool) -> Path:
    cible = dossier / f"{nom}_{legislature}.json.zip"
    if forcer or not cible.exists():
        url = f"{BASE_URL.format(leg=legislature)}/{chemin}"
        print(f"Téléchargement {url}")
        urllib.request.urlretrieve(url, cible)
    return cible


def telecharger(dossier: Path, legislature: str, forcer: bool) -> dict[str, Path]:
    dossier.mkdir(parents=True, exist_ok=True)
    suffixe = SUFFIXES.get(legislature, "")
    return {nom: telecharger_fichier(dossier, nom, legislature, chemin.format(suffixe=suffixe), forcer)
            for nom, chemin in SOURCES.items()}


def lire_zip(chemin: Path, sous_dossier: str = ""):
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            if nom.endswith(".json") and f"/{sous_dossier}" in f"/{nom}":
                yield json.loads(z.read(nom))


def importer_acteurs(db: sqlite3.Connection, chemin: Path):
    for d in lire_zip(chemin, "organe/"):
        o = d["organe"]
        if o.get("codeType") == "GP":
            db.execute("INSERT OR REPLACE INTO groupes VALUES (?, ?, ?, ?, ?)",
                       (o["uid"], o["libelle"], o.get("libelleAbrev") or o.get("libelleAbrege"),
                        o.get("legislature"), o.get("couleurAssociee")))
    # Quelques groupes de la 15e n'ont pas de couleur : on reprend celle de leur famille politique.
    for abrege, modele in COULEURS_EMPRUNTEES.items():
        db.execute("UPDATE groupes SET couleur = (SELECT couleur FROM groupes m WHERE m.abrege = ? "
                   "AND m.legislature = groupes.legislature AND m.couleur IS NOT NULL) "
                   "WHERE abrege = ? AND couleur IS NULL", (modele, abrege))

    for d in lire_zip(chemin, "acteur/"):
        a = d["acteur"]
        tous = liste(a["mandats"]["mandat"])
        mandats = [m for m in tous if m["typeOrgane"] == "ASSEMBLEE"]
        if not mandats:
            continue
        uid = a["uid"]["#text"] if isinstance(a["uid"], dict) else a["uid"]
        for m in tous:
            if m["typeOrgane"] == "GP":
                db.execute("INSERT OR REPLACE INTO appartenances VALUES (?, ?, ?, ?, ?)",
                           (m["uid"], uid, m["organes"]["organeRef"], m["dateDebut"], m.get("dateFin")))
        ident = a["etatCivil"]["ident"]
        dernier = max(mandats, key=lambda m: m["dateDebut"])
        lieu = (dernier.get("election") or {}).get("lieu") or {}
        db.execute("INSERT OR REPLACE INTO deputes VALUES (?, ?, ?, ?, ?, ?, ?)",
                   (uid, ident.get("civ"), ident["prenom"], ident["nom"],
                    lieu.get("departement"), lieu.get("numDepartement"), lieu.get("numCirco")))
        for m in mandats:
            # dateDebut = date de l'élection, même pour un ancien ministre qui reprend son siège
            # des mois plus tard : la prise de fonction est la vraie date d'entrée en séance.
            mandature = m.get("mandature") or {}
            debut = mandature.get("datePriseFonction") or m["dateDebut"]
            place = mandature.get("placeHemicycle")
            db.execute("INSERT OR REPLACE INTO mandats VALUES (?, ?, ?, ?, ?, ?)",
                       (m["uid"], uid, m["legislature"], debut, m.get("dateFin"),
                        int(place) if place and place.isdigit() else None))


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


def charger_dossiers(chemin: Path) -> tuple[dict, dict, dict]:
    """Retourne {uid dossier: infos}, {uid scrutin: uid dossier} via les voteRefs des actes,
    et {clé de titre de document: uid dossier} pour les scrutins qui ne sont pas référencés."""
    dossiers, scrutin_vers_dossier, candidats = {}, {}, {}

    def refs(noeud):
        if isinstance(noeud, list):
            for n in noeud:
                yield from refs(n)
        elif isinstance(noeud, dict):
            for k, v in noeud.items():
                if k == "voteRefs" and v:
                    yield from liste(v.get("voteRef"))
                else:
                    yield from refs(v)

    for d in lire_zip(chemin, "dossierParlementaire/"):
        dp = d["dossierParlementaire"]
        dossiers[dp["uid"]] = {
            "titre": dp["titreDossier"]["titre"],
            "procedure": (dp.get("procedureParlementaire") or {}).get("libelle"),
            "legislature": dp.get("legislature"),
            **analyser_actes(dp),
        }
        for ref in refs(dp.get("actesLegislatifs")):
            scrutin_vers_dossier[ref] = dp["uid"]

    for d in lire_zip(chemin, "document/"):
        doc = d["document"]
        if doc.get("dossierRef") and doc.get("titres"):
            candidats.setdefault(cle_titre(doc["titres"]["titrePrincipal"]), set()).add(doc["dossierRef"])

    # Un titre partagé par plusieurs dossiers n'est retenu que si un seul d'entre eux
    # a été voté à l'Assemblée ; sinon il est ambigu et on ne s'en sert pas.
    votes = set(scrutin_vers_dossier.values())
    titre_vers_dossier = {}
    for cle, refs_ in candidats.items():
        if len(refs_) > 1:
            refs_ = refs_ & votes
        if len(refs_) == 1:
            titre_vers_dossier[cle] = refs_.pop()
    return dossiers, scrutin_vers_dossier, titre_vers_dossier


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


def dossier_du_scrutin(s: dict, scrutin_vers_dossier: dict, titre_vers_dossier: dict) -> str | None:
    """Dossier visé par un scrutin quelconque (vote final, amendement, article, motion de procédure)."""
    ref = scrutin_vers_dossier.get(s["uid"]) or ((s["objet"].get("dossierLegislatif") or {}).get("dossierRef"))
    if ref:
        return ref
    m = RE_TEXTE_VISE.search(s["titre"])
    return titre_vers_dossier.get(cle_titre(RE_LECTURE.sub("", m.group(1)).strip().rstrip("."))) if m else None


def importer_motion(db: sqlite3.Connection, s: dict):
    """Motion de censure : seuls les votes "pour" existent, il n'y a ni contre ni abstention."""
    dec = s["syntheseVote"]
    article = "49-3" if "alinéa 3" in s["titre"] else "49-2"
    pour, requis = int(dec["decompte"]["pour"]), int(dec["nbrSuffragesRequis"])
    db.execute("INSERT OR REPLACE INTO motions_censure "
               "(scrutin_uid, numero, legislature, date, titre, article, pour, requis, adoptee) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
               (s["uid"], int(s["numero"]), s["legislature"], s["dateScrutin"], s["titre"], article,
                pour, requis, int(pour >= requis)))
    for g in liste(s["ventilationVotes"]["organe"]["groupes"]["groupe"]):
        for v in votants((g["vote"]["decompteNominatif"] or {}).get("pours")):
            place = v.get("numPlace")
            db.execute("INSERT OR REPLACE INTO votes_censure VALUES (?, ?, ?, ?, ?)",
                       (s["uid"], v["acteurRef"], g["organeRef"], int(v.get("parDelegation") == "true"),
                        int(place) if place and place.isdigit() else None))


def importer_scrutins(db: sqlite3.Connection, chemin: Path, dossiers: dict, scrutin_vers_dossier: dict,
                      titre_vers_dossier: dict, nb_scrutins: Counter):
    n = 0
    for d in lire_zip(chemin):
        s = d["scrutin"]
        if s["typeVote"]["codeTypeVote"] == "MOC":
            importer_motion(db, s)
            continue
        dossier = dossier_du_scrutin(s, scrutin_vers_dossier, titre_vers_dossier)
        if dossier:
            nb_scrutins[dossier] += 1
        m = RE_VOTE_FINAL.match(s["titre"])
        if not m:
            continue
        n += 1
        nature = "ensemble" if m.group(1).lower() == "ensemble" else "article_unique"
        lecture = RE_LECTURE.search(s["titre"])

        dossier_ref = scrutin_vers_dossier.get(s["uid"]) or \
            ((s["objet"].get("dossierLegislatif") or {}).get("dossierRef")) or \
            titre_vers_dossier.get(cle_titre(titre_texte(s["titre"])))
        if dossier_ref:
            info = dossiers.get(dossier_ref, {})
            loi = (dossier_ref, dossier_ref, info.get("titre") or titre_texte(s["titre"]), info.get("procedure"))
        else:
            titre = titre_texte(s["titre"])
            # Un même titre peut être redéposé d'une législature à l'autre : ce sont deux lois.
            loi = (f"titre:{s['legislature']}:{titre.lower()}", None, titre, None)
        db.execute("INSERT OR IGNORE INTO lois (id, dossier_ref, titre, procedure) VALUES (?, ?, ?, ?)", loi)

        dec = s["syntheseVote"]["decompte"]
        db.execute(
            "INSERT OR REPLACE INTO scrutins VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (s["uid"], int(s["numero"]), s["legislature"], s["dateScrutin"], s["titre"], nature,
             lecture.group(1) if lecture else None, s["typeVote"]["libelleTypeVote"],
             s["sort"]["code"], loi[0], int(s["syntheseVote"]["nombreVotants"]),
             int(dec["pour"]), int(dec["contre"]), int(dec["abstentions"]), int(dec["nonVotants"])))

        for g in liste(s["ventilationVotes"]["organe"]["groupes"]["groupe"]):
            voix = g["vote"]["decompteVoix"]
            compte = {"pour": int(voix["pour"]), "contre": int(voix["contre"]),
                      "abstention": int(voix["abstentions"])}
            db.execute("INSERT OR REPLACE INTO positions_groupes VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (s["uid"], g["organeRef"], ligne_groupe(compte), g["vote"]["positionMajoritaire"],
                        int(g["nombreMembresGroupe"]), compte["pour"], compte["contre"],
                        compte["abstention"]))
            nominatif = g["vote"]["decompteNominatif"] or {}
            for cle, position in POSITIONS.items():
                for v in votants(nominatif.get(cle)):
                    place = v.get("numPlace")
                    db.execute("INSERT OR REPLACE INTO votes VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                               (s["uid"], v["acteurRef"], v.get("mandatRef"), g["organeRef"], position,
                                int(v.get("parDelegation") == "true"), v.get("causePositionVote"),
                                int(place) if place and place.isdigit() else None))

        map_ = s.get("miseAuPoint") or {}
        for cle, contenu in map_.items():
            if cle == "dysfonctionnement":
                for sous_cle, sous_contenu in (contenu or {}).items():
                    for v in votants(sous_contenu):
                        db.execute("INSERT INTO mises_au_point VALUES (?, ?, ?, 1)",
                                   (s["uid"], v["acteurRef"], POSITIONS_MAP[sous_cle]))
            elif cle in POSITIONS_MAP:
                for v in votants(contenu):
                    db.execute("INSERT INTO mises_au_point VALUES (?, ?, ?, 0)",
                               (s["uid"], v["acteurRef"], POSITIONS_MAP[cle]))
    return n


def completer_lois(db: sqlite3.Connection, dossiers: dict, nb_scrutins: Counter):
    """Parcours législatif des lois, et lois adoptées par 49.3 sans vote final à l'Assemblée."""
    for ref, info in dossiers.items():
        # Certains 49.3 ont aussi un dossier propre (procédure "Engagement de la responsabilité
        # gouvernementale") qui doublonne celui de la loi : seuls les dossiers de textes comptent.
        if info["engagements"] and info["procedure"] not in PROCEDURES_NON_LEGISLATIVES:
            db.execute("INSERT OR IGNORE INTO lois (id, dossier_ref, titre, procedure) VALUES (?, ?, ?, ?)",
                       (ref, ref, info["titre"], info["procedure"]))
    for (ref,) in db.execute("SELECT dossier_ref FROM lois WHERE dossier_ref IS NOT NULL").fetchall():
        info = dossiers.get(ref)
        if not info:
            continue
        db.execute("UPDATE lois SET legislature = ?, procedure_acceleree = ?, cmp = ?, saisine_cc = ?, "
                   "decision_cc = ?, promulgation = ?, nb_scrutins = ? WHERE id = ?",
                   (info["legislature"], info["acceleree"], info["cmp"], info["saisine_cc"],
                    info["decision_cc"], info["promulgation"], nb_scrutins[ref], ref))
        for e in info["engagements"] if info["procedure"] not in PROCEDURES_NON_LEGISLATIVES else []:
            cur = db.execute("INSERT INTO engagements_49_3 (loi_id, etape, date, issue) VALUES (?, ?, ?, ?)",
                             (ref, e["etape"], e["date"], e["issue"]))
            for vote_ref, _ in e["motions"]:
                db.execute("UPDATE motions_censure SET loi_id = ?, engagement_id = ? WHERE scrutin_uid = ?",
                           (ref, cur.lastrowid, vote_ref))
    # En 15e et 16e, les motions ne portent pas de référence de scrutin dans les dossiers : on les
    # rattache par la date, sans deviner. Candidats = engagements des JOURS_MOTION jours précédents.
    # Texte retenu s'ils visent tous le même ; engagement retenu s'il est seul.
    for uid, date in db.execute("SELECT scrutin_uid, date FROM motions_censure "
                                "WHERE article = '49-3' AND loi_id IS NULL").fetchall():
        candidats = db.execute(
            "SELECT id, loi_id FROM engagements_49_3 "
            "WHERE date <= ? AND julianday(?) - julianday(date) <= ?",
            (date, date, JOURS_MOTION)).fetchall()
        if len({loi for _, loi in candidats}) == 1:
            db.execute("UPDATE motions_censure SET loi_id = ?, engagement_id = ? WHERE scrutin_uid = ?",
                       (candidats[0][1], candidats[0][0] if len(candidats) == 1 else None, uid))
    # Lois rattachées par leur seul titre : législature tirée de leurs scrutins.
    db.execute("UPDATE lois SET legislature = (SELECT MIN(legislature) FROM scrutins WHERE loi_id = lois.id) "
               "WHERE legislature IS NULL")


def construire(base: Path, brut: Path, legislatures: list[str] = LEGISLATURES, forcer: bool = False):
    brut.mkdir(parents=True, exist_ok=True)
    acteurs = telecharger_fichier(brut, "acteurs", *ACTEURS, forcer)
    chemins = {leg: telecharger(brut, leg, forcer) for leg in legislatures}
    base.parent.mkdir(parents=True, exist_ok=True)
    base.unlink(missing_ok=True)
    db = sqlite3.connect(base)
    db.executescript((Path(__file__).parent / "schema.sql").read_text())
    with db:
        importer_acteurs(db, acteurs)
        # Un dossier peut être ouvert sous une législature et voté sous la suivante :
        # les titres de dossiers sont cumulés, les rapprochements restent par législature.
        tous_dossiers, nb_scrutins = {}, Counter()
        for leg in legislatures:
            dossiers, scrutin_vers_dossier, titre_vers_dossier = charger_dossiers(chemins[leg]["dossiers"])
            tous_dossiers.update(dossiers)
            n = importer_scrutins(db, chemins[leg]["scrutins"], tous_dossiers,
                                  scrutin_vers_dossier, titre_vers_dossier, nb_scrutins)
            print(f"{leg}e législature : {n} scrutins finaux")
        completer_lois(db, tous_dossiers, nb_scrutins)
        classer_lois(db)
    nb_49_3 = db.execute("SELECT COUNT(*), COUNT(DISTINCT loi_id) FROM engagements_49_3").fetchone()
    print(f"{nb_49_3[0]} recours au 49.3 sur {nb_49_3[1]} textes")
    nb_lois = db.execute("SELECT COUNT(*) FROM lois").fetchone()[0]
    nb_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    db.close()
    print(f"{nb_lois} lois, {nb_votes} votes nominatifs -> {base}")
