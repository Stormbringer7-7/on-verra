"""Ce qui a changé, article par article, d'une version d'un texte à la suivante (navette).

Étape d'ETL calculée depuis les sources brutes en cache (jamais depuis `canon`) : les textes sont
relus avec les lecteurs de `an.textes` et `senat.textes` (mêmes identités de versions), les
amendements depuis leurs fichiers bruts (AN `amendements.json.zip`, Sénat AMELI).

Ordre des versions (références explicites seulement) :
- dossier suivi par le Sénat : la navette DOSLEG — lecture (`typlec.typlecord`), assemblée dans la
  lecture (`lecass.ordreass`), place du texte dans l'assemblée (déposé ou transmis, puis
  commission, puis séance : `oritxt.oriordre`) ; un texte de l'AN y est cité par son URL
  (`l17b2632`, `l17t0295`). Deux textes à la même place sans dates distinctes, des dates
  contraires à cet ordre, un texte non chargé ou rejeté entre deux versions : rien n'est comparé,
  cas `navette_incertaine` ;
- dossier de l'AN seul : déposé, commission, adopté, s'il n'y a qu'un texte de chaque nature.

Amendements de l'étape qui produit une version :
- Sénat : la table AMELI `txt_ameli` dit sur quel texte (`num`) ils portent et quel texte en est
  issu (`numado`) ;
- AN, texte de la commission : amendements sur le texte précédent, examinés par la commission
  saisie au fond (`organeRef` de l'acte de dépôt du rapport qui cite ce texte adopté) ; texte
  adopté : amendements de séance (organe des actes `…-DEBATS`) sur le texte précédent, ou sur
  le texte de CMP publié par l'AN (`CMP-COM-RAPPORT-AN`).
Attribution et diff : `src/diffs.py`.
"""

import hashlib
import json
import re
import zipfile
from xml.etree import ElementTree
from dataclasses import dataclass, field, replace

from ... import diffs
from ...chargement import Document, DocumentIllisible, Flux, charger
from ...domaine import EnregistrementSource, Systeme
from ...domaine.objets import Candidat, CasRevue, Dependants, Objet
from ...etl import Etape, Fichier
from .an import dossiers as an_dossiers
from .an import textes as an_textes
from .an.amendements import AMENDEMENTS, CHEMIN, UID
from .an.commun import DOCUMENT, an, documents, lire, val
from .senat import textes as senat_textes
from .senat.commun import senat
from .senat.dossiers import DOSLEG
from .senat.travaux import AMELI, MEMBRE_AMELI, MEMBRE_DOSLEG, table

LICENCE = "Licence Ouverte / Etalab 2.0 (textes et amendements de l'AN et du Sénat)"
# Version des règles : la changer relit tous les dossiers (l'empreinte du document en dépend).
REGLES = "modifications-1"
# Place d'un texte dans une assemblée : `oritxt.oriordre` vaut 0 (déposé, transmis), 2 (commission),
# 1 (séance) ; la commission précède la séance.
RANG = {"0": 0, "2": 1, "1": 2}
NATURES_AN = {"depose": 0, "commission": 1, "adopte": 2}
SORTS_AN = {"Adopté": "adopte"}
SORTS_SENAT = {"Adopté": "adopte", "Adopté - vote unique": "adopte", "Adopté avec modification": "adopte_modifie"}
# Position de l'amendement par rapport à sa subdivision AMELI (`amd.subpos`) : 0 sur l'article,
# 20 après (article additionnel), -10 avant. 10 et -20 insèrent une division (titre, chapitre) : pas un article.
POSITIONS_SENAT = {"0": "A", "20": "après", "-10": "avant"}
URL_AN = senat_textes.URL_AN


# Versions relues dans les textes en cache -------------------------------------------------------
@dataclass
class Article:
    identite: object
    numero: str | None
    suivi: object
    statut: str
    texte: str


@dataclass
class Version:
    identite: object
    chambre: str
    nature: str
    cle: str                                   # uid AN ou stem Sénat
    articles: list[Article] = field(default_factory=list)

    def article(self, suivi) -> Article | None:
        return next((a for a in self.articles if a.suivi == suivi), None)


