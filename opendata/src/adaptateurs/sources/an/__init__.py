"""Assemblée nationale, modèle canonique : un module par flux, assemblés en étapes.
Noms d'étapes préfixés « an. » comme dans l'ancien adaptateur, mais dans le pipeline canonique."""

from . import acteurs, commissions, questions, textes, travaux

ETAPES = [acteurs.ETAPE, travaux.ETAPE, commissions.ETAPE, textes.ETAPE, questions.ETAPE]
