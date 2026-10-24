"""Analyse : ce qui n'est pas un fait publié par une source.

Une affirmation (synthèse, rapprochement lobbying ↔ dossier, attribution d'un changement
d'article à un amendement) porte sa méthode, ses preuves et son statut de vérification. Elle
n'est jamais présentée comme un fait officiel.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from .identite import Provenance


class TypeAffirmation:
    FAIT = "FACT"
    SYNTHESE = "SUMMARY"
    INFERENCE = "INFERENCE"


class Verification:
    GENERE = "GENERE"                          # produit par une machine, non relu
    A_VERIFIER = "NEEDS_REVIEW"
    RELU = "RELU"                              # validé par une personne : exposable
    REJETE = "REJETE"


@dataclass
class Affirmation:
    sujet_type: str
    sujet_id: uuid.UUID
    predicat: str                              # ex. "synthese", "concerne_dossier", "modifie_par"
    objet: dict
    type: str
    methode: str                               # RULE, HUMAN, LLM
    preuves: list[Provenance]
    verification: str = Verification.A_VERIFIER
    modele: str | None = None                  # LLM seulement : modèle et version du prompt
    version_prompt: str | None = None
    cree_le: datetime = field(default_factory=datetime.now)
    id: uuid.UUID = field(default_factory=uuid.uuid4)

    def __post_init__(self):
        if not self.preuves:
            raise ValueError("une affirmation cite au moins une source")
