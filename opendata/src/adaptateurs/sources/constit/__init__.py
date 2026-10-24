"""Décisions du Conseil constitutionnel (stock DILA CONSTIT : global, puis incréments quotidiens).

Identité d'une décision : son numéro (« 2026-910 »), que l'AN cite aussi (`anneeDecision`-
`numDecision`) : même entité des deux côtés, par référence explicite. Répartition des champs : le
Conseil écrit ce qu'il publie (nature, date, solution, URL, NOR de la loi déférée) ; l'AN écrit le
lien vers le dossier. Les fichiers de suppression des incréments ne sont pas encore appliqués.
"""

import re
import tarfile
import urllib.request
from xml.etree import ElementTree

from ....chargement import Document, Flux, charger
from ....domaine import IdentiteNative, Systeme
from ....domaine.objets import Objet
from ....etl import Etape, Fichier

DEPOT = "https://echanges.dila.gouv.fr/OPENDATA/CONSTIT/"
LICENCE = "Licence Ouverte / Etalab 2.0"


def decision(numero: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.CONSTIT, "decision", numero) if numero else None


def livraisons() -> list[Fichier]:
    """Le dernier stock global et tous les incréments publiés après lui, dans l'ordre."""
    with urllib.request.urlopen(DEPOT, timeout=60) as r:
        page = r.read().decode("latin-1")
    globaux = sorted(set(re.findall(r'href="(Freemium_constit_global_(\d{8}-\d{6})\.tar\.gz)"', page)))
    if not globaux:
        raise RuntimeError(f"aucun stock global CONSTIT dans {DEPOT}")
    nom_global, date_global = globaux[-1]
    increments = sorted(n for n, d in set(re.findall(r'href="(CONSTIT_(\d{8}-\d{6})\.tar\.gz)"', page)) if d > date_global)
    return [Fichier(n, f"{DEPOT}{n}") for n in [nom_global, *increments]]


def texte(racine, chemin: str) -> str | None:
    e = racine.find(chemin)
    return (e.text or "").strip() or None if e is not None else None


def analyser(doc: Document):
    racine = ElementTree.fromstring(doc.octets)
    numero = texte(racine, "META/META_SPEC/META_JURI/NUMERO")
    if not numero:
        return
    loi = racine.find("META/META_SPEC/META_JURI_CONSTIT/LOI_DEF")
    nor_loi = loi.get("nor") if loi is not None else None
    yield Objet("decision_cc", decision(numero), {
        "numero": numero, "type": texte(racine, "META/META_COMMUN/NATURE"),
        "date": texte(racine, "META/META_SPEC/META_JURI/DATE_DEC"),
        "solution": texte(racine, "META/META_SPEC/META_JURI/SOLUTION"),
        "nor_loi": nor_loi if nor_loi and nor_loi != "SUPPRIME" else None,
        "url": texte(racine, "META/META_SPEC/META_JURI_CONSTIT/URL_CC")},
        "/TEXTE_JURI_CONSTIT/META", texte(racine, "META/META_SPEC/META_JURI_CONSTIT/URL_CC"))


def documents(fichiers, chemins):
    for f in fichiers:
        with tarfile.open(chemins[f.nom]) as tar:
            # « 20250716-211907/constit/global/CONS/TEXT/00/00/51/…/CONSTEXT….xml »
            for membre in sorted((m for m in tar.getmembers() if m.isfile() and m.name.endswith(".xml")
                                  and "/CONS/TEXT/" in m.name), key=lambda m: m.name):
                yield Document(f, membre.name, tar.extractfile(membre).read(), membre.name.rsplit("/", 1)[-1][:-4])


def executer(ctx):
    fichiers = ctx.parametres["constit.livraisons"]
    chemins = {f.nom: ctx.fichier(f.nom) for f in fichiers}
    charger(ctx, Flux(Systeme.CONSTIT, LICENCE, lambda: documents(fichiers, chemins), analyser))


def sources(parametres):
    if "constit.livraisons" not in parametres:
        parametres["constit.livraisons"] = livraisons()
    return parametres["constit.livraisons"]


ETAPE = Etape("constit.decisions", executer, sources=sources,
              description="décisions du Conseil constitutionnel (stock DILA CONSTIT)")
ETAPES = [ETAPE]
