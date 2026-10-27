"""Lecture d'un échantillon de documents par format, depuis le cache des fichiers bruts
(`data/brut`, rien n'est téléchargé) : membres JSON ou XML d'une archive, enregistrements d'un gros
XML ou JSON, lignes d'un CSV, lignes de chaque table d'un dump PostgreSQL.

Échantillon : membres répartis sur toute l'archive (début, milieu, fin) ; pour un flux (CSV, XML,
dump), tirage aléatoire uniforme à graine fixe (réservoir), après le filtre de période s'il y en a
un. Rend des dictionnaires : un XML devient {balise: …, "@attribut": …, "#texte": …}."""

import io
import json
import random
import re
import tarfile
import zipfile
from pathlib import Path
from typing import Callable, Iterable, Iterator
from xml.etree import ElementTree

from ..adaptateurs.sources.senat.commun import C1_CP1252, encodage_dump, valeur_copy
from ..inventaire.releve import decoder
from .aplatir import texte_html

GRAINE = 17


def repartis(noms: list[str], n: int) -> list[str]:
    """Au plus `n` noms répartis régulièrement sur la liste triée."""
    noms = sorted(noms)
    if len(noms) <= n:
        return noms
    pas = len(noms) / n
    return [noms[int(i * pas)] for i in range(n)]


def reservoir(flux: Iterable, n: int) -> tuple[list, int]:
    """Tirage uniforme de `n` éléments d'un flux ; rend aussi le nombre total vu."""
    hasard, garde, total = random.Random(GRAINE), [], 0
    for x in flux:
        total += 1
        if len(garde) < n:
            garde.append(x)
        else:
            j = hasard.randrange(total)
            if j < n:
                garde[j] = x
    return garde, total


# ---------- XML → dictionnaire ----------

def _local(nom: str) -> str:
    return nom.rsplit("}", 1)[-1]


def element_dict(e: ElementTree.Element):
    """Un élément XML → dict (attributs « @x », enfants par balise, répétés en liste).

    Contenu mixte (du texte entre les balises : `<CONTENU>` de LEGI, paragraphes balisés) : c'est du
    texte, tous ses nœuds texte joints."""
    if len(e) and ((e.text or "").strip() or any((c.tail or "").strip() for c in e)):
        return re.sub(r"\s+", " ", " ".join(e.itertext())).strip()
    d: dict = {f"@{_local(k)}": v for k, v in e.attrib.items()}
    for enfant in e:
        cle, valeur = _local(enfant.tag), element_dict(enfant)
        if cle in d:
            d[cle] = d[cle] if isinstance(d[cle], list) else [d[cle]]
            d[cle].append(valeur)
        else:
            d[cle] = valeur
    if not d:
        return (e.text or "").strip() or None
    return d


def xml_dict(octets: bytes) -> dict:
    racine = ElementTree.fromstring(octets)
    return {_local(racine.tag): element_dict(racine)}


def html_membre(octets: bytes) -> dict:
    """Un document HTML (compte rendu du Sénat, XHTML mal formé) : son texte."""
    return {"texte": texte_html(decoder(octets))}


# ---------- Archives ----------

def membres_zip(chemin: Path, motif: str, n: int, lire: Callable[[bytes], dict]) -> tuple[list[dict], int]:
    with zipfile.ZipFile(chemin) as z:
        noms = [m for m in z.namelist() if re.search(motif, m)]
        return [lire(z.read(m)) for m in repartis(noms, n)], len(noms)


def membres_dossier(dossier: Path, motif: str, n: int, lire: Callable[[bytes], dict]) -> tuple[list[dict], int]:
    noms = [str(p) for p in dossier.iterdir() if re.search(motif, p.name)]
    return [lire(Path(m).read_bytes()) for m in repartis(noms, n)], len(noms)


def membres_tar(chemin: Path, motif: str, n: int, lire: Callable[[bytes], dict]) -> tuple[list[dict], int]:
    with tarfile.open(chemin) as t:
        infos = {i.name: i for i in t.getmembers() if i.isfile() and re.search(motif, i.name)}
        return [lire(t.extractfile(infos[m]).read()) for m in repartis(list(infos), n)], len(infos)


def json_membre(racine: str | None) -> Callable[[bytes], dict]:
    def lire(octets: bytes) -> dict:
        d = json.loads(octets)
        return d.get(racine, d) if racine else d
    return lire


def xml_membre(racine: str | None = None) -> Callable[[bytes], dict]:
    def lire(octets: bytes) -> dict:
        d = xml_dict(octets)
        return next(iter(d.values())) if racine is None else d.get(racine, d)
    return lire


# ---------- Gros fichiers : enregistrements ----------

def enregistrements_xml(chemin: Path, balise: str, n: int) -> tuple[list[dict], int]:
    """Les éléments `balise` d'un gros XML, lus en flux."""
    def flux():
        for _, e in ElementTree.iterparse(chemin, events=("end",)):
            if _local(e.tag) == balise:
                yield element_dict(e)
                e.clear()
    return reservoir(flux(), n)


def enregistrements_json(chemin: Path, cle: str, n: int) -> tuple[list[dict], int]:
    return reservoir(json.loads(chemin.read_bytes())[cle], n)


def lignes_csv(chemin: Path, n: int, filtre: Callable[[dict], bool] | None = None) -> tuple[list[dict], int]:
    import csv
    texte = decoder(chemin.read_bytes())
    # Le Sénat fait précéder ses CSV de la requête SQL qui les a produits, en commentaire « % ».
    while texte.startswith("%"):
        texte = texte.split("\n", 1)[1] if "\n" in texte else ""
    dialecte = csv.Sniffer().sniff(texte[:8192], delimiters=",;\t|")
    lignes = (l for l in csv.DictReader(io.StringIO(texte), dialect=dialecte) if not filtre or filtre(l))
    return reservoir(({k: (v if v != "" else None) for k, v in l.items() if k is not None} for l in lignes), n)


def tables_dump(chemin: Path, membre: str, n: int, filtres: dict[str, Callable[[dict], bool]] | None = None
                ) -> Iterator[tuple[str, list[dict], int]]:
    """Chaque table d'un dump PostgreSQL (blocs COPY), en un seul passage : (table, échantillon, total)."""
    filtres = filtres or {}
    encodage = encodage_dump(chemin, membre)
    with zipfile.ZipFile(chemin) as z, z.open(membre) as f:
        lignes = io.TextIOWrapper(f, encoding=encodage)
        for brut in lignes:
            m = re.match(r"COPY (?:\w+\.)?(\w+) \(([^)]*)\) FROM stdin;", brut)
            if not m:
                continue
            table, colonnes = m.group(1), [c.strip('"') for c in m.group(2).split(", ")]
            filtre = filtres.get(table)

            def bloc():
                for l in lignes:
                    if l.startswith("\\."):
                        return
                    valeurs = [None if v == "\\N" else valeur_copy(v).translate(C1_CP1252) for v in l.rstrip("\n").split("\t")]
                    d = dict(zip(colonnes, valeurs))
                    if not filtre or filtre(d):
                        yield d
            garde, total = reservoir(bloc(), n)
            yield table, garde, total
