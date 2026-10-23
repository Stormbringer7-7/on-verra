"""Extraction : fichiers bruts téléchargés une fois et gardés en cache (data/brut)."""

import json
import os
import shutil
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from email.utils import formatdate
from pathlib import Path


@dataclass(frozen=True)
class Fichier:
    """Un fichier brut d'une source : nom dans le cache et URL d'origine."""
    nom: str                               # ex. "scrutins_17.json.zip", unique dans le cache
    url: str

    def recuperer(self, cache: Path, forcer: bool = False, age_max: float | None = None) -> Path:
        """Fichier en cache ; re-téléchargé si `forcer`, ou s'il a plus de `age_max` secondes
        et que le site de l'Assemblée annonce une version plus récente (If-Modified-Since)."""
        cible = cache / self.nom
        if cible.exists() and not forcer:
            if age_max is None or time.time() - cible.stat().st_mtime < age_max:
                return cible
        cache.mkdir(parents=True, exist_ok=True)
        requete = urllib.request.Request(self.url)
        if cible.exists() and not forcer:
            requete.add_header("If-Modified-Since", formatdate(cible.stat().st_mtime, usegmt=True))
        try:
            reponse = urllib.request.urlopen(requete, timeout=300)
        except urllib.error.HTTPError as e:
            if e.code != 304:
                raise
            print(f"Inchangé {self.url}")
            os.utime(cible)                # vérifié à l'instant : pas de nouvelle requête avant age_max
            return cible
        print(f"Téléchargement {self.url}")
        # Fichier temporaire : un téléchargement interrompu ne laisse pas une archive tronquée en cache.
        partiel = cible.with_name(cible.name + ".partiel")
        with reponse, open(partiel, "wb") as f:
            shutil.copyfileobj(reponse, f)
        partiel.replace(cible)
        return cible


def lire_json_zip(chemin: Path, sous_dossier: str = ""):
    """Chaque document JSON d'une archive zip, éventuellement limité à un sous-dossier."""
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            if nom.endswith(".json") and f"/{sous_dossier}" in f"/{nom}":
                yield json.loads(z.read(nom))
