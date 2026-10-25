"""Répertoire des représentants d'intérêts (AGORA) : représentants, exercices, actions déclarées.

Une action déclarée vise des CATÉGORIES de responsables publics, jamais des personnes : aucun
lien action → élu n'est possible. Les rapprochements action → dossier sont analytiques et ne sont
pas faits ici (cf. docs/rapprochements.md). Adresses, téléphones et e-mails ne sont pas chargés.
"""

import json
from datetime import datetime

from ....chargement import Document, Flux, charger
from ....domaine import IdentiteNative, Systeme
from ....domaine.objets import Dependants, Objet
from ....etl import Etape, Fichier

LICENCE = "Licence Ouverte / Etalab 2.0"
REPERTOIRE = Fichier("repertoire.json", "https://www.hatvp.fr/agora/opendata/agora_repertoire_opendata.json")


def hatvp(type_source: str, id_: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.HATVP, type_source, id_) if id_ else None


def date(x: str | None):
    """« 01-01-2026 », « 13/02/2025 09:39:12 », « 15/03/2024 à 15:58:39 »."""
    if not x:
        return None
    x = x.replace(" à ", " ").strip()
    for format_ in ("%d-%m-%Y", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(x, format_)
        except ValueError:
            pass
    return None


def libelles(liste_, cle="label"):
    return [x[cle] if isinstance(x, dict) else x for x in liste_ or []]


def representant(doc: Document):
    p = doc.donnees
    ident = hatvp("representant", f"{p['typeIdentifiantNational']}:{p['identifiantNational']}")
    yield Objet("representant_interets", ident, {
        "denomination": p["denomination"], "nom_usage": p.get("nomUsage"),
        "identifiant_national": p["identifiantNational"], "type_identifiant": p["typeIdentifiantNational"],
        "categorie": (p.get("categorieOrganisation") or {}).get("label"),
        "premiere_publication": (d.date() if (d := date(p.get("datePremierePublication"))) else None),
        "secteurs": libelles((p.get("activites") or {}).get("listSecteursActivites"))}, "/publications[]")
    exercices = []
    for e in p.get("exercices") or []:
        ex = e["publicationCourante"]
        exercices.append({"debut": date(ex["dateDebut"]).date(), "fin": date(ex["dateFin"]).date(),
                          "montant_depense": ex.get("montantDepense"), "nombre_salaries": ex.get("nombreSalaries"),
                          "nombre_actions": ex.get("nombreActivite")})
        for a in ex.get("activites") or []:
            act = a["publicationCourante"]
            actions = act.get("actionsRepresentationInteret") or []
            union = lambda cle: list(dict.fromkeys(x for r in actions for x in r.get(cle) or []))
            yield Objet("action_representation", hatvp("action", act["identifiantFiche"]), {
                "representant_id": ident, "exercice_debut": date(ex["dateDebut"]).date(),
                "exercice_fin": date(ex["dateFin"]).date(), "objet": act.get("objet") or "",
                "domaines": act.get("domainesIntervention") or [], "actions_menees": union("actionsMenees"),
                "responsables_publics": union("reponsablesPublics"), "decisions_concernees": union("decisionsConcernees"),
                "tiers": union("tiers"), "publiee_le": date(act.get("publicationDate"))},
                f"/publications[]/exercices[]/activites[{act['identifiantFiche']}]")
    yield Dependants("exercice_representation", {"representant_id": ident},
                     list({e["debut"]: e for e in exercices}.values()), "/publications[]/exercices")


def executer(ctx):
    chemin = ctx.fichier(REPERTOIRE.nom)

    def docs():
        for p in json.loads(chemin.read_bytes())["publications"]:
            cle = f"{p['typeIdentifiantNational']}:{p['identifiantNational']}"
            yield Document(REPERTOIRE, f"publications/{cle}", json.dumps(p, sort_keys=True).encode(), cle, p)

    charger(ctx, Flux(Systeme.HATVP, LICENCE, docs, representant))


ETAPE = Etape("hatvp.representants", executer, sources=lambda p: [REPERTOIRE],
              description="répertoire des représentants d'intérêts : représentants, exercices, actions déclarées")
