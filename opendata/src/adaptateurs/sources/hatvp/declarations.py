"""Déclarations publiées (intérêts, activités, situation patrimoniale) des députés, sénateurs et
membres du Gouvernement.

Chaîne explicite : ligne de `liste.csv` (`id_origine`, `url_dossier`, `open_data`) → XML unitaire
de la déclaration (`uuid`). Identité du déclarant : sa page nominative HATVP (`url_dossier`).
- député, sénateur : `id_origine` est le numéro d'acteur AN ou le matricule Sénat → même personne
  (référence explicite, vérifiée à 100 % sur la 17e législature) ;
- membre du Gouvernement : aucun identifiant → cas de revue (homonymes AN proposés) ; tant qu'une
  personne n'a pas décidé, la déclaration reste sans personne reliée.
"""

import csv
import io
import time
import urllib.error
from urllib.parse import quote
from datetime import datetime
from xml.etree import ElementTree

from .... import revue
from ....chargement import Document, DocumentIllisible, Flux, charger
from ....domaine import IdentiteNative, Methode, Systeme
from ....domaine.objets import Candidat, CasRevue, Dependants, Objet, Rapprochement
from ....etl import Etape, Fichier
from ....noms import normaliser

LICENCE = "Licence Ouverte / Etalab 2.0"
LISTE = Fichier("declarations_liste.csv", "https://www.hatvp.fr/livraison/opendata/liste.csv")
DOSSIERS = "https://www.hatvp.fr/livraison/dossiers"
MANDATS = {"depute", "senateur", "gouvernement"}
PAUSE = 0.2
NON_PUBLIE = "[Données non publiées]"
CLES_PRIVEES = ("adresse", "b64", "telephone", "email", "datenaissance", "regimematrimonialcomments")


def hatvp(type_source: str, id_: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.HATVP, type_source, id_) if id_ else None


def lignes(chemin) -> list[dict]:
    return [l for l in csv.DictReader(io.StringIO(chemin.read_text(encoding="utf-8")), delimiter=";")
            if l["type_mandat"] in MANDATS and l["open_data"]]


def date_fr(x: str | None):
    """« 29/11/2024 18:54:22 » ou « 2024-08-04 » -> date."""
    if not x:
        return None
    x = x.strip()
    return (datetime.strptime(x[:10], "%d/%m/%Y") if "/" in x[:10] else datetime.strptime(x[:10], "%Y-%m-%d")).date()


def contenu(element) -> dict | str | None:
    """Élément XML -> valeurs publiées, sans les données privées ni « non publiées »."""
    enfants = list(element)
    if not enfants:
        texte = (element.text or "").strip()
        return None if not texte or NON_PUBLIE in texte else texte
    resultat = {}
    for e in enfants:
        if any(p in e.tag.lower() for p in CLES_PRIVEES):
            continue
        v = contenu(e)
        if v not in (None, {}, []):
            resultat.setdefault(e.tag, []).append(v) if e.tag == "items" else resultat.__setitem__(e.tag, v)
    return resultat


def declarant(ligne: dict) -> IdentiteNative:
    return hatvp("declarant", ligne["url_dossier"].rstrip("/").rsplit("/", 1)[-1])


