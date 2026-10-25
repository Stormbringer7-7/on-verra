"""Particularités de l'open data de l'Assemblée nationale communes aux flux canoniques."""

import json
import re
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Iterator

from ....chargement import Document
from ....domaine import IdentiteNative, Systeme
from ....etl import Fichier

LICENCE = "Licence Ouverte / Etalab 2.0"
DEPOT = "https://data.assemblee-nationale.fr/static/openData/repository/{leg}"
DOCUMENT = "https://www.assemblee-nationale.fr/dyn/opendata"
SITE = "https://www.assemblee-nationale.fr/dyn"


def url_compte_rendu(uid: str | None) -> str | None:
    """Page publique d'un compte rendu cité par l'AN. Séance (`CRSAN…`) : publiée en XML seulement
    sous `dyn/opendata` (le `.html` y répond 404) ; la page lisible est `dyn/<leg>/comptes-rendus/
    seance/<uid>`, qui redirige vers l'adresse datée et porte les ancres `id_syceron` des
    interventions. Commission (`CRC…`) : `dyn/opendata/<uid>.html`. Sénat (`CRSSN…`, cité par
    l'agenda) : l'AN ne l'héberge pas (500), aucune adresse n'est supposée."""
    if not uid:
        return None
    if uid.startswith("CRSAN"):
        legislature = re.search(r"L(\d+)", uid)
        return f"{SITE}/{legislature.group(1) if legislature else '17'}/comptes-rendus/seance/{uid}"
    if uid.startswith("CRC"):
        return f"{DOCUMENT}/{uid}.html"
    return None


def fichier(nom: str, chemin: str, legislature: str = "17") -> Fichier:
    return Fichier(nom, f"{DEPOT.format(leg=legislature)}/{chemin}")


def an(type_source: str, uid: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.AN, type_source, uid) if uid else None


def documents(f: Fichier, chemin: Path, sous_dossier: str = "") -> Iterator[Document]:
    """Chaque JSON ou XML de l'archive (éventuellement d'un sous-dossier), dans l'ordre des noms."""
    with zipfile.ZipFile(chemin) as z:
        for nom in sorted(z.namelist()):
            if nom.endswith((".json", ".xml")) and f"/{sous_dossier}" in f"/{nom}":
                yield Document(f, nom, z.read(nom), nom.rsplit("/", 1)[-1].rsplit(".", 1)[0])


def lire(doc: Document) -> dict:
    return json.loads(doc.octets)


def val(x):
    """Valeur scalaire du JSON de l'AN : `{"@xsi:nil": "true"}` vaut None, `{"#text": v}` vaut v."""
    if isinstance(x, dict):
        if x.get("@xsi:nil") == "true":
            return None
        if "#text" in x:
            return x["#text"]
    return x


def liste(x) -> list:
    """L'AN met un objet seul quand il n'y a qu'un élément, une liste sinon."""
    x = val(x)
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def jour(x) -> date | None:
    """Date (« 2026-03-12 », « 2026-03-12T00:00:00.000+01:00 », « 2025-11-07+01:00 »)."""
    x = val(x)
    return date.fromisoformat(x[:10]) if x else None


def instant(x) -> datetime | None:
    x = val(x)
    if not x:
        return None
    if x.isdigit() and len(x) >= 14:            # Syceron : 20241106140000000
        return datetime.strptime(x[:14], "%Y%m%d%H%M%S")
    return datetime.fromisoformat(x)
