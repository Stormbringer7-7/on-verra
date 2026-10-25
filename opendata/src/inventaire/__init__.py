"""Inventaire des sources (phase 0) : télécharge un échantillon de chaque jeu et relève sa structure.

Sert à écrire les fiches de `docs/sources/` : chemins réellement présents, identifiants natifs,
références croisées observées. Ne charge rien dans une base.

python -m src inventaire <source>|tout
"""

from .catalogue import SOURCES
from .releve import inventorier

__all__ = ["SOURCES", "inventorier"]
