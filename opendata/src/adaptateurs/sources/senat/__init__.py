"""Sénat, modèle canonique : sénateurs, dossiers (DOSLEG), amendements et scrutins, débats en séance,
agenda de la séance publique."""

from . import agenda, debats, dossiers, senateurs, textes, travaux

ETAPES = [senateurs.ETAPE, dossiers.ETAPE, travaux.ETAPE, textes.ETAPE, debats.ETAPE, agenda.ETAPE]
