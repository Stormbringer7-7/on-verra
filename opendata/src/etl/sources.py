"""Extraction : fichiers bruts téléchargés une fois et gardés en cache (data/brut)."""

import json
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Fichier:
    """Un fichier brut d'une source : nom dans le cache et URL d'origine."""
    nom: str                               # ex. "scrutins_17.json.zip", unique dans le cache
    url: str

    def recuperer(self, cache: Path, forcer: bool = False) -> Path:
        cible = cache / self.nom
        if forcer or not cible.exists():
            cache.mkdir(parents=True, exist_ok=True)
            print(f"Téléchargement {self.url}")
            # Fichier temporaire : un téléchargement interrompu ne laisse pas une archive tronquée en cache.
            partiel = cible.with_name(cible.name + ".partiel")
            urllib.request.urlretrieve(self.url, partiel)
            partiel.replace(cible)
        return cible


def lire_json_zip(chemin: Path, sous_dossier: str = ""):
    """Chaque document JSON d'une archive zip, éventuellement limité à un sous-dossier."""
    with zipfile.ZipFile(chemin) as z:
        for nom in z.namelist():
            if nom.endswith(".json") and f"/{sous_dossier}" in f"/{nom}":
                yield json.loads(z.read(nom))
