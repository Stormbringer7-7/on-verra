"""Entrepot en mémoire : mêmes garanties que Postgres (ajout seul, unicité des enregistrements
bruts par empreinte), sans base. Sert aux tests et prouve que le port suffit au métier."""

import copy
import uuid
from collections import Counter
from datetime import datetime
from contextlib import contextmanager
from dataclasses import replace

from ...domaine import Affirmation, Correspondance, EnregistrementSource, IdentiteNative, Provenance, Statut

# Contraintes d'unicité du schéma Postgres, pour qu'une fusion se comporte ici comme là-bas :
# clé des faits dépendants (un doublon après re-pointage est historisé puis retiré), et colonnes
# uniques des entités (jamais recopiées d'une entité à l'autre ; un doublon d'entité arrête la fusion).
CLES_DEPENDANTS = {"lien": ("de_id", "nature", "vers_id"), "vote": ("scrutin_id", "personne_id"),
                   "position_groupe": ("scrutin_id", "groupe_id"), "avis_amendement": ("amendement_id", "emetteur"),
                   "participation": ("reunion_id", "personne_id"), "audition": ("reunion_id", "ordre"),
                   "rubrique_declaree": ("declaration_id", "rubrique", "ordre"),
                   "exercice_representation": ("representant_id", "debut")}
UNIQUES = {"intervention": (("reunion_id", "ordre"),), "texte_publie": (("nor",),)}


