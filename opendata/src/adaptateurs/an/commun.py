"""Particularités du JSON de l'open data de l'Assemblée nationale, communes à tous ses flux."""

import json
import zipfile
from pathlib import Path

from ...etl import Fichier

BASE_URL = "https://data.assemblee-nationale.fr/static/openData/repository/{leg}"
# Suffixe des noms d'archives, en chiffres romains pour les législatures closes.
SUFFIXES = {"14": "_XIV", "15": "_XV"}


def fichier(nom: str, legislature: str, chemin: str) -> Fichier:
    return Fichier(f"{nom}_{legislature}.json.zip", f"{BASE_URL.format(leg=legislature)}/{chemin}")


def objets(chemin: Path, type_: str, sous_dossier: str = ""):
    """Objets d'un type ("scrutin", "dossierParlementaire", "document") d'une archive de l'AN.

    Deux générations d'archives : un fichier JSON par objet, rangé par type (15e et suivantes),
    ou un export unique où les objets sont regroupés en listes (14e). `sous_dossier` ne filtre
    que la première.
    """
    with zipfile.ZipFile(chemin) as z:
        noms = [n for n in z.namelist() if n.endswith(".json")]
        for nom in noms:
            if len(noms) == 1 or f"/{sous_dossier}" in f"/{nom}":
                yield from trouver(json.loads(z.read(nom)), type_)


def trouver(noeud, type_: str):
    """Valeurs de la clé `type_`, à n'importe quelle profondeur, sans descendre dans les objets trouvés."""
    if isinstance(noeud, list):
        for n in noeud:
            yield from trouver(n, type_)
    elif isinstance(noeud, dict):
        for cle, valeur in noeud.items():
            if cle == type_:
                yield from liste(valeur)
            else:
                yield from trouver(valeur, type_)


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


def place(valeur: str | None) -> int | None:
    """Numéro de siège : texte numérique, absent ou vide selon les fichiers."""
    return int(valeur) if valeur and valeur.isdigit() else None
