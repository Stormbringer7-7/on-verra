"""Particularités de data.senat.fr : dumps PostgreSQL et CSV précédés de leur requête SQL."""

import csv
import io
import json
import re
import zipfile
from datetime import date
from pathlib import Path
from typing import Iterator

from ....chargement import Document
from ....domaine import IdentiteNative, Systeme
from ....etl import Fichier

LICENCE = "Licence Ouverte / Etalab 2.0"
DONNEES = "https://data.senat.fr/data"


def senat(type_source: str, id_: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.SENAT, type_source, id_) if id_ else None


def lignes_csv(chemin: Path) -> list[dict]:
    """CSV du Sénat : cp1252, 15 à 20 lignes « % » (la requête SQL) avant l'en-tête."""
    texte = chemin.read_bytes().decode("cp1252")
    while texte.startswith("%"):
        texte = texte.split("\n", 1)[1]
    return list(csv.DictReader(io.StringIO(texte)))


def jour(x: str | None) -> date | None:
    """« 1983-10-03 00:00:00.0 » -> date."""
    return date.fromisoformat(x[:10]) if x and x != "\\N" else None


ENCODAGES = {"LATIN1": "latin-1", "UTF8": "utf-8", "WIN1252": "cp1252"}


# Caractères de contrôle C1 (U+0080 à U+009F) : la base du Sénat stocke tels quels des octets
# Windows-1252 (« \x92 » pour l'apostrophe typographique). On restitue le caractère voulu ; les
# cinq positions non définies en cp1252 restent inchangées.
C1_CP1252 = {c: bytes([c]).decode("cp1252") for c in range(0x80, 0xA0) if c not in (0x81, 0x8D, 0x8F, 0x90, 0x9D)}


def encodage_dump(chemin: Path, membre: str) -> str:
    """Encodage déclaré par le dump (`SET client_encoding = 'LATIN1'` pour AMELI, UTF8 pour DOSLEG)."""
    with zipfile.ZipFile(chemin) as z, z.open(membre) as f:
        m = re.search(rb"client_encoding = '(\w+)'", f.read(8192))
    return ENCODAGES.get(m.group(1).decode(), "utf-8") if m else "utf-8"


# Format texte de COPY (documentation PostgreSQL, « COPY … File Formats ») : dans une valeur, la
# barre oblique inverse échappe les caractères de contrôle (« \r\n » pour un retour chariot suivi
# d'un saut de ligne, très fréquent dans les dispositifs AMELI), elle-même (« \\ ») et, en octal
# ou hexadécimal, un octet (lu dans l'encodage du dump) ; devant tout autre caractère, elle est
# simplement ôtée. Décodage en un seul passage : « \\n » est une barre oblique suivie de « n ».
ECHAPPEMENT_COPY = re.compile(r"\\(?:([0-7]{1,3})|x([0-9A-Fa-f]{1,2})|(.))", re.S)
CONTROLES_COPY = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}


def valeur_copy(v: str) -> str:
    """Valeur d'une ligne COPY (hors « \\N ») -> texte : « 22</p>\\r\\n<p> » -> « 22</p>␍␊<p> »
    (␍␊ : un vrai retour chariot et un vrai saut de ligne)."""
    def decoder(m):
        octal, hexa, autre = m.groups()
        if octal or hexa:
            return chr(int(octal, 8) if octal else int(hexa, 16))
        return CONTROLES_COPY.get(autre, autre)
    return ECHAPPEMENT_COPY.sub(decoder, v) if "\\" in v else v


def table_dump(chemin: Path, membre: str, table: str) -> Iterator[dict]:
    """Lignes d'une table d'un dump PostgreSQL (bloc COPY … FROM stdin), valeurs texte, \\N = None."""
    encodage = encodage_dump(chemin, membre)
    with zipfile.ZipFile(chemin) as z, z.open(membre) as f:
        colonnes = None
        for brut in io.TextIOWrapper(f, encoding=encodage):
            if colonnes is None:
                m = re.match(rf"COPY (?:\w+\.)?{table} \(([^)]*)\) FROM stdin;", brut)
                if m:
                    colonnes = m.group(1).split(", ")
                continue
            if brut.startswith("\\."):
                return
            valeurs = [None if v == "\\N" else valeur_copy(v).translate(C1_CP1252)
                       for v in brut.rstrip("\n").split("\t")]
            yield dict(zip(colonnes, valeurs))


def document_ligne(f: Fichier, table: str, cle: str, ligne: dict) -> Document:
    """Une ligne de CSV ou de table comme document brut : son empreinte suit ses valeurs."""
    return Document(f, f"{table}/{cle}", json.dumps(ligne, sort_keys=True, ensure_ascii=False).encode(), cle, ligne)
