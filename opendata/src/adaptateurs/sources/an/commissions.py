"""Comptes rendus des réunions de commission de l'AN (HTML unitaire `dyn/opendata/CRC….html`).

Pas de XML structuré : le HTML issu de Word se découpe par règles.
- paragraphe commençant par un passage en gras terminé par un point (« M. Alexis Corbière,
  rapporteur. ») : nouvelle prise de parole, orateur tel que publié ;
- paragraphe entièrement en gras (« Article 1er : … ») : intitulé, qui fixe l'article discuté ;
- paragraphe en italique : didascalie (« Amendements AS2 de Mme X… », « La commission adopte… »),
  gardée comme intervention sans orateur ; elle fixe les amendements discutés et, quand elle cite
  « (n° 4) », le texte examiné ;
- autre paragraphe : suite de la prise de parole en cours.

L'orateur n'est désigné que par son nom : aucun lien certain vers une personne (décision
ouverte n° 7). Dossier : seulement par le numéro de texte cité dans le compte rendu, à partir de
l'endroit où il est cité. L'agenda ne suffit pas : une réunion annoncée avec un seul point peut
commencer par une audition qu'il ne mentionne pas.
"""

import hashlib
import re
import time
import urllib.error
from html.parser import HTMLParser
from pathlib import Path

from .... import revue
from ....chargement import Document, Flux, charger
from ....domaine.objets import CasRevue, Dependants, Objet
from ....etl import Etape, Fichier
from . import agenda, amendements, dossiers, travaux
from .cas import amendement_cite, candidats_orateur
from .commun import DOCUMENT, LICENCE, Systeme, an, documents, liste, lire, val
from .seances import numeros_cites

PAUSE = 0.3                                    # secondes entre deux téléchargements (politesse)
INTITULE_ARTICLE = re.compile(r"^(Article|Après l[’']article|Avant l[’']article|Titre|Chapitre)\b", re.I)
AMENDEMENT = re.compile(r"\b([A-Z]{1,5}\d{1,5})\b")
TEXTE_CITE = re.compile(r"\(n[°os]*\s*(\d[^)]*)\)")
FIN_DES_DEBATS = re.compile(r"^(Présents|Excusés|Assistaient également)\.?\s*[–-]")


