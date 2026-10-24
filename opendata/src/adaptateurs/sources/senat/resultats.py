"""Résultat des scrutins publics du Sénat, tel que la présidence l'annonce au compte rendu intégral.

Le dump DOSLEG ne publie pas le sort d'un scrutin : `scr.soslib` dit qui l'a demandé (« à la
demande du groupe… »), `scr.scrmaj` (« majorité des suffrages exprimés ») vaut 0 depuis 2012. Le
compte rendu intégral (`cri.zip`) l'annonce, lui, dans un bloc fixe :
« … le résultat du scrutin n° 340 : » puis les tableaux `cri:scrutin1` / `cri:scrutin2`
(votants, suffrages exprimés, pour, contre), puis la phrase du président : « Le Sénat a adopté. »,
« Le Sénat n'a pas adopté. », « (La proposition de loi est adoptée.) »…
Le sort n'est pris que de cette phrase (jamais calculé à partir des voix) ; une phrase non
reconnue reste sans sort. Le scrutin est retrouvé par le jour du compte rendu et son numéro ; le
numéro est unique dans une séance. Deux annonces discordantes pour un même scrutin, ou une phrase
non reconnue : pas de sort, un cas de revue (`travaux.scrutin`).
"""

import html
import re
import zipfile

from ....etl import Fichier
from .commun import DONNEES

CRI = Fichier("cri.zip", f"{DONNEES}/debats/cri.zip")
JOUR = re.compile(r"cri/d(\d{8})\.xml$")
DEPUIS = "20240701"                            # session 2024-2025 (`travaux.PREMIERE_ANNEE`), et sa veille

ANNONCE = re.compile(r"résultat du scrutin n°\s*(\d+)\s*:\s*</p>"
                     r"(?P<tableaux>(?:\s*<cri:scrutin\d>.*?</cri:scrutin\d>)+)\s*<p[^>]*>(?P<phrase>.*?)</p>", re.S)
CASE = re.compile(r"<td[^>]*>(.*?)</td>\s*<td[^>]*>\s*(\d+)\s*</td>", re.S)
DECOMPTE = {"nombre de votants": "votants", "nombre de suffrages exprimés": "suffrages",
            "pour l'adoption": "pour", "contre": "contre"}
# Phrase du président : le sujet (« Le Sénat », « La proposition de loi », « L'article 3 »,
# « La motion »…) a été ou n'a pas été adopté. La négation est cherchée d'abord.
SUJET = r"(?:Le Sénat|(?:La|Le|Les|L')\s?[^.]{1,200}?)"
REJETE = re.compile(rf"^{SUJET}\s+n'(?:a pas (?:adopté|approuvé)|(?:est|sont) pas (?:définitivement )?adoptée?s?)\b")
ADOPTE = re.compile(rf"^(?:Le Sénat a (?:adopté|approuvé)|{SUJET}\s+(?:est|sont) (?:définitivement )?adoptée?s?)\b")


def texte(x: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).replace("’", "'").strip()


def sort(phrase: str) -> str | None:
    """« Le Sénat a adopté définitivement. » -> « adopté » ; « (L'article 3 n'est pas adopté.) » ->
    « rejeté » ; toute autre phrase -> None."""
    p = phrase.replace("’", "'").lstrip("( ")
    if REJETE.match(p):
        return "rejeté"
    return "adopté" if ADOPTE.match(p) else None


def annonces(contenu: str) -> list[dict]:
    """Annonces de résultat d'un compte rendu (XML décodé) : numéro, décompte, phrase, sort."""
    resultats = []
    for m in ANNONCE.finditer(html.unescape(contenu)):
        decompte = {DECOMPTE[c]: int(v) for libelle, v in CASE.findall(m.group("tableaux"))
                    if (c := texte(libelle).lower()) in DECOMPTE}
        phrase = texte(m.group("phrase"))
        resultats.append({"numero": m.group(1), "decompte": decompte, "phrase": phrase, "sort": sort(phrase)})
    return resultats


def lire(chemin) -> dict[tuple[str, str], list[dict]]:
    """(jour « AAAA-MM-JJ », numéro) -> annonces de ce scrutin dans le compte rendu de ce jour."""
    index: dict[tuple[str, str], list[dict]] = {}
    with zipfile.ZipFile(chemin) as z:
        for info in sorted(z.infolist(), key=lambda i: i.filename):
            m = JOUR.search(info.filename)
            # Un compte rendu ne peut être publié avant sa séance : `cri/d20261204.xml`, daté du
            # 06/01/2026 dans l'archive, n'est pas le compte rendu du 04/12/2026 ; il est écarté.
            if not m or m.group(1) < DEPUIS or m.group(1) > "%04d%02d%02d" % info.date_time[:3]:
                continue
            j = m.group(1)
            for a in annonces(z.read(info).decode("iso-8859-1")):
                index.setdefault((f"{j[:4]}-{j[4:6]}-{j[6:]}", a["numero"]), []).append({**a, "compte_rendu": f"d{j}"})
    return index