def lire_version(analyse, chambre: str, cle: str) -> Version | None:
    """Les objets que l'étape du texte écrit (mêmes identités), sans rien écrire."""
    v = None
    for o in analyse:
        if isinstance(o, Objet) and o.type == "version_texte":
            v = Version(o.identite, chambre, o.valeurs["nature"], cle)
        elif isinstance(o, Objet) and o.type == "version_article" and v:
            x = o.valeurs
            v.articles.append(Article(o.identite, x["numero"] if x["article_suivi_id"] else None,
                                      x["article_suivi_id"], x["statut"], x["texte"]))
    return v


# Ordre de la navette ---------------------------------------------------------------------------
@dataclass
class Noeud:
    """Un texte de la navette : sa place (lecture, assemblée, rang), sa date, sa version chargée."""
    cle: str                                   # uid AN ou stem Sénat
    place: tuple                               # (typlecord, ordreass, rang)
    date: str | None
    chambre: str                               # AN, SENAT
    navette: bool = True                       # False : texte rejeté, résultat de travaux sans texte adopté
    cmp: bool = False                          # texte élaboré par la commission mixte paritaire
    numero: str | None = None                  # Sénat : numéro du texte (AMELI `num`, `numado`)
    version: Version | None = None
    incertain: str | None = None               # pourquoi sa place n'est pas certaine


def ordonner(noeuds: list[Noeud]) -> list[Noeud]:
    """Trie par place puis date ; marque `incertain` deux textes à la même place sans dates
    distinctes, et un texte dont la date précède celle d'un texte placé avant lui."""
    noeuds = sorted(noeuds, key=lambda n: (n.place, n.date or ""))
    for i, n in enumerate(noeuds):
        for m in noeuds[:i]:
            if m.place == n.place and (not m.date or not n.date or m.date == n.date):
                m.incertain = n.incertain = f"même place que {m.cle if m is not n else n.cle}, sans dates distinctes"
            elif m.date and n.date and m.date > n.date:
                n.incertain = f"daté du {n.date}, avant {m.cle} ({m.date}) placé plus tôt"
    return noeuds


def an_uid(url: str, commission: bool, uids: dict) -> str | None:
    """« …/textes/l17b2632_projet-loi » -> l'uid AN du dossier dont le type et le numéro concordent."""
    m = URL_AN.search(url or "")
    if not m or m.group(1) != "17":
        return None
    lettre = "BTA" if m.group(2) == "t" else ("BTC" if commission else "B")
    return uids.get((lettre, int(m.group(3))))


def navettes_dosleg(dosleg) -> dict[str, list[Noeud]]:
    """Signet -> textes de la navette (non triés), lus dans DOSLEG. `cle` : stem Sénat ou
    (« AN », lettre, numéro) à résoudre en uid."""
    typlec = {t["typleccod"]: int(t["typlecord"]) for t in table(dosleg, MEMBRE_DOSLEG, "typlec")}
    signets = {l["loicod"]: l["signet"] for l in table(dosleg, MEMBRE_DOSLEG, "loi")}
    lectures = {l["lecidt"]: (signets.get(l["loicod"]), typlec.get(l["typleccod"])) for l in table(dosleg, MEMBRE_DOSLEG, "lecture")}
    doubles = set()
    vus = {}
    for lecidt, (signet, ordre) in lectures.items():
        if (signet, ordre) in vus:
            doubles.add(signet)                # deux lectures du même type : l'ordre ne se lit pas
        vus[(signet, ordre)] = lecidt
    lecass = {l["lecassidt"]: (l["lecidt"], int(l["ordreass"] or 0), l["codass"]) for l in table(dosleg, MEMBRE_DOSLEG, "lecass")}
    origines = {o["oritxtcod"]: o for o in table(dosleg, MEMBRE_DOSLEG, "oritxt")}
    resultat: dict[str, list[Noeud]] = {}
    for t in table(dosleg, MEMBRE_DOSLEG, "texte"):
        if t["lecassidt"] not in lecass or t["oritxtcod"] not in origines:
            continue
        lecidt, ordreass, codass = lecass[t["lecassidt"]]
        signet, ordre = lectures.get(lecidt, (None, None))
        if not signet or ordre is None:
            continue
        o = origines[t["oritxtcod"]]
        rang = RANG.get(o["oriordre"])
        if rang is None:
            continue
        m = re.fullmatch(r"([a-z]+)(\d\d)-(\d+)\.html", t.get("texurl") or "")
        if t.get("typurl") == "E":
            cle, chambre = ("AN", t["texurl"], t["oritxtcod"] == "30"), "AN"     # 30 : de la commission (AN)
        elif m:
            cle, chambre = f"{m.group(1)}{m.group(2)}-{m.group(3)}", "SENAT"
        else:
            continue
        noeud = Noeud(cle, (ordre, ordreass, rang), (t.get("txtoritxtdat") or "")[:10] or None, chambre,
                      navette=rang == 0 or o["oritxtado"] in ("O", "D"),
                      cmp=codass == "I" and rang == 1 and o["oritxtado"] == "O",
                      numero=t.get("texnum"))
        if signet in doubles:
            noeud.incertain = "deux lectures du même type dans le dossier"
        elif o["oritxtado"] == "D":
            # Le texte adopté définitivement est renuméroté (1, 2, 3… sans « bis ») : ses numéros ne
            # sont plus ceux de la navette, l'article « 3 » n'y est pas l'article suivi « 3 ».
            noeud.incertain = "texte adopté définitivement : articles renumérotés"
        resultat.setdefault(signet, []).append(noeud)
    return resultat