class Paragraphes(HTMLParser):
    """Paragraphes du corps : texte, partie en gras en tête, entièrement gras ou italique."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.resultat, self._p, self._styles = [], None, []

    def handle_starttag(self, balise, attributs):
        style = dict(attributs).get("style") or ""
        if balise == "p":
            self._p = []
        elif balise == "span":
            self._styles.append(("gras" if "font-weight:bold" in style else "")
                                + ("italique" if "font-style:italic" in style else ""))

    def handle_endtag(self, balise):
        if balise == "span" and self._styles:
            self._styles.pop()
        elif balise == "p" and self._p is not None:
            morceaux, self._p = self._p, None
            texte = re.sub(r"\s+", " ", "".join(t for t, _ in morceaux)).strip()
            if not texte:
                return
            tete = ""
            for t, style in morceaux:
                if "gras" in style:
                    tete += t
                elif t.strip():
                    break
                else:
                    tete += t
            visibles = [(t, s) for t, s in morceaux if t.strip()]
            self.resultat.append({
                "texte": texte, "tete_gras": re.sub(r"\s+", " ", tete).strip(),
                "gras": all("gras" in s for _, s in visibles),
                "italique": all("italique" in s for _, s in visibles)})

    def handle_data(self, donnees):
        if self._p is not None:
            self._p.append((donnees, " ".join(self._styles)))


def paragraphes(octets: bytes) -> list[dict]:
    lecteur = Paragraphes()
    texte = octets.decode("utf-8", "replace")
    lecteur.feed(texte[texte.find("<body"):])
    return lecteur.resultat


def orateur(tete: str) -> tuple[str, str | None]:
    """« M. Yannick Chenevard, rapporteur. » -> (« M. Yannick Chenevard », « rapporteur »)."""
    libelle = tete.rstrip(" .")
    nom, _, qualite = libelle.partition(",")
    return nom.strip(), qualite.strip() or None


def compte_rendu(doc: Document, reunion_du_cr: dict[str, tuple[str, str | None]],
                 dossier_du_texte: dict[tuple[str, str], set[str]], amendements_commission=None,
                 presents: dict[str, dict[str, str]] | None = None, annuaire=None):
    """`amendements_commission` : (organe, numéro du texte, numéro) -> uids des amendements ;
    `presents` : réunion -> {acteur: présence} ; `annuaire` : nom -> acteurs (candidats de revue)."""
    uid = doc.chemin.rsplit("/", 1)[-1].removesuffix(".html")
    reunion, organe = reunion_du_cr.get(uid, (None, None))
    if not reunion:
        return
    yield Objet("document", an("document", uid), {
        "type": "compte_rendu", "type_source": "CRC", "numero": uid, "url": f"{DOCUMENT}/{uid}.html"},
        "/html", f"{DOCUMENT}/{uid}.html")

    interventions, article, amendements = [], None, None
    dossiers_cites: list[str] = []
    textes_cites: list[str] = []
    for i, p in enumerate(paragraphes(doc.octets)):
        if FIN_DES_DEBATS.match(p["texte"]):
            break                              # listes de présence : déjà dans l'agenda
        if p["gras"] and not p["italique"]:
            if INTITULE_ARTICLE.match(p["texte"]):
                article = p["texte"].split(":")[0].strip()
            interventions.append({"libelle": "", "qualite": None, "role": "intitule", "texte": [p["texte"]],
                                  "article": article, "amendements": None, "dossiers": dossiers_cites})
        elif p["tete_gras"] and len(p["tete_gras"]) < len(p["texte"]) and p["tete_gras"].endswith("."):
            nom, qualite = orateur(p["tete_gras"])
            interventions.append({"libelle": nom, "qualite": qualite, "role": "parole",
                                  "texte": [p["texte"][len(p["tete_gras"]):].strip()],
                                  "article": article, "amendements": amendements, "dossiers": dossiers_cites,
                                  "textes": textes_cites})
        elif p["italique"] or not interventions:
            if re.search(r"\bamendements?\b", p["texte"], re.I):
                amendements = ", ".join(dict.fromkeys(AMENDEMENT.findall(p["texte"]))) or amendements
            # « (n° 4) », « (n° 481 rect.) », « (n° 324 – seconde partie) »
            numeros = numeros_cites(m.group(1)) if (m := TEXTE_CITE.search(p["texte"])) else []
            if numeros:
                dossiers_cites = sorted(set().union(*(dossier_du_texte.get(("17", n), set()) for n in numeros)))
                textes_cites = numeros
            interventions.append({"libelle": "", "qualite": None, "role": "didascalie", "texte": [p["texte"]],
                                  "article": article, "amendements": None, "dossiers": dossiers_cites})
        else:
            interventions[-1]["texte"].append(p["texte"])

    orateurs: dict[str, list] = {}                         # libellé -> interventions à identifier
    problemes: dict[str, tuple[list[str], list, list]] = {}   # numéro -> (candidats, interventions, textes)
    for ordre, t in enumerate(interventions):
        corps = "\n".join(t["texte"])
        cites = t["dossiers"]
        ident = an("intervention", f"{uid}#{ordre}")
        discutes = []
        for n in (t["amendements"] or "").split(", ") if t["role"] == "parole" else []:
            if not n:
                continue
            candidats = list(dict.fromkeys(u for texte in t.get("textes", [])
                                           for u in (amendements_commission or {}).get((organe, texte, n), [])))
            if len(candidats) == 1:
                discutes.append(candidats[0])
            else:
                problemes.setdefault(n, (candidats, [], t.get("textes", [])))[1].append(("intervention", ident))
        discutes = list(dict.fromkeys(discutes))
        if t["role"] == "parole":
            orateurs.setdefault(t["libelle"], []).append(("intervention", ident))
        yield Objet("intervention", ident, {
            "reunion_id": an("reunion", reunion), "ordre": ordre, "orateur_libelle": t["libelle"],
            "qualite": t["qualite"], "role": t["role"], "texte": corps,
            "empreinte": hashlib.sha256(corps.encode()).hexdigest(),
            "dossier_id": an("dossier", cites[0]) if len(cites) == 1 else None,
            "article": t["article"], "amendements": t["amendements"],
            "amendement_id": an("amendement", discutes[0]) if len(discutes) == 1 else None}, f"/html/p[{ordre}]")
        if len(discutes) > 1:
            yield Dependants("lien", {"de_id": ident, "nature": "amendement"},
                             [{"vers_id": an("amendement", u), "ordre": j} for j, u in enumerate(discutes)],
                             requis=("vers_id",))
        if len(cites) > 1:
            yield Dependants("lien", {"de_id": ident, "nature": "dossier"},
                             [{"vers_id": an("dossier", d), "ordre": j} for j, d in enumerate(cites)],
                             requis=("vers_id",))

    for numero, (candidats, cibles, textes) in problemes.items():
        yield amendement_cite(f"amendement_cite:AN:{reunion}:{numero}", numero, candidats, cibles,
                              {"ou": f"commission, réunion {reunion}", "compte_rendu": uid, "organe": organe,
                               "textes_cites": textes or "aucun texte cité avant"})
    for libelle, cibles in orateurs.items():
        candidats = candidats_orateur(libelle, annuaire or {}, (presents or {}).get(reunion, {}))
        yield CasRevue("orateur_commission", f"orateur_commission:{reunion}:{libelle}", "champ",
                       f"« {libelle} » ({len(cibles)} intervention(s), réunion {reunion}) : orateur désigné par son "
                       f"nom seulement, {len(candidats)} homonyme(s) dans l'AMO",
                       champ="orateur_id", cibles=tuple(cibles), candidats=candidats,
                       contexte={"libelle": libelle, "reunion": reunion, "compte_rendu": uid, "organe": organe})


def references(chemin_agenda) -> tuple[dict[str, tuple[str, str | None]], dict[str, dict[str, str]]]:
    """Compte rendu de commission -> (réunion, organe réuni) ; réunion -> {acteur: présence}."""
    reunion_du_cr, presents = {}, {}
    for doc in documents(agenda.AGENDA, chemin_agenda, "reunion/"):
        r = lire(doc)["reunion"]
        cr = val(r.get("compteRenduRef")) or ""
        if cr.startswith("CRC"):
            reunion_du_cr[cr] = (r["uid"], val(r.get("organeReuniRef")))
            presents[r["uid"]] = {val(p.get("acteurRef")): val(p.get("presence")) for p in liste(
                ((r.get("participants") or {}).get("participantsInternes") or {}).get("participantInterne"))}
    return reunion_du_cr, presents


def telecharger(comptes_rendus, cache: Path, forcer: bool, bilan) -> tuple[list[Fichier], list[str]]:
    """Un fichier par compte rendu, mis en cache ; un compte rendu annoncé mais pas encore publié
    (404) est mis en revue (constat), pas bloquant : il sera pris au prochain passage."""
    (cache / "commissions").mkdir(parents=True, exist_ok=True)
    fichiers, absents = [], []
    for uid in sorted(comptes_rendus):
        f = Fichier(f"commissions/{uid}.html", f"{DOCUMENT}/{uid}.html")
        if not (cache / f.nom).exists() or forcer:
            try:
                f.recuperer(cache, forcer)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                bilan["compte_rendu_non_publie"] += 1
                absents.append(uid)
                continue
            finally:
                time.sleep(PAUSE)
        fichiers.append(f)
    return fichiers, absents


def executer(ctx):
    chemin_agenda = ctx.fichier(agenda.AGENDA.nom)
    cache = chemin_agenda.parent
    reunion_du_cr, presents = references(chemin_agenda)
    dossier_du_texte = dossiers.numeros_de_texte(ctx.fichier(dossiers.DOSSIERS.nom))
    index = ctx.artefacts.get("an.amendements") or amendements.Index(ctx.fichier(amendements.AMENDEMENTS.nom))
    fichiers, absents = telecharger(reunion_du_cr, cache, ctx.retelecharger, ctx.bilan)
    with ctx.registre.transaction():
        for uid in absents:
            revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                "document_non_publie", f"document_non_publie:{uid}", "constat",
                f"{uid} est annoncé par l'agenda (réunion {reunion_du_cr[uid][0]}) mais n'est pas publié",
                sujet=("document", an("document", uid)), contexte={"url": f"{DOCUMENT}/{uid}.html"}), None, ctx.bilan)

    def docs():
        for f in fichiers:
            yield Document(f, f.nom, (cache / f.nom).read_bytes(), f.nom.rsplit("/", 1)[-1][:-5])

    charger(ctx, Flux(Systeme.AN, LICENCE, docs,
                      lambda d: compte_rendu(d, reunion_du_cr, dossier_du_texte, index.commission, presents,
                                             travaux.annuaire(ctx))))


ETAPE = Etape("an.commissions", executer, apres=("an.travaux",),
              sources=lambda p: [agenda.AGENDA, dossiers.DOSSIERS, amendements.AMENDEMENTS],
              description="comptes rendus de commission (HTML) : prises de parole, didascalies, texte examiné")
