"""Jeux à inventorier, par producteur. Les URLs des stocks DILA et du RNE changent à chaque
livraison : elles sont résolues au moment de l'inventaire (listing du serveur, API data.gouv)."""

import json
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

from ..etl import Fichier

AN = "https://data.assemblee-nationale.fr/static/openData/repository/17"
AN_DOC = "https://www.assemblee-nationale.fr/dyn/opendata"
DILA = "https://echanges.dila.gouv.fr/OPENDATA"
RNE = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/"


@dataclass(frozen=True)
class Source:
    """Un producteur : licence et documentation, et ses fichiers (fixes ou résolus à la demande)."""
    licence: str
    documentation: str
    fichiers: list[Fichier] = field(default_factory=list)
    resoudre: Callable[[], list[Fichier]] | None = None

    def tous(self) -> list[Fichier]:
        return self.fichiers + (self.resoudre() if self.resoudre else [])


def _lire(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")


def dernier_increment(stock: str) -> list[Fichier]:
    """Dernière livraison incrémentale d'un stock DILA (le stock global pèse plusieurs Go)."""
    liens = sorted(set(re.findall(rf'href="({stock}_\d{{8}}-\d{{6}}\.tar\.gz)"', _lire(f"{DILA}/{stock}/"))))
    if not liens:
        raise RuntimeError(f"Aucune livraison {stock} dans {DILA}/{stock}/")
    return [Fichier(liens[-1], f"{DILA}/{stock}/{liens[-1]}")]


def textes_akn(n: int) -> list[Fichier]:
    """Les `n` derniers textes Akoma Ntoso déposés au Sénat (index depots.xml)."""
    urls = re.findall(r"<url>([^<]+\.akn\.xml)</url>", _lire("https://www.senat.fr/akomantoso/depots.xml"))
    return [Fichier(u.rsplit("/", 1)[-1], u) for u in urls[:n]]


# Fichiers du RNE retenus pour le prototype : maires, EPCI et parlementaires (cf. plan, phase 0).
RNE_RETENUS = re.compile(r"maires|epci|communautaires|d[ée]put[ée]s|s[ée]nateurs|europ", re.I)


def fichiers_rne() -> list[Fichier]:
    ressources = json.loads(_lire(RNE))["resources"]
    retenus = []
    for r in ressources:
        if r.get("format", "").lower() == "csv" and RNE_RETENUS.search(r.get("title", "")):
            nom = re.sub(r"[^a-z0-9]+", "_", r["title"].lower()).strip("_") + ".csv"
            retenus.append(Fichier(nom, r["url"]))
    return retenus


SOURCES = {
    "an": Source(
        "Licence Ouverte / Etalab 2.0", "https://data.assemblee-nationale.fr/",
        [Fichier("acteurs.json.zip", f"{AN}/amo/tous_acteurs_mandats_organes_xi_legislature/"
                                     "AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip"),
         Fichier("dossiers.json.zip", f"{AN}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip"),
         Fichier("amendements.json.zip", f"{AN}/loi/amendements_div_legis/Amendements.json.zip"),
         Fichier("scrutins.json.zip", f"{AN}/loi/scrutins/Scrutins.json.zip"),
         Fichier("comptes_rendus.xml.zip", f"{AN}/vp/syceronbrut/syseron.xml.zip"),
         Fichier("agenda.json.zip", f"{AN}/vp/reunions/Agenda.json.zip"),
         Fichier("questions_gouvernement.json.zip",
                 f"{AN}/questions/questions_gouvernement/Questions_gouvernement.json.zip"),
         Fichier("questions_ecrites.json.zip", f"{AN}/questions/questions_ecrites/Questions_ecrites.json.zip"),
         Fichier("questions_orales.json.zip",
                 f"{AN}/questions/questions_orales_sans_debat/Questions_orales_sans_debat.json.zip"),
         # Documents unitaires : métadonnées XML et rendu HTML (texte découpable par article,
         # compte rendu de commission). Un exemple de chaque, pour la forme.
         *[Fichier(f"document_{uid}.{ext}", f"{AN_DOC}/{uid}.{ext}")
           for uid in ("PIONANR5L17B2851", "CRCANR5L17S2026PO419604N052") for ext in ("xml", "html")]]),
    "senat": Source(
        "Licence Ouverte / Etalab 2.0", "https://data.senat.fr/",
        [Fichier("dosleg.zip", "https://data.senat.fr/data/dosleg/dosleg.zip"),
         Fichier("ameli.zip", "https://data.senat.fr/data/ameli/ameli.zip"),
         Fichier("debats.zip", "https://data.senat.fr/data/debats/debats.zip"),
         Fichier("senateurs.csv", "https://data.senat.fr/data/senateurs/ODSEN_GENERAL.csv"),
         *[Fichier(f"{nom.lower()}.csv", f"https://data.senat.fr/data/senateurs/ODSEN_{nom}.csv")
           for nom in ("ELUSEN", "HISTOGROUPES", "COMS", "ELUDEP", "MANDAT_LOCAL")],
         Fichier("akn_depots.xml", "https://www.senat.fr/akomantoso/depots.xml"),
         Fichier("akn_adoptions.xml", "https://www.senat.fr/akomantoso/adoptions.xml")],
        resoudre=lambda: textes_akn(3)),
    "legifrance": Source(
        "Licence Ouverte / Etalab 2.0", "https://echanges.dila.gouv.fr/OPENDATA/",
        resoudre=lambda: dernier_increment("JORF") + dernier_increment("LEGI")),
    "constit": Source(
        "Licence Ouverte / Etalab 2.0", "https://echanges.dila.gouv.fr/OPENDATA/CONSTIT/",
        resoudre=lambda: dernier_increment("CONSTIT")),
    "hatvp": Source(
        "Licence Ouverte / Etalab 2.0", "https://www.hatvp.fr/open-data/",
        [Fichier("declarations_liste.csv", "https://www.hatvp.fr/livraison/opendata/liste.csv"),
         Fichier("declarations.xml", "https://www.hatvp.fr/livraison/merge/declarations.xml"),
         Fichier("repertoire.json", "https://www.hatvp.fr/agora/opendata/agora_repertoire_opendata.json")]),
    "rne": Source(
        "Licence Ouverte / Etalab 2.0", "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
        resoudre=fichiers_rne),
}
