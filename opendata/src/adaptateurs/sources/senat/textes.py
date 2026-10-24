"""Textes du Sénat en Akoma Ntoso : une version de texte par fichier, une version par article.

Versions d'un dossier : la table DOSLEG `texte` (référence explicite : `lecassidt` → `lecass` →
`lecture` → `loi.signet`), dont `texurl` « pjl25-689.html » désigne le fichier Akoma Ntoso
`pjl25-689.akn.xml`. Origine de la version : `oritxt` (déposé, de la commission, adopté…).
Suivi des articles : clé du dossier + numéro officiel (cf. `src/textes.py`).
"""

import hashlib
import re
import time
import urllib.error
from xml.etree import ElementTree

from .... import revue
from ....chargement import Document, DocumentIllisible, Flux, charger
from ....domaine.objets import CasRevue, Ensemble, Objet
from ....etl import Etape, Fichier
from ....textes import article_suivi, mentions, numero_article, statut_mention, supprime
from .commun import DONNEES, LICENCE, Systeme, jour, senat
from .dossiers import DOSLEG
from .travaux import MEMBRE_DOSLEG, table

AKN = "https://www.senat.fr/akomantoso"
INDEX = [Fichier("akn_depots.xml", f"{AKN}/depots.xml"), Fichier("akn_adoptions.xml", f"{AKN}/adoptions.xml")]
PREMIERE_ANNEE = 2024
PAUSE = 0.2


# Texte de l'AN cité par DOSLEG (`texurl`) : « …/textes/l17t0295… » = texte adopté (TA) n° 295.
URL_AN = re.compile(r"/textes/l(\d+)([bt])(\d+)")


def definitifs(dosleg) -> tuple[set[str], set[int]]:
    """Textes adoptés définitivement, selon DOSLEG (`oritxt.oritxtado = 'D'`) : leurs articles sont
    **renumérotés** (1 à N, sans « bis ») et ne sont plus ceux de la navette. Renvoie les stems
    Sénat et les numéros de texte adopté (TA) de l'AN, 17e législature."""
    origines = {o["oritxtcod"]: o for o in table(dosleg, MEMBRE_DOSLEG, "oritxt")}
    senat_, an_ = set(), set()
    for t in table(dosleg, MEMBRE_DOSLEG, "texte"):
        if (origines.get(t["oritxtcod"]) or {}).get("oritxtado") != "D":
            continue
        if m := re.fullmatch(r"([a-z]+\d\d-\d+)\.html", t.get("texurl") or ""):
            senat_.add(m.group(1))
        elif (m := URL_AN.search(t.get("texurl") or "")) and m.group(1) == "17" and m.group(2) == "t":
            an_.add(int(m.group(3)))
    return senat_, an_


def references(dosleg):
    """Textes des sessions récentes publiés par le Sénat : (stem, texte DOSLEG, signet du dossier, origine).
    `texte["definitif"]` : adopté définitivement (articles renumérotés, cf. `definitifs`)."""
    signets = {l["loicod"]: l["signet"] for l in table(dosleg, MEMBRE_DOSLEG, "loi")}
    lectures = {l["lecidt"]: signets.get(l["loicod"]) for l in table(dosleg, MEMBRE_DOSLEG, "lecture")}
    dossier_de = {l["lecassidt"]: lectures.get(l["lecidt"]) for l in table(dosleg, MEMBRE_DOSLEG, "lecass")}
    origines = {o["oritxtcod"]: o for o in table(dosleg, MEMBRE_DOSLEG, "oritxt")}
    for t in table(dosleg, MEMBRE_DOSLEG, "texte"):
        m = re.fullmatch(r"([a-z]+\d\d-\d+)\.html", t.get("texurl") or "")
        session = t.get("sesann") or ""                # absente sur 40 textes anciens
        if m and session.isdigit() and int(session) >= PREMIERE_ANNEE and dossier_de.get(t["lecassidt"]):
            o = origines.get(t["oritxtcod"]) or {}
            yield m.group(1), {**t, "definitif": o.get("oritxtado") == "D"}, dossier_de[t["lecassidt"]], o.get("oritxtlib")


def texte_de(element) -> str:
    return re.sub(r"[ \t\xa0]+", " ", "".join(element.itertext())).strip()


def corps_articles(racine, ns: str) -> dict[str, str]:
    """eId -> texte de chaque article : ses `content`, une ligne chacun, dans l'ordre de lecture.

    Un `alinea` Akoma Ntoso du Sénat en contient d'autres (« 1° » puis ses « a) », « b) ») et
    publie son propre `content` (« 1° L'article … est ainsi modifié : ») *après* eux : on le lit
    avant ses enfants. Le texte d'un alinéa parent inclut celui de ses enfants : ne lire que les
    `content` évite de répéter les sous-alinéas."""
    def lignes(element):
        propres = [texte_de(c) for c in element if c.tag == f"{ns}content"]
        enfants = [x for c in element if c.tag not in (f"{ns}content", f"{ns}num", f"{ns}heading") for x in lignes(c)]
        return propres + enfants

    return {a.get("eId"): "\n".join(x for x in lignes(a) if x) for a in racine.iter(f"{ns}article")}


