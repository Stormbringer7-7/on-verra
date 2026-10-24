"""Ce que produit un adaptateur de source, sans connaître le stockage.

Les références entre objets sont des `IdentiteNative` : c'est le chargement qui les résout en
UUID via le registre. Une référence inconnue reste vide (et comptée dans le bilan) : un lien
n'est jamais supposé.
"""

from dataclasses import dataclass, field

from .identite import IdentiteNative


@dataclass(frozen=True)
class Objet:
    """Une entité de la source : son type canonique, son identité native et ses valeurs."""
    type: str                                  # table de canon : personne, reunion, intervention…
    identite: IdentiteNative
    valeurs: dict                              # une valeur IdentiteNative est une référence
    pointeur: str = ""                         # où, dans le document brut
    url: str | None = None


@dataclass(frozen=True)
class Dependants:
    """Faits sans identité propre rattachés à un objet, remplacés en bloc à chaque lecture."""
    table: str                                 # lien, participation, audition, vote…
    parent: dict                               # ex. {"reunion_id": IdentiteNative(...)}
    lignes: list[dict] = field(default_factory=list)
    pointeur: str = ""
    requis: tuple[str, ...] = ()               # références sans lesquelles une ligne est écartée


@dataclass(frozen=True)
class Candidat:
    type: str
    identite: IdentiteNative
    libelle: str = ""
    indices: dict = field(default_factory=dict)  # ce qui le rend plausible : jamais une preuve


@dataclass(frozen=True)
class CasRevue:
    """Un rapprochement que le code ne tranche pas : il est consigné pour une décision humaine.

    - nature « champ » : choisir un candidat renseigne `champ` sur chaque cible ;
    - nature « identite » : choisir un candidat relie l'identité du sujet à cette entité ;
    - nature « constat » : rien à choisir, le problème est constaté (référence absente…).
    `cle` est stable d'un chargement à l'autre : la décision prise survit aux rechargements.
    """
    type: str
    cle: str
    nature: str
    constat: str
    sujet: tuple[str, IdentiteNative] | None = None
    champ: str | None = None
    cibles: tuple[tuple[str, IdentiteNative], ...] = ()
    candidats: tuple[Candidat, ...] = ()
    contexte: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Rapprochement:
    """Une source cite l'identifiant d'une autre : correspondance à faire passer par le registre."""
    type: str
    connue: IdentiteNative                     # identité déjà reliée à l'entité
    autre: IdentiteNative                      # identité de l'autre source
    methode: str
    preuve: dict
    url: str | None = None


@dataclass(frozen=True)
class Ensemble:
    """Ce qu'un document publie, au complet : les entités de `type` dont `champ` vaut `parent`.

    Relire un document qui a changé (ou une règle de lecture corrigée) peut faire disparaître
    des entités qu'il donnait avant : elles sont marquées retirées de la source, jamais
    supprimées. Les cas de revue dont la clé commence par `cas_prefixe` et que cette lecture n'a
    pas émis deviennent caducs (ils n'ont plus d'objet) ; une décision prise est conservée.
    Plusieurs préfixes possibles (un par type de cas que le document émet).
    """
    type: str
    champ: str
    parent: IdentiteNative
    identites: tuple[IdentiteNative, ...]
    cas_prefixes: tuple[str, ...] = ()
    cas: tuple[str, ...] = ()
