"""Domaine CivicTrace : objets métier sans aucune entrée-sortie.

Les adaptateurs de sources produisent ces objets ; les adaptateurs de stockage les persistent.
Ni les uns ni les autres ne sont importés ici.
"""

from .analyse import Affirmation, TypeAffirmation, Verification
from .identite import (Correspondance, EnregistrementSource, IdentiteNative, Methode, Provenance,
                       Statut, Systeme)

__all__ = ["Affirmation", "Correspondance", "EnregistrementSource", "IdentiteNative", "Methode",
           "Provenance", "Statut", "Systeme", "TypeAffirmation", "Verification"]
