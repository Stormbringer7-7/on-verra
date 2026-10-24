"""Répertoire national des élus (RNE, ministère de l'Intérieur, data.gouv.fr) : une fiche par mandat.

Le RNE ne publie aucun identifiant de personne. Chaque ligne devient une fiche `mandat_rne`, telle
que publiée, identifiée par une clé locale (cf. `cle`) : elle s'affiche et se cherche tout de suite,
« selon le RNE ». Elle est reliée à son territoire par les codes officiels publiés (commune et
département INSEE, SIREN de l'EPCI).

Relier une fiche à une personne (deux mandats d'une même personne, un maire qui est aussi député)
passe toujours par la revue humaine : cas `elu_local`, avec les homonymes comme candidats (AN,
Sénat, personnes déjà établies par une revue) et les autres mandats homonymes du département en
contexte. La date de naissance publiée est retirée dès la lecture : ni clé, ni indice, ni stockée
(docs/rapprochements.md).
"""

import csv
import io
import json
import re
import urllib.error

from ....chargement import Flux, charger
from ....domaine import IdentiteNative, Systeme
from ....domaine.objets import Candidat, CasRevue, Objet
from ....etl import Etape, Fichier
from ....noms import normaliser
from ..senat.commun import document_ligne

LICENCE = "Licence Ouverte / Etalab 2.0"
API = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/"
PRIVE = ("Date de naissance",)
NOM, PRENOM = "Nom de l'élu", "Prénom de l'élu"
OUTRE_MER = ("975", "977", "978", "984", "986", "987", "988", "989")   # communes des COM : hors COG chargé

# fichier en cache -> (type de mandat, motif du titre de la ressource data.gouv)
FICHIERS = {
    "elus_maires_mai_csv.csv": ("maire", r"maires"),
    "elus_conseillers_communautaires_epci_csv.csv": ("conseiller_communautaire", r"communautaires"),
    "elus_deputes_dep_csv.csv": ("depute", r"d[ée]put[ée]s"),
    "elus_senateurs_sen_csv.csv": ("senateur", r"s[ée]nateurs"),
    "elus_representants_parlement_europ_en_rpe_csv.csv": ("representant_parlement_europeen", r"europ"),
}
TYPE_DE = {nom: type_ for nom, (type_, _) in FICHIERS.items()}


_RESOLUS: dict[str, Fichier] = {}


def fichiers(_parametres=None) -> list[Fichier]:
    """Les URLs changent à chaque livraison : résolues par l'API data.gouv. Hors ligne, on garde
    les noms du cache (l'URL ne sert alors qu'à la provenance)."""
    from ....inventaire.catalogue import _lire
    if _RESOLUS:
        return list(_RESOLUS.values())
    try:
        ressources = json.loads(_lire(API))["resources"]
    except (urllib.error.URLError, OSError):
        return [Fichier(nom, API) for nom in FICHIERS]
    trouves = {}
    for r in ressources:
        if r.get("format", "").lower() != "csv":
            continue
        for nom, (_, motif) in FICHIERS.items():
            if re.search(motif, r.get("title", ""), re.I) and nom not in trouves:
                trouves[nom] = Fichier(nom, r["url"])
    _RESOLUS.update({nom: trouves.get(nom, Fichier(nom, API)) for nom in FICHIERS})
    return list(_RESOLUS.values())


def rne(type_source: str, id_: str) -> IdentiteNative:
    return IdentiteNative(Systeme.RNE, type_source, id_)


def insee(type_source: str, code: str | None) -> IdentiteNative | None:
    return IdentiteNative(Systeme.INSEE, type_source, code) if code else None


def lignes(chemin) -> list[dict]:
    """Lignes du CSV, sans les colonnes privées (jamais lues plus loin, jamais stockées)."""
    return [{k: v for k, v in l.items() if k not in PRIVE}
            for l in csv.DictReader(io.StringIO(chemin.read_text(encoding="utf-8")), delimiter=";")]


def _n(x: str) -> str:
    return normaliser(x).replace(" ", "-")


def cle(type_: str, l: dict) -> str:
    """Clé locale d'une ligne (pas un identifiant de personne). Le siège suffit quand il n'a qu'un
    titulaire à une date : maire (commune, début de fonction), député (circonscription, début de
    mandat). Sinon le nom publié s'y ajoute : il n'y a rien d'autre pour distinguer deux élus."""
    nom = f"{_n(l[NOM])}:{_n(l[PRENOM])}"
    if type_ == "maire":
        return f"maire:{l['Code de la commune']}:{l['Date de début de la fonction']}"
    if type_ == "depute":
        return f"depute:{l['Code de la circonscription législative']}:{l['Date de début du mandat']}"
    if type_ == "conseiller_communautaire":
        return (f"conseiller_communautaire:{l['N° SIREN']}:{l['Code de la commune de rattachement']}:"
                f"{l['Date de début du mandat']}:{nom}")
    if type_ == "senateur":
        return f"senateur:{l['Code du département']}:{l['Date de début du mandat']}:{nom}"
    return f"{type_}:{l['Date de début du mandat']}:{nom}"


