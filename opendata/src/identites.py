"""Registre des identités : règles de résolution et de rapprochement, communes à tout stockage.

- un identifiant officiel lu dans la source donne toujours la même entité (VERIFIED) ;
- une référence explicite d'une source vers une autre est VERIFIED, sauf si l'identité est déjà
  reliée de façon certaine à une autre entité : le conflit part en revue, rien n'est écrasé ;
- un rapprochement par nom et dates n'est qu'une proposition (NEEDS_REVIEW) ;
- une révision ajoute un audit, elle ne supprime jamais une correspondance ;
- une fusion d'entités (décision de revue seulement) reporte les identités de l'absorbée sur
  l'absorbante : `MANUAL` avec la preuve du cas, les anciennes rejetées, rien de supprimé.

Les correspondances certaines sont gardées en mémoire (chargées une fois, puis tenues à jour par
le registre, seul à les écrire) : une résolution ne coûte pas de requête.
"""

import uuid
from contextlib import contextmanager
from datetime import datetime

from .domaine import Correspondance, IdentiteNative, Methode, Statut
from .ports import Entrepot


class RegistreIdentites:
    def __init__(self, entrepot: Entrepot):
        self.entrepot = entrepot
        self._certaines: dict[IdentiteNative, uuid.UUID] | None = None

    @contextmanager
    def transaction(self):
        """Transaction de l'entrepot ; le cache est oublié si elle échoue."""
        try:
            with self.entrepot.transaction():
                yield self
        except BaseException:
            self._certaines = None
            raise

    def certaines(self) -> dict[IdentiteNative, uuid.UUID]:
        if self._certaines is None:
            self._certaines = dict(self.entrepot.verifiees())
        return self._certaines

    def resoudre(self, identite: IdentiteNative) -> uuid.UUID | None:
        """Entité reliée de façon certaine à cette identité, sinon None."""
        return self.certaines().get(identite)

    def identifier(self, type_entite: str, identite: IdentiteNative, url: str | None = None) -> uuid.UUID:
        """Entité de la source elle-même, créée à la première rencontre de son identifiant."""
        existante = self.resoudre(identite)
        if existante:
            return existante
        entite_id = self.entrepot.creer_entite(type_entite)
        self.entrepot.ajouter_correspondance(Correspondance(
            type_entite, entite_id, identite, Methode.OFFICIAL_ID, Statut.VERIFIED, url=url))
        self.certaines()[identite] = entite_id
        return entite_id

    def rapprocher(self, type_entite: str, entite_id: uuid.UUID, identite: IdentiteNative,
                   methode: str, preuve: dict, url: str | None = None) -> Correspondance:
        """Relie une identité d'une autre source à une entité existante."""
        if not preuve:
            raise ValueError("un rapprochement porte sa preuve")
        for c in self.entrepot.correspondances(identite):
            if c.entite_id == entite_id and c.statut != Statut.REJECTED:
                return c                       # déjà relié : idempotent
        conflit = self.resoudre(identite)
        if methode not in Methode.SURES or (conflit and conflit != entite_id):
            statut = Statut.NEEDS_REVIEW
            if conflit and conflit != entite_id:
                preuve = {**preuve, "conflit_avec": str(conflit)}
        else:
            statut = Statut.VERIFIED
        c = Correspondance(type_entite, entite_id, identite, methode, statut, preuve, url)
        self.entrepot.ajouter_correspondance(c)
        if statut == Statut.VERIFIED:
            self.certaines()[identite] = entite_id
        return c

    def valider(self, c: Correspondance, par: str):
        conflit = self.resoudre(c.identite)
        if conflit and conflit != c.entite_id:
            raise ValueError(f"{c.identite} est déjà reliée à {conflit} : rejeter l'autre lien d'abord")
        self._reviser(c, Statut.VERIFIED, par)
        self.certaines()[c.identite] = c.entite_id

    def rejeter(self, c: Correspondance, par: str, motif: str):
        c.preuve = {**c.preuve, "motif_rejet": motif}
        self._reviser(c, Statut.REJECTED, par)
        if self.certaines().get(c.identite) == c.entite_id:
            del self.certaines()[c.identite]

    def _reviser(self, c: Correspondance, statut: str, par: str):
        c.statut, c.revu_par, c.revu_le = statut, par, datetime.now()
        self.entrepot.reviser_correspondance(c)

    def fusionner(self, type_entite: str, absorbee: uuid.UUID, absorbante: uuid.UUID, preuve: dict) -> dict | None:
        """Fusionne `absorbee` dans `absorbante` sur décision de revue (`preuve["cas"]`), ou sur
        référence explicite sourcée (`preuve["reference"]` et `preuve["source_id"]` : une source cite
        l'identifiant officiel de l'absorbée comme désignant l'absorbante).

        Chaque identité certaine de l'absorbée est rejetée chez elle et reliée à l'absorbante
        (`MANUAL`, ou la correspondance que l'absorbante avait déjà en revue, validée) ; une
        proposition en attente est rejetée et reposée sur l'absorbante. Puis l'entrepot re-pointe
        les références (`Entrepot.fusionner`). Déjà faite : None, rien n'est écrit."""
        par_reference = not preuve.get("cas") and bool(preuve.get("reference") and preuve.get("source_id"))
        if not preuve.get("cas") and not par_reference:
            raise ValueError("une fusion ne se fait que sur décision de revue (preuve.cas) ou sur référence "
                             "explicite sourcée (preuve.reference, preuve.source_id)")
        if absorbee == absorbante:
            raise ValueError(f"{absorbee} : une entité ne se fusionne pas avec elle-même")
        if self.entrepot.fusionnee_dans(absorbee) == absorbante:
            return None                            # déjà fusionnée : idempotent
        par = preuve.get("decide_par") or ("reference" if par_reference else "revue")
        motif = f"fusion dans {absorbante} (" + (f"référence {preuve['reference']}" if par_reference
                                                  else f"revue {preuve['cas']}") + ")"
        methode = Methode.EXPLICIT_REFERENCE if par_reference else Methode.MANUAL
        reportees = []
        with self.transaction():
            for c in self.entrepot.correspondances_de(absorbee):
                if c.statut == Statut.REJECTED:
                    continue                       # déjà écartée : reste telle quelle, pour l'audit
                deja = next((x for x in self.entrepot.correspondances(c.identite) if x.entite_id == absorbante), None)
                certaine, origine = c.certaine, c.preuve
                if certaine and deja and deja.methode not in Methode.SURES:
                    raise ValueError(f"{c.identite} : proposition {deja.methode} vers l'absorbante, à revoir d'abord")
                c.preuve = {**c.preuve, "motif_rejet": motif, "fusionnee_dans": str(absorbante)}
                self._reviser(c, Statut.REJECTED, par)
                trace = {**preuve, "fusion_de": str(absorbee), "methode_origine": c.methode}
                statut = Statut.VERIFIED if certaine else Statut.NEEDS_REVIEW
                if deja is None:
                    self.entrepot.ajouter_correspondance(Correspondance(
                        type_entite, absorbante, c.identite, methode if certaine else c.methode, statut,
                        trace if certaine else {**origine, "fusion_de": str(absorbee)}, c.url))
                elif certaine and not deja.certaine:
                    deja.preuve = {**deja.preuve, **trace}
                    self._reviser(deja, Statut.VERIFIED, par)
                if certaine:
                    reportees.append(c.identite)
            bilan = self.entrepot.fusionner(type_entite, absorbee, absorbante, preuve)
            for identite in reportees:
                self.certaines()[identite] = absorbante
        return bilan