# Amendements bruts ------------------------------------------------------------------------------
def actes_an(chemin) -> dict[str, dict]:
    """Dossier AN -> {rapport: {texte adopté: organe}, seance: {organes}, cmp_an: [uids]}."""
    resultat = {}
    for doc in documents(an_dossiers.DOSSIERS, chemin, "dossierParlementaire/"):
        d = lire(doc)["dossierParlementaire"]
        r = {"rapport": {}, "seance": set(), "cmp_an": []}
        for a, _, _, _ in an_dossiers.actes(d.get("actesLegislatifs")):
            code, organe = a.get("codeActe") or "", val(a.get("organeRef"))
            adopte = val(a.get("texteAdopte"))
            if a.get("@xsi:type") == "DepotRapport_Type" and adopte and organe:
                r["rapport"][adopte] = organe
            if code == "CMP-COM-RAPPORT-AN" and adopte:
                r["cmp_an"].append(adopte)
            if re.fullmatch(r"AN[^-]*-DEBATS|CMP-DEBATS-AN", code) and organe:
                r["seance"].add(organe)
        resultat[d["uid"]] = r
    return resultat


def amendement_an(a: dict) -> tuple[str | None, diffs.Amendement]:
    division = (a.get("pointeurFragmentTexte") or {}).get("division") or {}
    cible = diffs.vise(val(division.get("titre")), val(division.get("avant_A_Apres"))) \
        if val(division.get("type")) == "ARTICLE" else None
    numero = val((a.get("identification") or {}).get("numeroLong")) or a["uid"]
    sort = SORTS_AN.get(val((a.get("cycleDeVie") or {}).get("sort")), "autre")
    organe = UID.match(a["uid"])
    corps = (a.get("corps") or {}).get("contenuAuteur") or {}
    return (organe.group(2) if organe else None), diffs.Amendement(
        an("amendement", a["uid"]), numero, cible, sort, val(corps.get("dispositif")),
        f"AN n° {numero} ({val(division.get('titre')) or '?'})")


def amendements_an(chemin, textes: set[str]) -> dict[str, list[tuple[str | None, diffs.Amendement]]]:
    """Texte visé -> (organe d'examen, amendement), pour les textes demandés seulement."""
    resultat: dict[str, list] = {}
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            m = CHEMIN.search(nom)
            if not m or m.group(2) not in textes:
                continue
            a = json.loads(z.read(nom))["amendement"]
            vise = val(a.get("texteLegislatifRef")) or m.group(2)
            if vise in textes:
                resultat.setdefault(vise, []).append(amendement_an(a))
    return resultat