class EntrepotMemoire:
    def __init__(self):
        self.sources: dict[tuple, uuid.UUID] = {}
        self.enregistrements: dict[uuid.UUID, EnregistrementSource] = {}
        self.entites: dict[uuid.UUID, str] = {}
        self.lignes: dict[tuple[str, uuid.UUID], dict] = {}
        self.provenances: dict[tuple[str, uuid.UUID], list[Provenance]] = {}
        self.liens: dict[uuid.UUID, Correspondance] = {}
        self.tables: dict[str, list[dict]] = {}
        self.historique: list[tuple] = []          # (entite_id, type, valeurs remplacées, source)
        self.revue: dict[str, dict] = {}
        self.affirmations: list[Affirmation] = []
        self.retraits: dict[uuid.UUID, datetime] = {}
        self.fusionnees: dict[uuid.UUID, uuid.UUID] = {}   # canon.entite.fusionnee_dans
        self.fusions: dict[uuid.UUID, dict] = {}            # canon.fusion, par absorbée

    @contextmanager
    def transaction(self):
        sauvegarde = copy.deepcopy(self.__dict__)
        try:
            yield self
        except BaseException:
            self.__dict__.update(sauvegarde)
            raise

    def enregistrer_source(self, e: EnregistrementSource) -> tuple[uuid.UUID, bool]:
        cle = (e.systeme, e.fichier, e.chemin, e.empreinte)
        if cle in self.sources:
            return self.sources[cle], False
        self.sources[cle] = id_ = uuid.uuid4()
        self.enregistrements[id_] = e
        return id_, True

    def creer_entite(self, type_entite: str) -> uuid.UUID:
        id_ = uuid.uuid4()
        self.entites[id_] = type_entite
        return id_

    def ecrire(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        if self.entites.get(entite_id) != type_entite:
            raise KeyError(f"{entite_id} n'est pas une entité {type_entite}")
        if provenance.source_id not in self.enregistrements:
            raise KeyError(f"enregistrement source inconnu : {provenance.source_id}")
        ancienne = self.lignes.get((type_entite, entite_id))
        # compléter un champ vide n'est pas un changement : seule une valeur connue remplacée l'est
        if ancienne is not None and any(ancienne.get(k) is not None and ancienne.get(k) != v for k, v in valeurs.items()):
            self.historique.append((entite_id, type_entite, ancienne, provenance.source_id))
        self.lignes[(type_entite, entite_id)] = {**(ancienne or {}), **valeurs}
        self.provenances.setdefault((type_entite, entite_id), []).append(provenance)

    def lire(self, type_entite: str, entite_id: uuid.UUID) -> dict | None:
        return self.lignes.get((type_entite, entite_id))

    def remplacer_dependants(self, table: str, parent: dict, lignes: list[dict], provenance: Provenance):
        if provenance.source_id not in self.enregistrements:
            raise KeyError(f"enregistrement source inconnu : {provenance.source_id}")
        gardees = [l for l in self.tables.get(table, []) if any(l.get(k) != v for k, v in parent.items())]
        self.tables[table] = gardees + [{**l, **parent, "source_id": provenance.source_id} for l in lignes]

    def dependants(self, table: str, parent: dict) -> list[dict]:
        return [dict(l) for l in self.tables.get(table, []) if all(l.get(k) == v for k, v in parent.items())]

    def correspondances(self, identite: IdentiteNative) -> list[Correspondance]:
        return [replace(c) for c in self.liens.values() if c.identite == identite]

    def correspondances_de(self, entite_id: uuid.UUID) -> list[Correspondance]:
        return [replace(c) for c in self.liens.values() if c.entite_id == entite_id]

    def compter_correspondances(self):
        n = Counter((c.identite.systeme, c.identite.type_source, c.methode, c.statut) for c in self.liens.values())
        return [(*k, v) for k, v in sorted(n.items())]

    def verifiees(self):
        return [(c.identite, c.entite_id) for c in self.liens.values() if c.statut == Statut.VERIFIED]

    def ajouter_correspondance(self, c: Correspondance):
        if self.entites.get(c.entite_id) != c.type_entite:
            raise KeyError(f"{c.entite_id} n'est pas une entité {c.type_entite}")
        if c.id in self.liens:
            raise KeyError(f"correspondance {c.id} déjà présente : la réviser")
        self.liens[c.id] = replace(c)

    def reviser_correspondance(self, c: Correspondance):
        if c.id not in self.liens:
            raise KeyError(f"correspondance inconnue : {c.id}")
        self.liens[c.id] = replace(c)

    def a_revoir(self):
        return [replace(c) for c in self.liens.values() if c.statut in (Statut.NEEDS_REVIEW, Statut.PROPOSED)]

    def ajouter_affirmation(self, a: Affirmation):
        self.affirmations.append(a)

    def corriger(self, type_entite: str, entite_id: uuid.UUID, valeurs: dict, provenance: Provenance):
        if (type_entite, entite_id) not in self.lignes:
            raise KeyError(f"{type_entite} {entite_id} absent : rien à corriger")
        self.ecrire(type_entite, entite_id, valeurs, provenance)

    def signaler(self, cas: dict) -> dict:
        existant = self.revue.get(cas["cle"])
        maintenant = datetime.now()
        if existant:
            existant.update({k: v for k, v in cas.items() if k not in ("statut", "decision")}, derniere_vue=maintenant)
            if existant["statut"] == "CADUC":
                existant["statut"] = "A_REVOIR"
        else:
            existant = self.revue[cas["cle"]] = {**cas, "cas_id": uuid.uuid4(), "statut": "A_REVOIR", "decision": None,
                                                 "decide_par": None, "decide_le": None, "applique_le": None,
                                                 "premiere_vue": maintenant, "derniere_vue": maintenant}
        return dict(existant)

    def cas_revue(self, type_=None, statut=None) -> list[dict]:
        return [dict(c) for c in self.revue.values()
                if (type_ is None or c["type"] == type_) and (statut is None or c["statut"] == statut)]

    def decider(self, cle: str, decision: dict, par: str):
        c = self.revue[cle]
        c.update(decision=decision, decide_par=par, decide_le=datetime.now(), statut="DECIDE")

    def marquer_applique(self, cle: str):
        self.revue[cle].update(statut="APPLIQUE", applique_le=datetime.now())

    def classer_caducs(self, prefixe: str, presents: set[str]) -> int:
        caducs = [c for k, c in self.revue.items()
                  if k.startswith(prefixe) and k not in presents and c["statut"] == "A_REVOIR"]
        for c in caducs:
            c["statut"] = "CADUC"
        return len(caducs)

    def retirer_absents(self, type_entite: str, champ: str, parent_id: uuid.UUID, presents: set[uuid.UUID]) -> int:
        n = 0
        for (t, id_), ligne in self.lignes.items():
            if t != type_entite or ligne.get(champ) != parent_id:
                continue
            if id_ in presents and id_ not in self.fusionnees:
                self.retraits.pop(id_, None)
            elif id_ not in self.retraits:
                self.retraits[id_] = datetime.now()
                n += 1
        return n

    def retirees(self, type_entite: str) -> set[uuid.UUID]:
        return {i for i in self.retraits if self.entites.get(i) == type_entite}

    def fusionnee_dans(self, entite_id: uuid.UUID) -> uuid.UUID | None:
        return self.fusionnees.get(entite_id)

    def fusionner(self, type_entite: str, absorbee: uuid.UUID, absorbante: uuid.UUID, preuve: dict) -> dict | None:
        b, a = absorbee, absorbante
        if a == b:
            raise ValueError(f"{b} : une entité ne se fusionne pas avec elle-même")
        if self.entites.get(b) != type_entite or self.entites.get(a) != type_entite:
            raise KeyError(f"{b} et {a} ne sont pas deux entités {type_entite}")
        if self.fusionnees.get(b) == a:
            return None                                # déjà fait : idempotent
        if b in self.fusionnees or a in self.fusionnees:
            raise ValueError(f"{b} ou {a} est déjà fusionnée : fusionner dans l'entité qui l'a absorbée")
        with self.transaction():
            # 1. valeurs : celles de l'absorbante gagnent, un champ vide est complété, un écart consigné
            uniques = {c for cle in UNIQUES.get(type_entite, ()) for c in cle}
            va, vb = self.lignes.get((type_entite, a)), self.lignes.get((type_entite, b)) or {}
            completees, conflits = {}, {}
            for col, v in vb.items():
                w = (va or {}).get(col)
                if v is None or v == w or v == b:
                    continue
                if w is not None:
                    conflits[col] = {"gardee": w, "ecartee": v}
                elif col in uniques:
                    conflits[col] = {"gardee": None, "ecartee": v, "motif": "valeur unique, non recopiée"}
                else:
                    completees[col] = v
            if completees or (va is None and vb):
                self.lignes[(type_entite, a)] = {**(va or {}), **completees}
                self.provenances.setdefault((type_entite, a), []).extend(self.provenances.get((type_entite, b), []))
            # 2. références : toute valeur égale à l'absorbée (un UUID ne désigne qu'une entité)
            references, doublons = Counter(), 0
            for (t, id_), ligne in self.lignes.items():
                for k, v in ligne.items():
                    if v == b:
                        ligne[k] = a
                        references[f"{t}.{k}"] += 1
                for cle in UNIQUES.get(t, ()):
                    if any(ligne.get(k) == a for k in cle) and any(
                            (t2, i2) != (t, id_) and t2 == t and i2 != b and all(l2.get(k) == ligne.get(k) for k in cle)
                            for (t2, i2), l2 in self.lignes.items()):
                        raise ValueError(f"fusion impossible : deux {t} ont alors la même clé {cle} "
                                         "(les fusionner d'abord)")
            for table, lignes in self.tables.items():
                cle, gardees, vues = CLES_DEPENDANTS.get(table), [], set()
                touchees = [l for l in lignes if b in l.values()]
                for l in lignes:
                    if b in l.values():
                        continue
                    gardees.append(l)
                    if cle:
                        vues.add(tuple(l.get(k) for k in cle))
                for l in touchees:
                    for k, v in l.items():
                        if v == b:
                            l[k] = a
                            references[f"{table}.{k}"] += 1
                    if cle and tuple(l.get(k) for k in cle) in vues:
                        self.historique.append((b, table, dict(l), None))   # le fait existe déjà chez l'absorbante
                        doublons += 1
                        continue
                    gardees.append(l)
                    if cle:
                        vues.add(tuple(l.get(k) for k in cle))
                self.tables[table] = gardees
            for x in self.affirmations:
                if x.sujet_id == b:
                    x.sujet_id = a
                    references["affirmation.sujet_id"] += 1
            for cas in self.revue.values():
                if cas.get("sujet_id") == b:
                    cas["sujet_id"] = a
                    references["cas_revue.sujet_id"] += 1
                for champ in ("cibles", "candidats"):
                    visees = [x for x in cas.get(champ) or [] if x.get("entite_id") == str(b)]
                    for x in visees:
                        x["entite_id"] = str(a)
                    references[f"cas_revue.{champ}"] += bool(visees)
            for x, dans in self.fusionnees.items():
                if dans == b:
                    self.fusionnees[x] = a
                    references["entite.fusionnee_dans"] += 1
            # 3. l'absorbée est gardée, marquée ; la fusion est enregistrée
            self.fusionnees[b] = a
            self.retraits.setdefault(b, datetime.now())
            bilan = {"references": {k: n for k, n in references.items() if n}, "doublons": doublons,
                     "completees": sorted(completees), "conflits": conflits}
            self.fusions[b] = {"type": type_entite, "absorbee": b, "absorbante": a, "preuve": dict(preuve), **bilan,
                               "fusionnee_le": datetime.now()}
        return bilan

    def controles(self) -> list[dict]:
        """Mêmes invariants que Postgres, sur les structures en mémoire."""
        certaines = [c for c in self.liens.values() if c.statut == Statut.VERIFIED]
        doubles = [i for i, n in Counter(c.identite for c in certaines).items() if n > 1]
        verifiees = {c.entite_id for c in certaines}
        fusionnees = set(self.fusionnees)
        appliques = {c["cle"] for c in self.revue.values() if c["statut"] == "APPLIQUE"}
        vers_fusionnee = [f"{t}.{k} {id_}" for (t, id_), l in self.lignes.items() for k, v in l.items() if v in fusionnees]
        vers_fusionnee += [f"{t}.{k}" for t, ls in self.tables.items() for l in ls for k, v in l.items() if v in fusionnees]
        textes = {str(f) for f in fusionnees}
        vers_fusionnee += [c["cle"] for c in self.revue.values() if c.get("sujet_id") in fusionnees or any(
            x.get("entite_id") in textes for x in [*(c.get("cibles") or []), *(c.get("candidats") or [])])]
        vers_fusionnee += [str(x) for x, dans in self.fusionnees.items() if dans in fusionnees]
        controles = [
            ("correspondance_certaine_par_nom", True, [c for c in certaines if c.methode == "NAME_DATE"]),
            ("correspondance_manuelle_sans_decision", True,
             [c for c in certaines if c.methode == "MANUAL" and "cas" not in c.preuve]),
            ("identite_reliee_deux_fois", True, doubles),
            ("entite_sans_identite", True, [e for e in self.entites if e not in verifiees and e not in fusionnees]),
            ("reference_vers_entite_fusionnee", True, vers_fusionnee),
            ("entite_fusionnee_avec_identite", True,
             [c for c in self.liens.values() if c.entite_id in fusionnees and c.statut != Statut.REJECTED]),
            ("fusion_sans_decision", True,
             [b for b in fusionnees if (p := (self.fusions.get(b) or {}).get("preuve", {})).get("cas") not in appliques
              and not (p.get("reference") and uuid.UUID(str(p.get("source_id"))) in self.enregistrements)]),
            ("ligne_sans_provenance", True, [k for k in self.lignes if not self.provenances.get(k)]),
            ("elu_relie_sans_revue", True,
             [k for k, v in self.lignes.items() if k[0] == "mandat_rne" and v.get("personne_id")
              and not any(c["type"] == "elu_local" and c["statut"] == "APPLIQUE"
                          and any(x["entite_id"] == str(k[1]) for x in c["cibles"]) for c in self.revue.values())]),
            ("decision_non_appliquee", True, [c for c in self.revue.values() if c["statut"] == "DECIDE"]),
            ("cas_a_revoir", False, [c for c in self.revue.values() if c["statut"] == "A_REVOIR"]),
        ]
        return [{"nom": n, "bloquant": b, "explication": "", "nombre": len(x), "exemples": [str(e) for e in x[:5]]}
                for n, b, x in controles]

