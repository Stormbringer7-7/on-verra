"""Chargement canonique : d'un document brut aux entités, via les ports seulement.

Pour chaque document d'une archive :
1. son empreinte est enregistrée (`brut.enregistrement_source`) ; inchangé, il est sauté ;
2. l'adaptateur l'analyse en `Objet`, `Dependants` et `Rapprochement` ;
3. tout est écrit dans une transaction : identités résolues par le registre, provenance gardée.

Les étapes réutilisent `etl.Etape` et `etl.ordonner` ; seul le contexte change.
"""

import hashlib
import json
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

from . import revue
from .domaine import EnregistrementSource, IdentiteNative, Methode, Provenance
from .domaine.objets import Candidat, CasRevue, Dependants, Ensemble, Objet, Rapprochement
from .etl import Etape, Fichier, ordonner
from .identites import RegistreIdentites
from .ports import Entrepot
from .textes import texte_html

Analyse = Iterable[Objet | Dependants | Rapprochement | CasRevue | Ensemble]


@dataclass
class ContexteCanon:
    entrepot: Entrepot
    registre: RegistreIdentites
    fichiers: dict[str, Path]
    parametres: dict
    forcer: bool = False                       # réanalyse même les documents inchangés
    retelecharger: bool = False                # re-télécharge les fichiers en cache (--forcer seulement)
    bilan: Counter = field(default_factory=Counter)
    artefacts: dict[str, Any] = field(default_factory=dict)
    # décisions de revue (nature « champ ») : (identité de la cible, champ) -> entité choisie
    decisions: dict[tuple[str, str], Any] = field(default_factory=dict)
    # identités qu'un cas dédié met en revue : pas de cas générique « référence inconnue » en double
    identites_en_revue: set = field(default_factory=set)

    def fichier(self, nom: str) -> Path:
        return self.fichiers[nom]


@dataclass(frozen=True)
class Document:
    """Un document brut à analyser : son emplacement et son contenu."""
    fichier: Fichier
    chemin: str                                # membre de l'archive, "" pour un fichier simple
    octets: bytes                              # contenu brut : c'est lui qui fait l'empreinte
    id_source: str | None = None
    donnees: Any = None                        # contenu déjà lu (ligne de CSV ou de dump), facultatif


class DocumentIllisible(Exception):
    """Levée par un adaptateur pour un document qu'il ne sait pas lire : compté, pas bloquant.
    Le document brut reste enregistré ; il sera relu s'il change à la source."""


@dataclass(frozen=True)
class Flux:
    """Une famille de documents d'une source et la façon de les analyser.

    `prealable` (facultatif) donne les entités d'un document sans l'analyser entièrement : elles
    sont toutes identifiées avant la première écriture, si bien qu'une référence vers un objet
    d'un flux chargé dans la même transaction se résout quel que soit l'ordre des fichiers. Il
    doit annoncer exactement les entités que l'analyse écrira.
    """
    systeme: str
    licence: str
    documents: Callable[[], Iterator[Document]]
    analyser: Callable[[Document], Analyse]
    prealable: Callable[[Document], Iterable[tuple[str, IdentiteNative]]] | None = None


def charger(ctx: ContexteCanon, *flux: Flux):
    """Charge les documents nouveaux ou modifiés de tous les flux, dans une seule transaction.

    Les clés étrangères étant différées, la cohérence n'est vérifiée qu'à la fin : un échec
    annule tout le lot, rien n'est à moitié écrit.
    """
    with ctx.registre.transaction():
        for f in flux:
            if f.prealable:
                for doc in f.documents():
                    for type_, identite in f.prealable(doc):
                        ctx.registre.identifier(type_, identite)
        for f in flux:
            for doc in f.documents():
                empreinte = hashlib.sha256(doc.octets).hexdigest()
                source_id, nouveau = ctx.entrepot.enregistrer_source(EnregistrementSource(
                    f.systeme, doc.fichier.nom, doc.chemin, empreinte, doc.id_source, doc.fichier.url, f.licence))
                if not nouveau and not ctx.forcer:
                    ctx.bilan["documents_inchanges"] += 1
                    continue
                try:
                    elements = list(f.analyser(doc))
                except DocumentIllisible as e:
                    print(f"Illisible : {doc.fichier.nom} {doc.chemin} ({e})")
                    revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                        "document_illisible", f"document_illisible:{f.systeme}:{doc.fichier.nom}:{doc.chemin}",
                        "constat", f"{doc.fichier.nom} {doc.chemin} n'a pas pu être lu : {e}",
                        contexte={"fichier": doc.fichier.nom, "chemin": doc.chemin, "erreur": str(e)}),
                        source_id, ctx.bilan)
                    continue
                ctx.bilan["documents_lus"] += 1
                for element in elements:
                    ecrire(ctx, element, source_id, doc.fichier.url)