def amendements_senat(ameli) -> dict[tuple[str, str], list[diffs.Amendement] | None]:
    """(signet, numéro du texte issu de l'examen) -> amendements examinés. Le texte issu peut être
    numéroté dans la session suivante (commission en 2024-2025, texte en 2025-2026) : la clé ne
    porte pas l'année ; deux examens du dossier donnant le même numéro : None (pas d'attribution).
    Un examen sans texte issu (`numado` = `num` : la commission n'a pas adopté de texte) est ignoré."""
    annees = {s["id"]: int(s["ann"]) for s in table(ameli, MEMBRE_AMELI, "ses")}
    textes = {t["id"]: t for t in table(ameli, MEMBRE_AMELI, "txt_ameli")
              if annees.get(t["sesdepid"], 0) >= senat_textes.PREMIERE_ANNEE and t.get("doslegsignet")
              and t.get("numado") and t["numado"] != t["num"]}
    examens: dict[tuple, set] = {}
    for t in textes.values():
        examens.setdefault((t["doslegsignet"], t["numado"]), set()).add(t["id"])
    subdivisions = {s["id"]: s["lib"] for s in table(ameli, MEMBRE_AMELI, "sub") if s["txtid"] in textes}
    sorts = {s["id"]: s["lib"] for s in table(ameli, MEMBRE_AMELI, "sor")}
    resultat: dict[tuple, list | None] = {cle: ([] if len(ids) == 1 else None) for cle, ids in examens.items()}
    for a in table(ameli, MEMBRE_AMELI, "amd"):
        t = textes.get(a["txtid"])
        if t is None or resultat[(t["doslegsignet"], t["numado"])] is None:
            continue
        lib = subdivisions.get(a["subid"])
        cible = diffs.vise(lib, POSITIONS_SENAT[a.get("subpos")]) if a.get("subpos") in POSITIONS_SENAT else None
        resultat[(t["doslegsignet"], t["numado"])].append(diffs.Amendement(
            senat("amendement", a["id"]), a["num"] or a["id"], cible, SORTS_SENAT.get(sorts.get(a["sorid"]), "autre"),
            a.get("dis"), f"Sénat n° {a['num']} ({lib or '?'})"))
    return resultat


# Comparaison -------------------------------------------------------------------------------------
@dataclass
class Dossier:
    """Un dossier suivi (clé des `article_suivi`) : ses textes dans l'ordre et ses amendements."""
    cle: str
    noeuds: list[Noeud]
    hors_navette: list[Version] = field(default_factory=list)     # versions chargées non placées
    etapes: dict = field(default_factory=dict)                    # cle de version -> amendements | None


def _avant_texte(a: Article | None) -> str:
    return "" if a is None or a.statut == "supprime" else a.texte


def precedent(noeuds: list[Noeud], i: int, suivi) -> tuple[Article | None, str | None, bool]:
    """(article de la version précédente, raison d'incertitude, saut) en remontant la navette.

    Un article « conforme » sans texte est explicitement inchangé : on remonte au texte d'avant.
    Un article absent d'une version (navette restreinte) : on remonte aussi, mais l'étape qui l'a
    changé n'est plus certaine (`saut`). Un texte non chargé, rejeté, ou mal placé : incertain."""
    saut = False
    for m in reversed(noeuds[:i]):
        if m.incertain:
            return None, f"{m.cle} : {m.incertain}", saut
        if not m.navette:
            return None, f"{m.cle} : texte rejeté ou sans texte adopté entre les deux versions", saut
        if m.version is None:
            return None, f"{m.cle} : texte de la navette non chargé", saut
        a = m.version.article(suivi)
        if a is None:
            saut = True
            continue
        if a.statut in ("conforme", "non_modifie") and not a.texte.strip():
            continue
        return a, None, saut
    return None, None, saut