def commune(code: str | None) -> IdentiteNative | None:
    return None if not code or code.startswith(OUTRE_MER) else insee("commune", code)


def nom_complet(l: dict) -> str:
    return f"{l[PRENOM]} {l[NOM]}".strip()


def valeurs(type_: str, l: dict) -> dict:
    v = {"type_mandat": type_, "nom": l[NOM], "prenom": l[PRENOM] or None,
         "nom_affiche": nom_complet(l), "sexe": l["Code sexe"] or None,
         "categorie_socio_pro": l["Libellé de la catégorie socio-professionnelle"] or None,
         "fonction": l.get("Libellé de la fonction") or ("Maire" if type_ == "maire" else None),
         "organisation_id": None, "commune_id": None,
         "departement_id": insee("departement", l.get("Code du département")),
         "territoire": None, "circonscription": None,
         "debut_mandat": l["Date de début du mandat"] or None,
         "debut_fonction": l.get("Date de début de la fonction") or None,
         "personne_id": None}                  # posé par la revue seulement (cas elu_local)
    if type_ == "maire":
        v.update(organisation_id=commune(l["Code de la commune"]), territoire=l["Libellé de la commune"])
    elif type_ == "conseiller_communautaire":
        v.update(organisation_id=insee("siren", l["N° SIREN"]), territoire=l["Libellé de l'EPCI"],
                 commune_id=commune(l["Code de la commune de rattachement"]))
    elif type_ == "depute":
        v.update(circonscription=l["Code de la circonscription législative"],
                 territoire=f"{l['Libellé du département']}, {l['Libellé de la circonscription législative']}")
    elif type_ == "senateur":
        v.update(territoire=l["Libellé du département"])
    return v


class Annuaire:
    """Qui porte ce nom ailleurs : pour PROPOSER des candidats en revue, jamais pour décider."""

    def __init__(self, an: dict, senat: dict, etablies: dict, sieges_an: dict, rne: dict):
        self.an, self.senat, self.etablies, self.sieges_an, self.rne = an, senat, etablies, sieges_an, rne

    def candidats(self, type_: str, l: dict) -> tuple[Candidat, ...]:
        nom = normaliser(nom_complet(l))
        siege = self.sieges_an.get((l.get("Code de la circonscription législative"), l["Date de début du mandat"])) \
            if type_ == "depute" else None
        resultat = [Candidat("personne", IdentiteNative(Systeme.AN, "acteur", c["acteur"]), c["libelle"],
                             {"depute": c["depute"], "membre_gouvernement": c["membre_gouvernement"],
                              **({"meme_siege_meme_date": True} if c["acteur"] == siege else {})})
                    for c in self.an.get(nom, [])]
        resultat += [Candidat("personne", IdentiteNative(Systeme.SENAT, "senateur", c["matricule"]), c["libelle"],
                              {"senateur": True, "etat": c["etat"]}) for c in self.senat.get(nom, [])]
        resultat += [Candidat("personne", IdentiteNative(*c["identite"].split(":", 2)), c["libelle"],
                              {"etablie_par_revue": c["cas"]}) for c in self.etablies.get(nom, [])]
        return tuple(resultat)

    def homonymes(self, type_: str, l: dict, cle_: str) -> list[str]:
        """Autres mandats RNE au même nom, dans le même département (partout pour un eurodéputé)."""
        nom = normaliser(nom_complet(l))
        dep = l.get("Code du département") if type_ != "representant_parlement_europeen" else None
        return [c["cle"] for c in self.rne.get(nom, []) if c["cle"] != cle_ and (dep is None or c["dep"] in (dep, None))]


def mandat(doc, annuaire: Annuaire):
    type_, l = TYPE_DE[doc.fichier.nom], doc.donnees
    cle_ = doc.id_source
    ident = rne("mandat", cle_)
    v = valeurs(type_, l)
    yield Objet("mandat_rne", ident, v, f"/{doc.chemin}")
    candidats = annuaire.candidats(type_, l)
    homonymes = annuaire.homonymes(type_, l, cle_)
    if not candidats and not homonymes:
        return                                 # personne d'autre ne porte ce nom : fiche seule
    parlementaire = any(c.identite.systeme in (Systeme.AN, Systeme.SENAT) for c in candidats)
    yield CasRevue(
        "elu_local", f"elu_local:{cle_}", "champ",
        f"{v['nom_affiche']} ({type_.replace('_', ' ')}, {v['territoire'] or 'France'}) : "
        f"{len(candidats)} personne(s) homonyme(s), {len(homonymes)} autre(s) mandat(s) RNE homonyme(s)",
        champ="personne_id", cibles=(("mandat_rne", ident),), candidats=candidats,
        contexte={"type_mandat": type_, "territoire": v["territoire"], "fonction": v["fonction"],
                  "debut_mandat": v["debut_mandat"], "mandats_homonymes": homonymes,
                  "priorite": 1 if parlementaire else 2,
                  "si_aucun": {"type": "personne", "identite": str(rne("personne", cle_)), "valeurs": {
                      "prenom": v["prenom"], "nom": v["nom"], "nom_affiche": v["nom_affiche"]}}})


