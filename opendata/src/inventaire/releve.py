"""Relevé de structure d'un fichier brut : chaque chemin (clé JSON, élément XML, colonne CSV,
table d'un dump SQL), combien de fois il apparaît, ses types et quelques valeurs d'exemple.

Les archives volumineuses sont échantillonnées (`MEMBRES_MAX` documents répartis sur toute
l'archive) : le relevé décrit la forme des données, pas leur exhaustivité.
"""

import csv
import hashlib
import io
import json
import re
import tarfile
import time
import zipfile
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

MEMBRES_MAX = 400                  # documents lus par archive
LIGNES_CSV_MAX = 20000
EXEMPLES_MAX = 3
LONGUEUR_EXEMPLE = 100
# Feuilles qui ressemblent à un identifiant ou à une référence vers un autre objet.
IDENTIFIANT = re.compile(r"(^|[_/@.-])(uid|id|ref|nor|cid|numero|num|matricule|code|url|lien|siren)"
                         r"|Ref$|Id$|Uid$|ID$|_id$|_ref$|^id[A-Z_]", re.I)


class Releve:
    def __init__(self):
        self.chemins = defaultdict(lambda: {"n": 0, "types": set(), "exemples": []})

    def noter(self, chemin: str, valeur=None, type_: str | None = None):
        c = self.chemins[chemin]
        c["n"] += 1
        c["types"].add(type_ or type(valeur).__name__)
        if valeur not in (None, "") and not isinstance(valeur, (dict, list)) and len(c["exemples"]) < EXEMPLES_MAX:
            texte = str(valeur).strip()[:LONGUEUR_EXEMPLE]
            if texte and texte not in c["exemples"]:
                c["exemples"].append(texte)

    # JSON -----------------------------------------------------------------------------------
    def json(self, noeud, chemin=""):
        if isinstance(noeud, dict):
            self.noter(chemin or "/", type_="objet")
            for cle, valeur in noeud.items():
                self.json(valeur, f"{chemin}/{cle}")
        elif isinstance(noeud, list):
            self.noter(chemin or "/", type_="liste")
            for n in noeud[:50]:       # les listes du JSON sont homogènes : 50 éléments suffisent
                self.json(n, f"{chemin}[]")
        else:
            self.noter(chemin, noeud)

    # XML ------------------------------------------------------------------------------------
    def xml(self, flux):
        pile = []
        for evenement, elem in ElementTree.iterparse(flux, events=("start", "end")):
            balise = elem.tag.rsplit("}", 1)[-1]
            if evenement == "start":
                pile.append(balise)
                chemin = "/" + "/".join(pile)
                for attribut, valeur in elem.attrib.items():
                    self.noter(f"{chemin}@{attribut.rsplit('}', 1)[-1]}", valeur, "attribut")
                continue
            chemin = "/" + "/".join(pile)
            texte = (elem.text or "").strip()
            self.noter(chemin, texte or None, "texte" if texte else "element")
            pile.pop()
            elem.clear()

    # CSV ------------------------------------------------------------------------------------
    def csv(self, octets: bytes):
        texte = decoder(octets)
        # Le Sénat fait précéder ses CSV de la requête SQL qui les a produits, en commentaire « % ».
        while texte.startswith("%"):
            texte = texte.split("\n", 1)[1] if "\n" in texte else ""
        dialecte = csv.Sniffer().sniff(texte[:8192], delimiters=",;\t|")
        lecteur = csv.DictReader(io.StringIO(texte), dialect=dialecte)
        for i, ligne in enumerate(lecteur):
            if i >= LIGNES_CSV_MAX:
                break
            for colonne, valeur in ligne.items():
                self.noter(f"/{colonne}", valeur or None, "texte" if valeur else "vide")

    # HTML (documents de l'AN) ---------------------------------------------------------------
    def html(self, octets: bytes):
        """Balises de contenu et leurs classes : c'est sur elles que se fait le découpage."""
        releve = self

        class Lecteur(HTMLParser):
            pile = []

            def handle_starttag(self, balise, attributs):
                classe = dict(attributs).get("class")
                self.pile.append(f"{balise}.{classe}" if classe else balise)

            def handle_endtag(self, balise):
                if self.pile:
                    self.pile.pop()

            def handle_data(self, texte):
                if self.pile and self.pile[-1].split(".")[0] in ("p", "span", "h1", "h2", "h3", "h4", "b", "td"):
                    releve.noter(f"/{self.pile[-1]}", texte.strip() or None, "texte")

        Lecteur().feed(decoder(octets))

    # Dump SQL (Sénat) -----------------------------------------------------------------------
    def sql(self, flux):
        """Tables et colonnes des CREATE TABLE ; nombre de lignes des blocs COPY."""
        table, copie = None, None
        for brut in flux:
            ligne = brut.decode("utf-8", "replace")
            if copie:
                if ligne.startswith("\\."):
                    copie = None
                else:
                    self.noter(f"/{copie}", type_="ligne")
                continue
            m = re.match(r"CREATE TABLE (?:\w+\.)?(\w+)", ligne)
            if m:
                table = m.group(1)
                continue
            if table:
                if ligne.startswith(")"):
                    table = None
                else:
                    c = re.match(r"\s+\"?(\w+)\"?\s+([^,]+)", ligne)
                    if c and c.group(1).upper() not in ("CONSTRAINT", "PRIMARY", "UNIQUE"):
                        self.noter(f"/{table}/{c.group(1)}", c.group(2).strip(), "colonne")
                continue
            m = re.match(r"COPY (?:\w+\.)?(\w+)", ligne)
            if m:
                copie = m.group(1)

    def resultat(self) -> dict:
        chemins = {c: {"n": v["n"], "types": sorted(v["types"]), "exemples": v["exemples"]}
                   for c, v in sorted(self.chemins.items())}
        identifiants = [c for c in chemins if IDENTIFIANT.search(re.split(r"[/@]", c)[-1] or "")]
        return {"chemins": chemins, "identifiants": identifiants}