def declaration(doc: Document, annuaire: dict):
    ligne = doc.donnees
    try:
        racine = ElementTree.fromstring(doc.octets)
    except ElementTree.ParseError as e:
        raise DocumentIllisible(str(e)) from e
    personne = declarant(ligne)
    nom = f"{ligne['prenom']} {ligne['nom']}"
    if ligne["type_mandat"] in ("depute", "senateur") and ligne["id_origine"]:
        connue = (IdentiteNative(Systeme.AN, "acteur", f"PA{ligne['id_origine']}") if ligne["type_mandat"] == "depute"
                  else IdentiteNative(Systeme.SENAT, "senateur", ligne["id_origine"]))
        yield Rapprochement("personne", connue, personne, Methode.EXPLICIT_REFERENCE,
                            {"id_origine": ligne["id_origine"], "type_mandat": ligne["type_mandat"]},
                            f"https://www.hatvp.fr{ligne['url_dossier']}")
    else:
        candidats = tuple(Candidat("personne", IdentiteNative(Systeme.AN, "acteur", c["acteur"]), c["libelle"],
                                   {"depute": c["depute"], "membre_gouvernement": c["membre_gouvernement"]})
                          for c in annuaire.get(normaliser(nom), []))
        yield CasRevue("identite_declarant", f"identite_declarant:{personne.id_source}", "identite",
                       f"Déclarant HATVP « {nom} » ({ligne['qualite']}) sans identifiant parlementaire : "
                       f"{len(candidats)} acteur(s) AN homonyme(s)",
                       sujet=("personne", personne), candidats=candidats,
                       contexte={"type_mandat": ligne["type_mandat"], "qualite": ligne["qualite"],
                                 "si_aucun": {"type": "personne", "valeurs": {
                                     "civilite": ligne["civilite"], "prenom": ligne["prenom"], "nom": ligne["nom"],
                                     "nom_affiche": nom}}})
    uuid_ = racine.findtext("uuid")
    general = racine.find("general")
    type_decl = general.find("typeDeclaration") if general is not None else None
    ident = hatvp("declaration", uuid_)
    yield Objet("declaration", ident, {
        "personne_id": personne, "declarant_libelle": nom, "type": ligne["type_document"].upper(),
        "type_libelle": type_decl.findtext("label") if type_decl is not None else None,
        "modificative": (general.findtext("declarationModificative") == "true") if general is not None else None,
        "qualite": ligne["qualite"] or None, "mandat": ligne["type_mandat"],
        "date_depot": date_fr(ligne["date_depot"]), "date_publication": date_fr(ligne["date_publication"]),
        "url": f"{DOSSIERS}/{ligne['nom_fichier']}" if ligne["nom_fichier"] else None},
        "/declaration", f"https://www.hatvp.fr{ligne['url_dossier']}")
    rubriques = []
    for e in racine:
        if e.tag.endswith("Dto"):
            valeurs = contenu(e) or {}
            neant = valeurs.pop("neant", "false") == "true" if isinstance(valeurs, dict) else False
            rubriques.append({"rubrique": e.tag, "ordre": 0, "neant": neant, "contenu": valeurs or {}})
    yield Dependants("rubrique_declaree", {"declaration_id": ident}, rubriques, "/declaration")


def telecharger(ctx, cache, lignes_):
    (cache / "declarations").mkdir(parents=True, exist_ok=True)
    gardees, absentes = [], []
    for l in lignes_:
        # noms de fichiers accentués (« ñ ») : l'URL doit être encodée
        f = Fichier(f"declarations/{l['open_data']}", f"{DOSSIERS}/{quote(l['open_data'])}")
        if not (cache / f.nom).exists() or ctx.retelecharger:
            try:
                f.recuperer(cache, ctx.retelecharger)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                absentes.append((l, f))
                continue
            finally:
                time.sleep(PAUSE)
        gardees.append((l, f))
    return gardees, absentes


def executer(ctx):
    from ..an import travaux
    chemin = ctx.fichier(LISTE.nom)
    cache = chemin.parent
    gardees, absentes = telecharger(ctx, cache, lignes(chemin))
    with ctx.registre.transaction():
        for l, f in absentes:
            revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                "document_non_publie", f"document_non_publie:hatvp:{l['open_data']}", "constat",
                f"Déclaration de {l['prenom']} {l['nom']} annoncée par la liste HATVP mais introuvable",
                contexte={"url": f.url}), None, ctx.bilan)
    annuaire = travaux.annuaire(ctx)

    def docs():
        for l, f in gardees:
            yield Document(f, f.nom, (cache / f.nom).read_bytes(), l["open_data"], l)

    charger(ctx, Flux(Systeme.HATVP, LICENCE, docs, lambda d: declaration(d, annuaire)))


ETAPE = Etape("hatvp.declarations", executer, apres=("an.acteurs", "senat.senateurs"), sources=lambda p: [LISTE],
              description="déclarations publiées des députés, sénateurs et membres du Gouvernement (HATVP)")