def ecrire(ctx: ContexteCanon, element, source_id, url: str | None):
    if isinstance(element, Objet):
        entite_id = ctx.registre.identifier(element.type, element.identite, element.url)
        valeurs = resoudre(ctx, element.valeurs)
        for champ, v in element.valeurs.items():
            if valeurs[champ] is None and (str(element.identite), champ) in ctx.decisions:
                valeurs[champ] = ctx.decisions[(str(element.identite), champ)]      # décision de revue
            elif isinstance(v, IdentiteNative) and valeurs[champ] is None:
                inconnue(ctx, (element.type, element.identite), champ, v, source_id)
        ctx.entrepot.ecrire(element.type, entite_id, valeurs, Provenance(source_id, element.pointeur, element.url or url))
        ctx.bilan[f"ecrit.{element.type}"] += 1
    elif isinstance(element, Dependants):
        parent = resoudre(ctx, element.parent)
        if any(v is None for v in parent.values()):
            for champ, v in element.parent.items():
                if isinstance(v, IdentiteNative) and parent[champ] is None:
                    inconnue(ctx, None, f"{element.table}.{champ}", v, source_id)
            ctx.bilan[f"orphelins.{element.table}"] += 1
            return
        lignes = []
        for l in element.lignes:
            resolue = resoudre(ctx, l)
            manquantes = [k for k in element.requis if resolue.get(k) is None]
            if manquantes:
                ctx.bilan[f"ecartes.{element.table}"] += 1
                cle_parent = ",".join(str(v) for v in element.parent.values())
                for k in manquantes:
                    if str(l.get(k)) not in ctx.identites_en_revue:
                        revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                            "lien_ecarte", f"lien_ecarte:{element.table}:{cle_parent}:{k}:{l.get(k)}", "constat",
                            f"{element.table} ({cle_parent}) cite {l.get(k)}, absent des données chargées",
                            contexte={"table": element.table, "parent": cle_parent, "champ": k,
                                      "cite": str(l.get(k))}), source_id, ctx.bilan)
            else:
                lignes.append(resolue)
        ctx.entrepot.remplacer_dependants(element.table, parent, lignes,
                                          Provenance(source_id, element.pointeur, url))
        ctx.bilan[f"ecrit.{element.table}"] += len(lignes)
    elif isinstance(element, Rapprochement):
        entite_id = ctx.registre.resoudre(element.connue)
        if entite_id is None:
            inconnue(ctx, None, f"rapprochement.{element.type}", element.connue, source_id)
            return
        c = ctx.registre.rapprocher(element.type, entite_id, element.autre, element.methode,
                                    {**element.preuve, "source_id": str(source_id)}, element.url)
        ctx.bilan[f"rapprochement.{c.statut}"] += 1
        if not c.certaine and fusionner_par_reference(ctx, element, entite_id, c, source_id):
            return
        if not c.certaine:
            candidats = [Candidat(element.type, element.connue, str(element.connue), {"methode": element.methode,
                                                                                      **element.preuve})]
            if conflit := c.preuve.get("conflit_avec"):
                deja = next((x.identite for x in ctx.entrepot.correspondances_de(uuid.UUID(conflit))
                             if x.methode == "OFFICIAL_ID"), element.autre)
                candidats.append(Candidat(element.type, deja, f"{deja} (déjà reliée)", {"deja_reliee": True}))
            revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                "correspondance_a_revoir", f"correspondance_a_revoir:{element.autre}", "identite",
                f"{element.autre} : rapprochement {element.methode} en revue"
                + (" (déjà reliée à une autre entité)" if conflit else ""),
                sujet=(element.type, element.autre), candidats=tuple(candidats),
                contexte={"preuve": element.preuve}), source_id, ctx.bilan)
    elif isinstance(element, Ensemble):
        parent = ctx.registre.resoudre(element.parent)
        if parent is None:
            return                                 # parent non écrit : rien à comparer
        presents = {i for i in (ctx.registre.resoudre(x) for x in element.identites) if i}
        ctx.bilan[f"retires.{element.type}"] += ctx.entrepot.retirer_absents(element.type, element.champ, parent, presents)
        for prefixe in element.cas_prefixes:
            ctx.bilan["cas.caducs"] += ctx.entrepot.classer_caducs(prefixe, set(element.cas))
    elif isinstance(element, CasRevue):
        if element.nature == "identite" and element.sujet:
            ctx.identites_en_revue.add(str(element.sujet[1]))
        revue.signaler(ctx.entrepot, ctx.registre, element, source_id, ctx.bilan)
    else:
        raise TypeError(f"élément inattendu : {element!r}")