def version(doc: Document):
    stem, t, signet, origine = doc.donnees
    try:
        racine = ElementTree.fromstring(doc.octets)
    except ElementTree.ParseError as e:
        raise DocumentIllisible(str(e)) from e
    ns = racine.tag.split("}")[0] + "}" if racine.tag.startswith("{") else ""
    date = next((d.get("date") for d in racine.iter(f"{ns}FRBRdate") if d.get("date")), None)
    ident, cle_dossier = senat("texte", stem), f"SENAT:dossier:{signet}"
    yield Objet("version_texte", ident, {
        "dossier_id": senat("dossier", signet), "nature": origine or "inconnue", "chambre": "SENAT",
        "date": jour(date), "format": "akn_senat"}, "/akomaNtoso", f"{AKN}/{stem}.akn.xml")
    emises, cas = [], []
    corps_lus = corps_articles(racine, ns)
    # Texte adopté définitivement : articles renumérotés, plus ceux de la navette : aucun suivi.
    definitif = bool(t.get("definitif"))
    for ordre, a in enumerate(racine.iter(f"{ns}article")):
        num = a.find(f"{ns}num")
        libelle = texte_de(num) if num is not None else ""
        numero = numero_article(libelle)
        corps = corps_lus.get(a.get("eId")) or texte_de(a).removeprefix(libelle).strip()
        if numero is None:
            cas.append(f"article_sans_numero:{stem}:{a.get('eId')}")
            yield CasRevue("article_sans_numero", f"article_sans_numero:{stem}:{a.get('eId')}", "constat",
                           f"{stem} : l'article {a.get('eId')} n'a pas de numéro lisible (« {libelle} »)",
                           contexte={"texte": stem, "eId": a.get("eId"), "libelle": libelle})
        suivi = article_suivi(cle_dossier, numero) if numero and not definitif else None
        if suivi:
            yield Objet("article_suivi", suivi, {"dossier_id": senat("dossier", signet), "numero_initial": numero},
                        f"/akomaNtoso//article[@eId='{a.get('eId')}']")
        heading = a.find(f"{ns}heading")
        identite = senat("article", f"{stem}#{a.get('eId')}")
        emises.append(identite)
        yield Objet("version_article", identite, {
            "version_texte_id": ident, "article_suivi_id": suivi, "numero": numero or libelle or a.get("eId"),
            "intitule": texte_de(heading) if heading is not None else None,
            "mention": ", ".join(mentions(libelle)) or None, "ordre": ordre, "texte": corps,
            "empreinte": hashlib.sha256(corps.encode()).hexdigest(),
            "statut": statut_mention(mentions(libelle)) or ("supprime" if supprime(corps) else "present")},
            f"/akomaNtoso//article[@eId='{a.get('eId')}']")
    yield Ensemble("version_article", "version_texte_id", ident, tuple(emises), (f"article_sans_numero:{stem}:",),
                   tuple(cas))


def executer(ctx):
    dosleg = ctx.fichier(DOSLEG.nom)
    publies = set()
    for f in INDEX:
        publies |= set(re.findall(r"akomantoso/([a-z]+\d\d-\d+)\.akn\.xml", ctx.fichier(f.nom).read_text()))
    cache = dosleg.parent / "akn"
    cache.mkdir(exist_ok=True)
    a_lire, absents = [], []
    for stem, t, signet, origine in references(dosleg):
        if stem not in publies:
            absents.append((stem, signet))
            continue
        f = Fichier(f"akn/{stem}.akn.xml", f"{AKN}/{stem}.akn.xml")
        if not (dosleg.parent / f.nom).exists() or ctx.retelecharger:
            try:
                f.recuperer(dosleg.parent, ctx.retelecharger)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                absents.append((stem, signet))
                continue
            finally:
                time.sleep(PAUSE)
        a_lire.append((f, (stem, t, signet, origine)))
    with ctx.registre.transaction():
        for stem, signet in absents:
            revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                "document_non_publie", f"document_non_publie:akn:{stem}", "constat",
                f"Texte {stem} (dossier {signet}) cité par DOSLEG, non publié en Akoma Ntoso",
                contexte={"url": f"{AKN}/{stem}.akn.xml"}), None, ctx.bilan)

    def docs():
        for f, donnees in a_lire:
            yield Document(f, f.nom, (dosleg.parent / f.nom).read_bytes(), donnees[0], donnees)

    charger(ctx, Flux(Systeme.SENAT, LICENCE, docs, version))


ETAPE = Etape("senat.textes", executer, apres=("senat.dossiers",), sources=lambda p: [DOSLEG, *INDEX],
              description="textes du Sénat en Akoma Ntoso : versions de texte et d'article, suivi des articles")
