"""Suivi d'un article à travers les versions d'un texte (navette).

Pendant la navette, un article garde son numéro officiel : un article inséré devient « 3 bis »,
un article supprimé reste « (Supprimé) ». L'identité d'un article suivi est donc dérivée de deux
références officielles : la clé du dossier et ce numéro. La loi promulguée renumérote ses
articles : ce passage n'est pas couvert ici (il passera par Légifrance, en revue si besoin).
"""

import re
import unicodedata
from html.parser import HTMLParser

from .domaine import IdentiteNative, Systeme

_HTML = re.compile(r"</?[a-zA-Z][^<>]*>|&#?\w+;")
# UTF-8 relu en Windows-1252 : « Ã© » pour « é », « â€™ » pour « ’ ». Seulement ces marqueurs, qui
# n'existent pas en français : « Ã », « Â » ou « â€ » suivis d'octets de suite (0x80-0xBF tels que
# Windows-1252 les affiche ; après « Ã », l'espace insécable de « à » est parfois devenue une espace).
_SUITE = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”" \
         "•–—˜™š›œžŸ -¿"
_MOJIBAKE = re.compile(f"Ã[{_SUITE} ]|â€[{_SUITE}]|Â[ -¿]")
# Un alinéa est un paragraphe : ces balises seules coupent la ligne.
_LIGNE = {"p", "div", "li", "tr", "br"}


def _relu(sequence: str) -> str:
    try:
        return sequence.replace(" ", "\xa0").encode("cp1252").decode("utf-8")
    except UnicodeError:
        return sequence


def texte_html(s: str) -> str:
    """Texte publié → texte propre : HTML parsé (tous les nœuds texte, entités décodées), un alinéa
    par ligne, encodage réparé (UTF-8 lu en Windows-1252, accents décomposés). Sans balise ni
    entité, seul l'encodage est réparé. HTML encodé deux fois (« &lt;p&gt; », « &amp;nbsp; ») :
    parsé jusqu'à ce que le texte ne change plus."""
    if _MOJIBAKE.search(s):
        try:
            s = s.encode("cp1252").decode("utf-8")
        except UnicodeError:
            s = _MOJIBAKE.sub(lambda m: _relu(m.group()), s)
    for _ in range(3):
        if not _HTML.search(s):
            break
        morceaux: list[str] = []
        p = HTMLParser(convert_charrefs=True)
        p.handle_data = morceaux.append
        p.handle_starttag = p.handle_endtag = lambda balise, *_: morceaux.append("\n") if balise in _LIGNE else None
        p.feed(s)
        p.close()
        lignes = (re.sub(r"[^\S\n]+", " ", l).strip() for l in "".join(morceaux).split("\n"))
        propre = "\n".join(l for l in lignes if l)
        if propre == s:
            break
        s = propre
    return unicodedata.normalize("NFC", s)

ORDINAUX = {"1er": "1", "premier": "1", "unique": "unique"}
# Forme d'un numéro d'article : « 3 », « 3 bis », « 3 bis A », « 4 septies », « 1 A », « liminaire ».
# Tout le reste (intitulé collé, liste, plage) n'est pas un numéro.
NUMERO = re.compile(r"(?:\d+|unique|liminaire)(?: (?:bis|ter|quater|[a-z]+ies|[A-Z]{1,4}))*")


def numero_article(libelle: str) -> str | None:
    """« Article 1er » -> « 1 » ; « Article 3 bis A » -> « 3 bis A » ; « Article unique » -> « unique »."""
    # « Article 2 bis (nouveau) », « Article 4 (Supprimé) » : la mention n'est pas le numéro
    t = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", (libelle or "").replace("\xa0", " "))).strip(" .")
    m = re.match(r"^(?:article|art\.)\s+(.+?)\s*$", t, re.I)
    if not m:
        return None
    morceaux = m.group(1).split(" ")
    morceaux[0] = ORDINAUX.get(morceaux[0].lower(), morceaux[0])
    numero = " ".join(morceaux)
    return numero if NUMERO.fullmatch(numero) else None


def _propre(libelle: str) -> str:
    return re.sub(r"\s+", " ", (libelle or "").replace("\xa0", " ").replace("\u2011", "-")).strip()


def mentions(libelle: str) -> list[str]:
    """« Article 4 (Supprimé) » -> [« Supprimé »] ; « (Supprimés) » -> [« Supprimés »]."""
    return [m.strip() for m in re.findall(r"\(([^)]*)\)", _propre(libelle)) if m.strip()]


def mention_seule(libelle: str) -> bool:
    """Le paragraphe n'est qu'une mention entre parenthèses (« (Supprimé) », « (Conforme) ») :
    elle complète le numéro qui précède, ce n'est pas un article."""
    return bool(re.fullmatch(r"(?:\([^)]*\)\s*)+", _propre(libelle)))


def omission(libelle: str) -> bool:
    """« ……………… » : articles non reproduits dans un texte comparatif, pas un article."""
    return bool(re.fullmatch(r"[.…\s]+", _propre(libelle))) and bool(_propre(libelle))


def numeros_articles(libelle: str) -> list[str] | None:
    """Numéros désignés par un intitulé, quand ils sont écrits en toutes lettres :
    « Article 1er » -> [« 1 »] ; « Articles 2 et 3 » -> [« 2 », « 3 »] ;
    « Articles 1er bis, 2 et 3 » -> [« 1 bis », « 2 », « 3 »].
    Une plage (« Articles 19 bis A à 19 bis C ») ne se développe pas sans connaître les articles
    intermédiaires (un « 4 bis » peut s'y trouver) : None, comme un intitulé illisible."""
    t = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", _propre(libelle))).strip(" .")
    m = re.match(r"^articles\s+(.+)$", t, re.I)
    if not m:
        numero = numero_article(t)
        return [numero] if numero else None
    if re.search(r"\s(?:à|au)\s", m.group(1)):
        return None
    morceaux = [x.strip() for x in re.split(r",|\set\s", m.group(1)) if x.strip()]
    numeros = [numero_article(f"Article {x}") for x in morceaux]
    return numeros if numeros and all(numeros) else None


# Mention écrite sans parenthèses sur sa propre ligne (« Article 3<br/>Supprimé ») : seulement ces
# formules exactes ; une autre ligne est un intitulé (« Suppression des exonérations… » en est un).
MENTION_NUE = re.compile(r"(?:supprimés?|suppression (?:conforme|maintenue)|conformes?|non modifiés?|"
                         r"nouveau|division supprimée)", re.I)


def statut_mention(mentions_: list[str]) -> str | None:
    """Statut publié par la mention : supprime, conforme, non_modifie ; None si aucune ne le dit."""
    texte = " ".join(mentions_).lower()
    if "supprim" in texte or "suppression" in texte:
        return "supprime"
    if "non modifi" in texte:
        return "non_modifie"
    if "conforme" in texte:
        return "conforme"
    return None


def article_suivi(cle_dossier: str, numero: str) -> IdentiteNative:
    """`cle_dossier` : identité native du dossier en texte (« SENAT:dossier:pjl25-689 »)."""
    return IdentiteNative(Systeme.CIVICTRACE, "article_suivi", f"{cle_dossier}#{numero}")


def supprime(texte: str) -> bool:
    return bool(re.fullmatch(r"\s*\(?\s*supprimés?\s*\)?\s*\.?\s*", texte or "", re.I))