def fusionner_par_reference(ctx: ContexteCanon, element: Rapprochement, entite_id, c, source_id) -> bool:
    """Une référence explicite désigne l'identifiant officiel d'une autre entité du même type :
    c'est le même objet, vu par deux sources (l'AMO cite le matricule Sénat d'un acteur ; l'AN cite
    le signet d'un dossier créé côté Sénat). L'entité citée est fusionnée dans celle qui cite, la
    preuve est la référence et son document source. Une identité qui n'est pas l'identifiant propre
    de l'autre entité (déjà reliée par une autre référence) reste en revue."""
    if element.methode != Methode.EXPLICIT_REFERENCE or not (conflit := c.preuve.get("conflit_avec")):
        return False
    autre = uuid.UUID(conflit)
    propre = next((x for x in ctx.entrepot.correspondances(element.autre)
                   if x.entite_id == autre and x.certaine and x.methode == Methode.OFFICIAL_ID), None)
    if propre is None or propre.type_entite != element.type:
        return False
    bilan = ctx.registre.fusionner(element.type, autre, entite_id, {
        "reference": str(element.autre), "cite_par": str(element.connue), "source_id": str(source_id),
        "url": element.url, **{k: v for k, v in element.preuve.items() if k not in ("source_id",)}})
    ctx.bilan[f"fusion.{element.type}"] += 1
    if bilan and bilan["conflits"]:
        conflits = json.loads(json.dumps(bilan["conflits"], default=str))
        revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
            "conflit_fusion", f"conflit_fusion:{element.autre}", "constat",
            f"{element.type} {element.autre} fusionné dans {element.connue} (référence explicite) : "
            f"{len(conflits)} valeur(s) différente(s) ({', '.join(conflits)}), celles de l'entité gardée l'emportent",
            contexte={"reference": str(element.autre), "cite_par": str(element.connue), "conflits": conflits}),
            source_id, ctx.bilan)
    return True


def inconnue(ctx: ContexteCanon, sujet, champ: str, cible: IdentiteNative, source_id):
    """Une référence vers un objet absent des données chargées : constat à revoir."""
    ctx.bilan[f"reference_inconnue.{cible.systeme}.{cible.type_source}"] += 1
    if str(cible) in ctx.identites_en_revue:
        return                                  # un cas dédié (identité en revue) la couvre déjà
    revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
        "reference_inconnue", f"reference_inconnue:{sujet[1] if sujet else '-'}:{champ}:{cible}", "constat",
        f"{sujet[1] if sujet else 'un lien'} cite {cible} ({champ}), absent des données chargées",
        sujet=sujet, champ=champ, contexte={"cite": str(cible)}), source_id, ctx.bilan)


def resoudre(ctx: ContexteCanon, valeurs: dict) -> dict:
    """Remplace chaque IdentiteNative par l'UUID de l'entité reliée de façon certaine, ou None ;
    chaque texte par son texte propre (HTML, entités, encodage : `textes.texte_html`)."""
    return {cle: ctx.registre.resoudre(v) if isinstance(v, IdentiteNative) else texte_html(v) if isinstance(v, str) else v
            for cle, v in valeurs.items()}


def charger_decisions(entrepot, registre: RegistreIdentites | None = None) -> dict[tuple[str, str], Any]:
    """Décisions de nature « champ » déjà prises : réappliquées à chaque écriture de leurs cibles.
    « aucun » avec création (`si_aucun`) : la valeur est l'entité créée par la revue."""
    registre = registre or RegistreIdentites(entrepot)
    decisions = {}
    for cas in entrepot.cas_revue():
        if cas["nature"] != "champ" or not cas.get("decision"):
            continue
        choix = cas["decision"].get("choix")
        valeur = None
        if choix is not None and cas["candidats"][choix]["entite_id"]:
            valeur = uuid.UUID(cas["candidats"][choix]["entite_id"])
        elif choix is None and (creer := (cas["contexte"] or {}).get("si_aucun")):
            valeur = registre.resoudre(IdentiteNative(*creer["identite"].split(":", 2)))
        if valeur:
            for cible in cas["cibles"]:
                decisions[(cible["identite"], cas["champ"])] = valeur
    return decisions


def systeme_de(etape: Etape) -> str:
    """Dossier du cache d'une étape : son préfixe (« an.travaux » -> data/brut/an)."""
    return etape.nom.split(".", 1)[0]


def construire(entrepot: Entrepot, cache: Path, etapes: list[Etape], forcer: bool = False,
               age_max: float | None = None, relire: bool | set[str] = False, **parametres) -> ContexteCanon:
    """`forcer` re-télécharge et relit tout ; `relire` réanalyse les documents inchangés sans
    re-télécharger (pour appliquer une règle nouvelle à des données déjà vues) : toutes les étapes
    (True) ou seulement celles nommées (leurs dépendances tournent, documents inchangés sautés)."""
    ordre = ordonner(etapes)
    fichiers = {f.nom: f.recuperer(cache / systeme_de(e), forcer, age_max) for e in ordre for f in e.sources(parametres)}
    ctx = ContexteCanon(entrepot, RegistreIdentites(entrepot), fichiers, parametres, forcer or relire is True, forcer)
    ctx.decisions = charger_decisions(entrepot, ctx.registre)
    for e in ordre:
        if isinstance(relire, set):
            ctx.forcer = forcer or e.nom in relire
        debut, avant = time.monotonic(), Counter(ctx.bilan)
        e.executer(ctx)
        ecart = {k: v - avant.get(k, 0) for k, v in ctx.bilan.items() if v != avant.get(k, 0)}
        print(f"[{e.nom}] {time.monotonic() - debut:.1f} s  " + "  ".join(f"{k}={v}" for k, v in sorted(ecart.items())))
    return ctx