def decoder(octets: bytes) -> str:
    for encodage in ("utf-8-sig", "cp1252"):
        try:
            return octets.decode(encodage)
        except UnicodeDecodeError:
            pass
    return octets.decode("latin-1")


def echantillon(noms: list[str]) -> list[str]:
    """Au plus MEMBRES_MAX noms répartis régulièrement : début, milieu et fin de l'archive."""
    if len(noms) <= MEMBRES_MAX:
        return noms
    pas = len(noms) / MEMBRES_MAX
    return [noms[int(i * pas)] for i in range(MEMBRES_MAX)]


def lire_membre(releve: Releve, nom: str, ouvrir):
    if nom.endswith(".json"):
        with ouvrir() as f:
            releve.json(json.load(f))
    elif nom.endswith(".xml"):
        with ouvrir() as f:
            releve.xml(f)
    elif nom.endswith(".csv"):
        with ouvrir() as f:
            releve.csv(f.read())
    elif nom.endswith(".html"):
        with ouvrir() as f:
            releve.html(f.read())
    elif nom.endswith(".sql"):
        with ouvrir() as f:
            releve.sql(f)


def relever(chemin: Path) -> dict:
    releve, membres, lus = Releve(), [], []
    nom = chemin.name
    if zipfile.is_zipfile(chemin):
        with zipfile.ZipFile(chemin) as z:
            membres = [n for n in z.namelist() if not n.endswith("/")]
            lus = echantillon([n for n in membres if n.rsplit(".", 1)[-1] in ("json", "xml", "csv", "sql", "html")])
            for n in lus:
                lire_membre(releve, n, lambda n=n: z.open(n))
    elif nom.endswith(".tar.gz"):
        with tarfile.open(chemin) as t:
            infos = [i for i in t.getmembers() if i.isfile()]
            membres = [i.name for i in infos]
            choisis = set(echantillon([i.name for i in infos if i.name.endswith(".xml")]))
            for i in infos:
                if i.name in choisis:
                    lus.append(i.name)
                    lire_membre(releve, i.name, lambda i=i: t.extractfile(i))
    else:
        membres = lus = [nom]
        lire_membre(releve, nom, lambda: open(chemin, "rb"))
    return {"membres_total": len(membres), "membres_lus": len(lus),
            "exemples_membres": membres[:10], **releve.resultat()}


def empreinte(chemin: Path) -> str:
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def inventorier(nom: str, source, cache: Path, sortie: Path, forcer: bool = False) -> Path:
    """Télécharge les fichiers de la source dans `cache/<nom>/`, écrit `sortie/<nom>.json`."""
    fichiers = []
    for f in source.tous():
        chemin = f.recuperer(cache / nom, forcer)
        print(f"Relevé {chemin.name}")
        debut = time.time()
        fichiers.append({"nom": f.nom, "url": f.url, "taille": chemin.stat().st_size,
                         "sha256": empreinte(chemin),
                         "modifie_le": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(chemin.stat().st_mtime)),
                         **relever(chemin), "duree_s": round(time.time() - debut, 1)})
    sortie.mkdir(parents=True, exist_ok=True)
    cible = sortie / f"{nom}.json"
    cible.write_text(json.dumps({"source": nom, "licence": source.licence,
                                 "documentation": source.documentation, "fichiers": fichiers},
                                ensure_ascii=False, indent=1))
    return cible

