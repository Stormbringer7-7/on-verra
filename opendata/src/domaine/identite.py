"""Identités : clé interne stable, identifiants natifs des sources et correspondances entre eux.

Règle d'or : un identifiant interne (UUID) par entité, tous les identifiants natifs conservés
tels quels, et une correspondance explicite, sourcée et auditée entre les deux. Deux entités ne
sont jamais reliées parce que leurs noms se ressemblent : un tel rapprochement reste proposé.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime


class Systeme:
    """Producteurs de données ; la valeur est stockée telle quelle."""
    AN = "AN"
    SENAT = "SENAT"
    LEGIFRANCE = "LEGIFRANCE"
    CONSTIT = "CONSTIT"
    HATVP = "HATVP"
    RNE = "RNE"
    INSEE = "INSEE"
    # Identités dérivées de références officielles (ex. suivi d'un article : clé officielle du
    # dossier + numéro officiel de l'article dans la navette). Règle de dérivation documentée.
    CIVICTRACE = "CIVICTRACE"


class Methode:
    """Comment une correspondance a été établie, de la plus sûre à la moins sûre."""
    OFFICIAL_ID = "OFFICIAL_ID"                # identifiant natif lu dans la source elle-même
    EXPLICIT_REFERENCE = "EXPLICIT_REFERENCE"  # une source cite l'identifiant de l'autre
    MANUAL = "MANUAL"                          # validation humaine sur plusieurs attributs publics
    NAME_DATE = "NAME_DATE"                    # nom + dates de fonction : indice, jamais preuve

    SURES = (OFFICIAL_ID, EXPLICIT_REFERENCE, MANUAL)


class Statut:
    PROPOSED = "PROPOSED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


@dataclass(frozen=True)
class IdentiteNative:
    """Identifiant exact d'un objet dans sa source, toujours une chaîne (zéros de tête compris)."""
    systeme: str
    type_source: str                           # ex. "acteur", "dossierParlementaire", "declarant"
    id_source: str

    def __post_init__(self):
        if not isinstance(self.id_source, str) or not self.id_source:
            raise ValueError(f"identifiant source vide ou non textuel : {self.id_source!r}")

    def __str__(self):
        return f"{self.systeme}:{self.type_source}:{self.id_source}"


@dataclass(frozen=True)
class Provenance:
    """D'où vient un fait : l'enregistrement brut et, si possible, le passage précis."""
    source_id: uuid.UUID                       # brut.enregistrement_source
    pointeur: str | None = None                # JSON pointer, XPath ou ancre du compte rendu
    url: str | None = None


@dataclass(frozen=True)
class EnregistrementSource:
    """Un document brut tel que reçu : ajout seul, une nouvelle version par empreinte nouvelle."""
    systeme: str
    fichier: str                               # nom dans l'archive brute
    chemin: str                                # membre de l'archive (ou "" pour un fichier simple)
    empreinte: str                             # sha256 du contenu
    id_source: str | None = None
    url: str | None = None
    licence: str | None = None
    recupere_le: datetime | None = None
    charge_utile: dict | None = None


@dataclass
class Correspondance:
    """Lien entre une identité native et une entité interne, avec sa preuve et son audit."""
    type_entite: str
    entite_id: uuid.UUID
    identite: IdentiteNative
    methode: str
    statut: str
    preuve: dict = field(default_factory=dict)
    url: str | None = None
    valide_du: date | None = None
    valide_au: date | None = None
    revu_par: str | None = None
    revu_le: datetime | None = None
    id: uuid.UUID = field(default_factory=uuid.uuid4)

    @property
    def certaine(self) -> bool:
        return self.statut == Statut.VERIFIED