def analyser(dossier: Dossier):
    """Diffs et cas de revue d'un dossier : un `Dependants` par version d'article placée."""
    cle = dossier.cle
    for v in dossier.hors_navette:
        yield CasRevue("navette_incertaine", f"navette_incertaine:{cle}/{v.cle}", "constat",
                       f"{v.cle} ({cle}) n'est pas placé dans la navette : ses articles ne sont pas comparés",
                       contexte={"dossier": cle, "version": v.cle, "raison": "texte absent de la navette DOSLEG"})
        for a in v.articles:
            yield Dependants("modification_article", {"version_article_id": a.identite}, [], "/modifications")
    for i, n in enumerate(dossier.noeuds):
        v = n.version
        if v is None:
            continue
        incertaines = []
        for a in v.articles:
            if a.suivi is None or a.statut in ("conforme", "non_modifie") or i == 0:
                yield Dependants("modification_article", {"version_article_id": a.identite}, [], "/modifications")
                continue
            p, raison = None, n.incertain and f"{n.cle} : {n.incertain}"
            saut = False
            if not raison:
                p, raison, saut = precedent(dossier.noeuds, i, a.suivi)
            if raison:
                incertaines.append((a, raison))
                yield Dependants("modification_article", {"version_article_id": a.identite}, [], "/modifications")
                continue
            avant, apres = _avant_texte(p), _avant_texte(a)
            diff = diffs.diff_mots(avant, apres)
            if not diffs.change(diff):
                yield Dependants("modification_article", {"version_article_id": a.identite}, [], "/modifications")
                continue
            nouveau = p is None
            attribution = diffs.attribuer(diff, avant, apres, a.statut == "supprime", a.numero, nouveau,
                                          dossier.etapes.get(v.cle), n.cmp)
            statut = attribution.statut
            motif = attribution.motif
            # Absent d'une version intermédiaire puis retrouvé plus haut : l'étape du changement n'est
            # pas certaine. (Absent de toutes : il est inséré à cette étape.)
            if saut and p and statut == "VERIFIED" and attribution.origine == "amendement":
                statut, motif = "NEEDS_REVIEW", "article absent d'une version intermédiaire : l'étape du changement n'est pas certaine"
            ligne = {"version_precedente_id": p.identite if p else None, "origine": attribution.origine,
                     "amendement_id": attribution.amendement if statut == "VERIFIED" else None, "statut": statut,
                     "diff": {**diff, "nouveau": nouveau, "motif": motif}}
            requis = ("version_precedente_id",) if p else ()
            if ligne["amendement_id"]:
                requis += ("amendement_id",)
            yield Dependants("modification_article", {"version_article_id": a.identite}, [ligne], "/modifications", requis)
            if statut != "VERIFIED":
                type_ = "modification_a_attribuer" if attribution.candidats else "modification_sans_amendement"
                yield CasRevue(type_, f"{type_}:{cle}/{a.identite}", "constat",
                               f"{v.cle}, article {a.numero} ({cle}) : modifié, origine non établie — {motif}",
                               candidats=tuple(Candidat("amendement", c.identite, c.libelle,
                                                        {"preuve_dispositif": attribution.preuves.get(c.numero),
                                                         "sort": c.sort})
                                               for c in attribution.candidats),
                               contexte={"dossier": cle, "version": v.cle, "article": a.numero,
                                         "version_article": str(a.identite),
                                         "version_precedente": str(p.identite) if p else None,
                                         "mots_supprimes": diff["mots_supprimes"], "mots_ajoutes": diff["mots_ajoutes"],
                                         "nouveau": nouveau, "motif": motif})
        if incertaines:
            yield CasRevue("navette_incertaine", f"navette_incertaine:{cle}/{v.cle}", "constat",
                           f"{v.cle} ({cle}) : la version précédente de {len(incertaines)} article(s) ne se lit pas "
                           f"avec certitude — {incertaines[0][1]}",
                           contexte={"dossier": cle, "version": v.cle, "raison": incertaines[0][1],
                                     "articles": [x.numero for x, _ in incertaines]})


# Assemblage --------------------------------------------------------------------------------------
def versions_an(chemin_dossiers, cache):
    """Versions AN des dossiers examinés, relues comme `an.textes` : (clé de suivi, dossier AN, version)."""
    for uid, dossier, cle_dossier, date in an_textes.textes_examines(chemin_dossiers):
        f = cache / "textes" / f"{uid}.html"
        if f.exists():
            doc = Document(Fichier(f"textes/{uid}.html", f"{DOCUMENT}/{uid}.html"), f"textes/{uid}.html",
                           f.read_bytes(), uid, (uid, dossier, cle_dossier, date))
            v = lire_version(an_textes.version(doc), "AN", uid)
            if v:
                yield cle_dossier, dossier, v


def corps_akn(octets: bytes) -> dict[str, str]:
    """eId -> texte de chaque article, lu comme `senat.textes.version` (`corps_articles`)."""
    racine = ElementTree.fromstring(octets)
    ns = racine.tag.split("}")[0] + "}" if racine.tag.startswith("{") else ""
    return senat_textes.corps_articles(racine, ns)