def epci(doc):
    l = doc.donnees
    yield Objet("organisation", insee("siren", l["N° SIREN"]), {
        "type": "epci", "type_source": "EPCI", "nom": l["Libellé de l'EPCI"], "abrege": l["N° SIREN"]},
        f"/{doc.chemin}")


def personnes_etablies(entrepot) -> dict[str, list[dict]]:
    """Personnes créées par une revue « aucun » sur un cas elu_local : candidates pour les autres."""
    index = {}
    for c in entrepot.cas_revue("elu_local"):
        if c["decision"] and c["decision"].get("choix") is None and c["statut"] == "APPLIQUE":
            creer = c["contexte"]["si_aucun"]
            index.setdefault(normaliser(creer["valeurs"]["nom_affiche"]), []).append(
                {"identite": creer["identite"], "libelle": f"{creer['valeurs']['nom_affiche']} (établie par revue)",
                 "cas": c["cle"]})
    return index


def annuaire_senat(chemin) -> dict[str, list[dict]]:
    from ..senat.commun import lignes_csv
    index = {}
    for l in lignes_csv(chemin):
        nom = f"{l['Prénom usuel']} {l['Nom usuel']}"
        index.setdefault(normaliser(nom), []).append({"matricule": l["Matricule"], "libelle": nom,
                                                      "etat": l.get("État") or l.get("État Sénateur")})
    return index


def sieges_an(chemin) -> dict[tuple[str, str], str]:
    """(circonscription « 0101 », date de prise de fonction) -> acteur AN : un indice pour la revue
    (même siège, même date), pas une preuve : le RNE ne cite aucun identifiant AN."""
    from ..an.acteurs import ACTEURS, documents, liste, lire, uid, val
    sieges = {}
    for doc in documents(ACTEURS, chemin, "acteur/"):
        a = lire(doc)["acteur"]
        for m in liste((a.get("mandats") or {}).get("mandat")):
            lieu = ((m.get("election") or {}).get("lieu") or {}) if m["typeOrgane"] == "ASSEMBLEE" else {}
            dep, circo = val(lieu.get("numDepartement")), val(lieu.get("numCirco"))
            prise = val((m.get("mandature") or {}).get("datePriseFonction"))
            if dep and circo and prise:
                sieges[(f"{dep.zfill(2)}{int(circo):02d}", prise[:10])] = uid(a["uid"])
    return sieges


def executer(ctx):
    from ..an import acteurs, travaux
    from ..senat import senateurs
    par_fichier = {nom: lignes(ctx.fichier(nom)) for nom in FICHIERS}
    index_rne = {}
    for nom, rows in par_fichier.items():
        for l in rows:
            index_rne.setdefault(normaliser(nom_complet(l)), []).append(
                {"cle": cle(TYPE_DE[nom], l), "dep": l.get("Code du département") or None})
    annuaire = Annuaire(travaux.annuaire(ctx), annuaire_senat(ctx.fichier(senateurs.GENERAL.nom)),
                        personnes_etablies(ctx.entrepot), sieges_an(ctx.fichier(acteurs.ACTEURS.nom)), index_rne)

    def flux(nom):
        f = _RESOLUS.get(nom) or Fichier(nom, API)
        return Flux(Systeme.RNE, LICENCE,
                    lambda: (document_ligne(f, nom, cle(TYPE_DE[nom], l), l) for l in par_fichier[nom]),
                    lambda d: mandat(d, annuaire))

    # Un EPCI par SIREN (le SIREN et le libellé sont répétés sur chaque ligne de conseiller).
    nom_epci = "elus_conseillers_communautaires_epci_csv.csv"
    f_epci = _RESOLUS.get(nom_epci) or Fichier(nom_epci, API)
    epcis = {l["N° SIREN"]: {"N° SIREN": l["N° SIREN"], "Libellé de l'EPCI": l["Libellé de l'EPCI"]}
             for l in par_fichier[nom_epci] if l["N° SIREN"]}
    charger(ctx, Flux(Systeme.RNE, LICENCE, lambda: (document_ligne(f_epci, "epci", s, l) for s, l in epcis.items()),
                      epci), *(flux(nom) for nom in FICHIERS))


ETAPE = Etape("rne.elus", executer, apres=("insee.territoires", "an.acteurs", "senat.senateurs"),
              sources=fichiers,
              description="élus locaux et parlementaires tels que publiés par le RNE : une fiche par mandat")
ETAPES = [ETAPE]
