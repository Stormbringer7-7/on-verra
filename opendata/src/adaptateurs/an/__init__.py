"""Adaptateur Assemblée nationale : open data de data.assemblee-nationale.fr.

Un module par flux de l'AN ; chacun expose son `ETAPE`. Les noms d'étapes sont préfixés "an.".
"""

from . import acteurs, dossiers, lois, scrutins

LEGISLATURES = ["14", "15", "16", "17"]
ETAPES = [acteurs.ETAPE, dossiers.ETAPE, scrutins.ETAPE, lois.ETAPE]