def versions_senat(dosleg):
    """Versions Sénat relues comme `senat.textes`, corps des articles lu par `corps_akn`."""
    for stem, t, signet, origine in senat_textes.references(dosleg):
        f = dosleg.parent / "akn" / f"{stem}.akn.xml"
        if not f.exists():
            continue
        octets = f.read_bytes()
        doc = Document(Fichier(f"akn/{stem}.akn.xml", f"{senat_textes.AKN}/{stem}.akn.xml"), f"akn/{stem}.akn.xml",
                       octets, stem, (stem, t, signet, origine))
        try:
            v = lire_version(senat_textes.version(doc), "SENAT", stem)
        except DocumentIllisible:
            continue
        if v:
            corps = corps_akn(octets)
            for a in v.articles:
                eid = a.identite.id_source.split("#", 1)[1]
                if corps.get(eid):
                    a.texte = corps[eid]
            yield f"SENAT:dossier:{signet}", v


def dossiers_suivis(chemin_dossiers, cache_an, dosleg, chemin_amendements, ameli) -> list[Dossier]:
    actes = actes_an(chemin_dossiers)
    par_cle: dict[str, dict] = {}
    for cle, dossier_an, v in versions_an(chemin_dossiers, cache_an):
        d = par_cle.setdefault(cle, {"an": {}, "senat": {}, "dossiers_an": set()})
        d["an"][v.cle] = v
        d["dossiers_an"].add(dossier_an)
    for cle, v in versions_senat(dosleg):
        par_cle.setdefault(cle, {"an": {}, "senat": {}, "dossiers_an": set()})["senat"][v.cle] = v
    navettes = navettes_dosleg(dosleg)
    resultat = []
    for cle, d in sorted(par_cle.items()):
        if cle.startswith("SENAT:dossier:"):
            uids = {}
            for uid in d["an"]:
                m = an_textes.TEXTE.match(uid)
                uids[(m.group(1), int(m.group(2)))] = uid
            noeuds, places = [], set()
            for n in navettes.get(cle.removeprefix("SENAT:dossier:"), []):
                n = replace(n)
                if n.chambre == "AN":
                    n.cle = an_uid(n.cle[1], n.cle[2], uids) or f"AN:{n.cle[1]}"
                n.version = d["an"].get(n.cle) or d["senat"].get(n.cle)
                if n.version:
                    places.add(n.cle)
                noeuds.append(n)
            noeuds = ordonner(noeuds)
            hors = [v for k, v in {**d["an"], **d["senat"]}.items() if k not in places]
        else:
            noeuds = ordonner([Noeud(v.cle, (1, 1, NATURES_AN[v.nature]), None, "AN", version=v) for v in d["an"].values()])
            for n in noeuds:
                if sum(1 for m in noeuds if m.place == n.place) > 1:
                    n.incertain = "plusieurs textes de même nature dans un dossier de l'AN seul"
            hors = []
        resultat.append(Dossier(cle, noeuds, hors, {"dossiers_an": d["dossiers_an"]}))
    # Amendements de l'étape qui produit chaque version
    a_lire = {}
    for dossier in resultat:
        dossiers_an = dossier.etapes.pop("dossiers_an")
        r = {"rapport": {}, "seance": set(), "cmp_an": []}
        for u in dossiers_an:
            x = actes.get(u) or {}
            r["rapport"].update(x.get("rapport", {}))
            r["seance"] |= x.get("seance", set())
            r["cmp_an"] += x.get("cmp_an", [])
        for i, n in enumerate(dossier.noeuds):
            if n.version is None or n.chambre != "AN" or i == 0:
                continue
            p = dossier.noeuds[i - 1]
            if n.version.nature == "commission":
                vise, organes = (p.cle if p.chambre == "AN" else None), {r["rapport"].get(n.cle)} - {None}
            elif n.version.nature == "adopte":
                vise = p.cle if p.chambre == "AN" else (r["cmp_an"][0] if len(r["cmp_an"]) == 1 and n.place[0] == 100 else None)
                organes = r["seance"]
            else:
                continue
            if vise and organes:
                a_lire[(dossier.cle, n.cle)] = (vise, organes)
    an_amd = amendements_an(chemin_amendements, {v for v, _ in a_lire.values()})
    senat_amd = amendements_senat(ameli)
    for dossier in resultat:
        for n in dossier.noeuds:
            if n.version is None:
                continue
            if n.chambre == "AN" and (dossier.cle, n.cle) in a_lire:
                vise, organes = a_lire[(dossier.cle, n.cle)]
                dossier.etapes[n.cle] = [a for o, a in an_amd.get(vise, []) if o in organes]
            elif n.chambre == "SENAT" and n.numero:
                dossier.etapes[n.cle] = senat_amd.get((dossier.cle.removeprefix("SENAT:dossier:"), n.numero))
    return resultat


