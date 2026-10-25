"""Code officiel géographique (INSEE, millésime 2026) : régions, départements, collectivités
d'outre-mer, communes,
communes déléguées et associées, arrondissements municipaux, reliés à leur parent.

Le référentiel des territoires pour l'entrée « mon territoire » : tous les liens passent par des
codes officiels (INSEE), jamais par des noms. Une commune déléguée peut porter le même code que sa
commune nouvelle : le type fait partie de l'identité (`INSEE:commune_deleguee:01001`).
"""

import csv
import io

from ....chargement import Flux, charger
from ....domaine import IdentiteNative, Systeme
from ....domaine.objets import Objet
from ....etl import Etape, Fichier
from ..senat.commun import document_ligne

LICENCE = "Licence Ouverte / Etalab 2.0"
COG = "https://www.insee.fr/fr/statistiques/fichier/8740222"
REGIONS = Fichier("v_region_2026.csv", f"{COG}/v_region_2026.csv")
DEPARTEMENTS = Fichier("v_departement_2026.csv", f"{COG}/v_departement_2026.csv")
COMMUNES = Fichier("v_commune_2026.csv", f"{COG}/v_commune_2026.csv")
OUTRE_MER = Fichier("v_comer_2026.csv", f"{COG}/v_comer_2026.csv")
TYPES = {"COM": "commune", "COMD": "commune_deleguee", "COMA": "commune_associee", "ARM": "arrondissement_municipal"}


def insee(type_source: str, code: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.INSEE, type_source, code) if code else None


def lignes(chemin) -> list[dict]:
    return list(csv.DictReader(io.StringIO(chemin.read_text(encoding="utf-8"))))


def region(doc):
    l = doc.donnees
    yield Objet("organisation", insee("region", l["REG"]), {
        "type": "region", "type_source": "REG", "nom": l["LIBELLE"], "abrege": l["REG"]}, f"/region/{l['REG']}")


def departement(doc):
    l = doc.donnees
    yield Objet("organisation", insee("departement", l["DEP"]), {
        "type": "departement", "type_source": "DEP", "nom": l["LIBELLE"], "abrege": l["DEP"],
        "parent_id": insee("region", l["REG"])}, f"/departement/{l['DEP']}")


def outre_mer(doc):
    l = doc.donnees
    yield Objet("organisation", insee("collectivite_outre_mer", l["COMER"]), {
        "type": "collectivite_outre_mer", "type_source": "COMER", "nom": l["LIBELLE"], "abrege": l["COMER"]},
        f"/comer/{l['COMER']}")


def commune(doc):
    l = doc.donnees
    type_ = TYPES[l["TYPECOM"]]
    # commune : rattachée à son département ; déléguée, associée, arrondissement : à sa commune
    parent = insee("commune", l["COMPARENT"]) if l["COMPARENT"] else insee("departement", l["DEP"])
    yield Objet("organisation", insee(type_, l["COM"]), {
        "type": type_, "type_source": l["TYPECOM"], "nom": l["LIBELLE"], "abrege": l["COM"], "parent_id": parent},
        f"/commune/{l['TYPECOM']}/{l['COM']}")


def executer(ctx):
    regions, departements, communes, comer = (lignes(ctx.fichier(f.nom))
                                               for f in (REGIONS, DEPARTEMENTS, COMMUNES, OUTRE_MER))
    docs = lambda f, rows, cle: (lambda: (document_ligne(f, f.nom, cle(l), l) for l in rows))
    ident = lambda type_, cle: (lambda d: [("organisation", insee(type_(d.donnees), cle(d.donnees)))])
    charger(ctx,
            Flux(Systeme.INSEE, LICENCE, docs(REGIONS, regions, lambda l: l["REG"]), region,
                 ident(lambda l: "region", lambda l: l["REG"])),
            Flux(Systeme.INSEE, LICENCE, docs(DEPARTEMENTS, departements, lambda l: l["DEP"]), departement,
                 ident(lambda l: "departement", lambda l: l["DEP"])),
            Flux(Systeme.INSEE, LICENCE, docs(OUTRE_MER, comer, lambda l: l["COMER"]), outre_mer,
                 ident(lambda l: "collectivite_outre_mer", lambda l: l["COMER"])),
            Flux(Systeme.INSEE, LICENCE, docs(COMMUNES, communes, lambda l: f"{l['TYPECOM']}:{l['COM']}"), commune,
                 ident(lambda l: TYPES[l["TYPECOM"]], lambda l: l["COM"])))


ETAPE = Etape("insee.territoires", executer, sources=lambda p: [REGIONS, DEPARTEMENTS, COMMUNES, OUTRE_MER],
              description="code officiel géographique : régions, départements, communes (INSEE 2026)")
ETAPES = [ETAPE]
