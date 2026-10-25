"""Ports du pipeline CivicTrace : ce dont le code métier a besoin, sans dire comment c'est fait.

Les adaptateurs (Postgres, mémoire, disque, LLM…) vivent dans `adaptateurs/` et sont choisis
dans `compilation.py`, seul endroit qui les assemble.
"""

import uuid
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Iterable, Protocol

from .domaine import Affirmation, Correspondance, EnregistrementSource, IdentiteNative, Provenance


class ArchiveBrute(Protocol):
    """Fichiers bruts tels que téléchargés, adressés par leur empreinte, jamais modifiés."""

    def deposer(self, fichier: Path) -> str:
        """Range une copie du fichier ; retourne son sha256."""

    def ouvrir(self, empreinte: str) -> Path: ...


class Entrepot(Protocol):
    """Persistance des enregistrements bruts, entités, correspondances et affirmations.

    Ne contient aucune règle de rapprochement : elles vivent dans `identites.RegistreIdentites`
    et s'appliquent donc à l'identique quel que soit l'adaptateur.
    """

    def transaction(self) -> AbstractContextManager: ...

    def enregistrer_source(self, enregistrement: EnregistrementSource) -> tuple[uuid.UUID, bool]:
        """Identifiant de l'enregistrement ; `True` s'il est nouveau (empreinte jamais vue)."""

    def creer_entite(self, type_entite: str) -> uuid.UUID: ...

    def ecrire(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        """Écrit les colonnes données (les autres restent telles quelles ; les colonnes obligatoires
        sont toujours fournies). L'ancienne ligne est historisée si une valeur connue est remplacée."""

    def lire(self, type_entite: str, entite_id: uuid.UUID) -> dict | None: ...

    def remplacer_dependants(self, table: str, parent: dict, lignes: list[dict], provenance: Provenance):
        """Faits sans identité propre (votes, liens, avis, présences…) rattachés à un parent :
        les lignes existantes pour `parent` (ex. {"scrutin_id": …}) sont remplacées en bloc par
        `lignes`, chacune complétée du parent et de `source_id`."""

    def dependants(self, table: str, parent: dict) -> list[dict]: ...

    def correspondances(self, identite: IdentiteNative) -> list[Correspondance]: ...

    def correspondances_de(self, entite_id: uuid.UUID) -> list[Correspondance]: ...

    def verifiees(self) -> Iterable[tuple[IdentiteNative, uuid.UUID]]:
        """Toutes les correspondances certaines : (identité native, entité)."""

    def ajouter_correspondance(self, correspondance: Correspondance): ...

    def reviser_correspondance(self, correspondance: Correspondance):
        """Met à jour statut et audit d'une correspondance existante (même `id`)."""

    def a_revoir(self) -> Iterable[Correspondance]: ...

    def compter_correspondances(self) -> list[tuple[str, str, str, str, int]]:
        """(système, type d'objet, méthode, statut, nombre), pour le rapport de revue."""

    def ajouter_affirmation(self, affirmation: Affirmation): ...

    def corriger(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        """Modifie des colonnes d'une ligne existante (application d'une décision de revue)."""

    def retirer_absents(self, type_entite: str, champ: str, parent_id: uuid.UUID, presents: set[uuid.UUID]) -> int:
        """Marque retirées de la source les entités de ce type dont `champ` vaut `parent_id` et
        qui ne sont pas dans `presents` ; « dé-retire » celles qui y sont (sauf une entité
        fusionnée, retirée pour de bon). Jamais de suppression."""

    def retirees(self, type_entite: str) -> set[uuid.UUID]: ...

    def fusionner(self, type_entite: str, absorbee: uuid.UUID, absorbante: uuid.UUID, preuve: dict) -> dict | None:
        """Fusionne `absorbee` dans `absorbante` (décision de revue : `preuve["cas"]`), dans une transaction.

        Toutes les références vers l'absorbée (clés étrangères vers `canon.entite` et vers la table du
        type, dépendants et `canon.lien` compris, cibles et candidats des cas de revue) passent à
        l'absorbante ; un fait dépendant qui y existe déjà est historisé puis retiré. Les valeurs de
        l'absorbante gagnent : un champ vide y est complété, une valeur différente est consignée dans
        `conflits`, jamais tranchée. L'absorbée est gardée, marquée (`fusionnee_dans`, retirée) ; la
        fusion est enregistrée. Déjà faite : None. Les identités natives sont reportées par
        `RegistreIdentites.fusionner`, seul à écrire des correspondances.
        Retourne {"references": {table.colonne: n}, "doublons": n, "completees": [...], "conflits": {...}}."""

    def fusionnee_dans(self, entite_id: uuid.UUID) -> uuid.UUID | None:
        """Entité dans laquelle celle-ci a été fusionnée, sinon None."""

    # Revue humaine (cf. docs/rapprochements.md) -----------------------------------------------
    def signaler(self, cas: dict) -> dict:
        """Consigne un cas (clé stable) : candidats et contexte mis à jour, décision conservée.
        Retourne l'enregistrement (avec `statut` et `decision`)."""

    def cas_revue(self, type_: str | None = None, statut: str | None = None) -> list[dict]: ...

    def decider(self, cle: str, decision: dict, par: str): ...

    def marquer_applique(self, cle: str): ...

    def classer_caducs(self, prefixe: str, presents: set[str]) -> int:
        """Cas `A_REVOIR` dont la clé commence par `prefixe`, absents de `presents` : `CADUC`.
        Un cas caduc qui réapparaît repasse `A_REVOIR` ; un cas décidé n'est jamais touché."""

    def controles(self) -> list[dict]:
        """Invariants « données 100 % fiables » : [{nom, bloquant, explication, nombre, exemples}]."""


class Synthetiseur(Protocol):
    """Rédige un « en clair » à partir de passages sourcés. `None` : pas de synthèse disponible.

    Aucun LLM n'est branché pour l'instant (adaptateur `SansSynthese`). Une synthèse produite
    est une `Affirmation` à relire, jamais un fait.
    """

    def synthese(self, sujet_type: str, sujet_id: uuid.UUID, passages: list[tuple[str, Provenance]]
                 ) -> Affirmation | None: ...


class Projecteur(Protocol):
    """Construit les projections de lecture (indicateurs contextualisés) depuis `canon` seul."""

    def projeter(self) -> dict[str, int]:
        """Reconstruit toutes les projections ; retourne le nombre de lignes par table."""