def _empreinte(elements) -> bytes:
    """Le document d'un dossier est ce qu'on en tire : son empreinte change avec le résultat."""
    def brut(x):
        if isinstance(x, Dependants):
            return ["d", str(x.parent["version_article_id"]), [{k: str(v) if k != "diff" else v for k, v in l.items()}
                                                               for l in x.lignes]]
        return ["c", x.type, x.cle, x.constat, [str(c.identite) for c in x.candidats]]
    return json.dumps([REGLES, [brut(x) for x in elements]], ensure_ascii=False, sort_keys=True, default=str).encode()


def url_dossier(cle: str) -> str:
    systeme, _, id_ = cle.split(":", 2)
    return (f"https://www.senat.fr/dossier-legislatif/{id_}.html" if systeme == "SENAT"
            else f"https://www.assemblee-nationale.fr/dyn/17/dossiers/{id_}")


def empreinte_entrees(fichiers, dossiers) -> str:
    """Empreinte de tout ce que le calcul lit : archives et textes en cache. Inchangée, rien à refaire."""
    h = hashlib.sha256(REGLES.encode())
    for f in [*fichiers, *(x for d in dossiers if d.exists() for x in sorted(d.iterdir()) if x.suffix in (".html", ".xml"))]:
        h.update(f.name.encode())
        with open(f, "rb") as contenu:
            h.update(hashlib.file_digest(contenu, "sha256").digest())
    return h.hexdigest()


def executer(ctx):
    chemin_dossiers, dosleg = ctx.fichier(an_dossiers.DOSSIERS.nom), ctx.fichier(DOSLEG.nom)
    amendements, ameli = ctx.fichier(AMENDEMENTS.nom), ctx.fichier(AMELI.nom)
    empreinte = empreinte_entrees([chemin_dossiers, dosleg, amendements, ameli],
                                  [chemin_dossiers.parent / "textes", dosleg.parent / "akn"])
    with ctx.registre.transaction():
        _, nouveau = ctx.entrepot.enregistrer_source(EnregistrementSource(
            Systeme.CIVICTRACE, "modifications", "", empreinte, None, None, LICENCE))
        if not nouveau and not ctx.forcer:
            ctx.bilan["documents_inchanges"] += 1          # mêmes entrées, mêmes règles : même résultat
            return
        calcules = []
        for d in dossiers_suivis(chemin_dossiers, chemin_dossiers.parent, dosleg, amendements, ameli):
            elements = list(analyser(d))
            calcules.append((Document(Fichier(f"modifications/{d.cle}", url_dossier(d.cle)), "", _empreinte(elements),
                                      d.cle, elements), d.cle, elements))
        charger(ctx, Flux(Systeme.CIVICTRACE, LICENCE, lambda: (doc for doc, _, _ in calcules), lambda doc: doc.donnees))
        # Cas d'un calcul précédent que celui-ci n'émet plus : sans objet (une décision est gardée).
        for _, cle, elements in calcules:
            emis = {x.cle for x in elements if isinstance(x, CasRevue)}
            for type_ in TYPES_CAS:
                ctx.bilan["cas.caducs"] += ctx.entrepot.classer_caducs(f"{type_}:{cle}/", emis)


TYPES_CAS = ("navette_incertaine", "modification_a_attribuer", "modification_sans_amendement")

ETAPE = Etape("textes.modifications", executer, apres=("an.textes", "senat.textes", "an.travaux", "senat.travaux"),
              description="modifications d'articles d'une version à la suivante : diff mot à mot, amendement d'origine")
