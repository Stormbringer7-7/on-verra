"""Normalisation des noms de personnes, pour PROPOSER des candidats à la revue humaine.

Un nom n'est jamais une preuve d'identité (doc CivicTrace §4.4) : ces fonctions servent seulement
à lister les personnes plausibles d'un cas de revue, jamais à décider.
"""

import re
import unicodedata

CIVILITES = r"(?:m\.|mme|mlle|mm\.|pr|dr|me)"
_FONCTIONS = ["president", "presidente", "vice-president", "vice-presidente", "rapporteur", "rapporteure",
              "rapporteur general", "rapporteure generale", "ministre", "ministre delegue", "ministre deleguee",
              "secretaire d'etat", "garde des sceaux", "premier ministre", "premiere ministre", "doyen", "doyenne"]
# la plus longue d'abord : « rapporteur général » avant « rapporteur »
FONCTIONS = r"(?:le |la |l')?(?:" + "|".join(sorted(_FONCTIONS, key=len, reverse=True)) + ")"


def sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texte) if not unicodedata.combining(c))


def normaliser(nom: str) -> str:
    """« Mathieu LEFÈVRE » -> « mathieu lefevre » ; ponctuation et espaces réduits."""
    t = sans_accents(nom or "").lower().replace("’", "'")
    t = re.sub(r"[^a-z' -]", " ", t)
    return re.sub(r"\s+", " ", t).strip(" -'")


def nom_d_orateur(libelle: str) -> str:
    """Nom porté par un libellé d'orateur, sans civilité, fonction ni groupe :
    « M. le président Florent Boudié » -> « florent boudie » ; « M. le rapporteur général » -> ""."""
    t = sans_accents(libelle or "").lower().replace("’", "'")
    t = re.sub(r"\([^)]*\)", " ", t).split(",")[0]
    t = re.sub(rf"^\s*{CIVILITES}\s+", "", t)
    while (sans := re.sub(rf"^\s*{FONCTIONS}\b\s*", "", t)) != t:
        t = sans
    return normaliser(t)
