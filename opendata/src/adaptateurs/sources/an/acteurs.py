"""AMO30 : organes, acteurs et leurs mandats datés (députés, Gouvernement, commissions, groupes…).

Ne charge ni les groupes d'amitié et d'études (GA, GE, GEVI : environ 80 000 mandats sans usage
dans l'application) ni les organes « circonscription » (lieux, pas institutions). Ni date ni
lieu de naissance : rien ne les demande et ce ne sont jamais des clés.
"""

import re

from ....chargement import Document, Flux, charger
from ....domaine import IdentiteNative, Methode
from ....domaine.objets import Dependants, Objet, Rapprochement
from ....etl import Etape
from .commun import LICENCE, Systeme, an, documents, fichier, jour, liste, lire, val

ACTEURS = fichier("acteurs.json.zip", "amo/tous_acteurs_mandats_organes_xi_legislature/"
                                      "AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip")
IGNORES = {"CIRCONSCRIPTION", "GA", "GE", "GEVI"}
OUTRE_MER = {"975", "977", "978", "984", "986", "987", "988", "989"}     # codes COMER de l'INSEE

# codeType de l'AMO -> type d'organisation canonique
TYPES_ORGANE = {
    "ASSEMBLEE": "assemblee", "SENAT": "assemblee", "GP": "groupe_politique", "GROUPESENAT": "groupe_politique",
    "PARPOL": "parti", "COMPER": "commission", "COMSPSENAT": "commission", "COMSENAT": "commission",
    "COMNL": "commission", "CNPE": "commission_enquete", "CNPS": "commission", "CMP": "cmp",
    "GOUVERNEMENT": "gouvernement", "MINISTERE": "ministere", "MISINFO": "mission", "MISINFOCOM": "mission",
    "MISINFOPRE": "mission", "DELEG": "delegation", "DELEGBUREAU": "delegation", "DELEGSENAT": "delegation",
    "OFFPAR": "office", "BUREAU": "bureau", "PRESREP": "presidence", "CONSTITU": "juridiction",
    "HCJ": "juridiction", "CJR": "juridiction",
}
SENAT = {"SENAT", "GROUPESENAT", "COMSPSENAT", "COMSENAT", "DELEGSENAT"}
# typeOrgane d'un mandat -> type de fonction canonique
TYPES_FONCTION = {
    "ASSEMBLEE": "depute", "SENAT": "senateur", "GOUVERNEMENT": "membre_gouvernement",
    "MINISTERE": "membre_gouvernement", "GP": "membre_groupe", "GROUPESENAT": "membre_groupe",
    "CMP": "membre_cmp", "COMPER": "membre_commission", "COMSPSENAT": "membre_commission",
    "COMSENAT": "membre_commission", "COMNL": "membre_commission", "CNPE": "membre_commission",
    "CNPS": "membre_commission", "BUREAU": "bureau", "PRESREP": "presidence",
}


def uid(x) -> str:
    return val(x) if not isinstance(x, dict) else x["#text"]


def chambre(code: str) -> str | None:
    if code in SENAT:
        return "SENAT"
    return "AN" if code not in ("GOUVERNEMENT", "MINISTERE", "PRESREP", "CONSTITU", "HCJ", "CJR",
                                "ORGEXTPARL", "PARPOL", "API", "CONFPT") else None


def organe(doc: Document) -> Objet | None:
    o = lire(doc)["organe"]
    code = o.get("codeType")
    if code in IGNORES:
        return None
    vimode = o.get("viMoDe") or {}
    return Objet("organisation", an("organe", o["uid"]), {
        "type": TYPES_ORGANE.get(code, "autre"), "type_source": code, "nom": o["libelle"],
        "nom_court": val(o.get("libelleAbrege")), "abrege": val(o.get("libelleAbrev")),
        "couleur": val(o.get("couleurAssociee")), "chambre": chambre(code), "legislature": val(o.get("legislature")),
        "debut": jour(vimode.get("dateDebut")), "fin": jour(vimode.get("dateFin")),
        "parent_id": an("organe", val(o.get("organeParent")))}, "/organe")


def titre(m: dict, organes: dict[str, str]) -> tuple[str, str | None]:
    """Libellé lisible d'une fonction et son territoire (« Député, Essonne, 4e circonscription »)."""
    infos = m.get("infosQualite") or {}
    qualite = infos.get("libQualiteSex") or infos.get("libQualite")
    refs = liste((m.get("organes") or {}).get("organeRef"))
    nom_organe = organes.get(refs[0]) if refs else None
    if m["typeOrgane"] == "ASSEMBLEE":
        lieu = ((m.get("election") or {}).get("lieu") or {})
        territoire = ", ".join(x for x in (val(lieu.get("departement")),
                                           f"{val(lieu.get('numCirco'))}e circonscription" if val(lieu.get("numCirco"))
                                           else None) if x) or None
        return (qualite or "Député") + (f", {territoire}" if territoire else ""), territoire
    return " — ".join(x for x in (qualite, nom_organe) if x) or m["typeOrgane"], None


def acteur(doc: Document, organes: dict[str, str]):
    a = lire(doc)["acteur"]
    pa = uid(a["uid"])
    ident = a["etatCivil"]["ident"]
    prenom, nom = val(ident.get("prenom")), val(ident.get("nom"))
    yield Objet("personne", an("acteur", pa), {
        "civilite": val(ident.get("civ")), "prenom": prenom, "nom": nom,
        "nom_affiche": " ".join(x for x in (prenom, nom) if x)}, "/acteur/etatCivil",
        f"https://www.assemblee-nationale.fr/dyn/deputes/{pa}")
    # L'AMO cite la fiche Sénat de la personne (adresse type 23, « Url sénateur »), donc son
    # matricule : référence explicite, même personne (une fiche sénateur existante est fusionnée).
    if matricule := fiche_senat(a):
        yield Rapprochement("personne", an("acteur", pa), IdentiteNative(Systeme.SENAT, "senateur", matricule),
                            Methode.EXPLICIT_REFERENCE, {"champ": "adresses/adresse[type=23]/valElec",
                                                         "matricule": matricule},
                            f"https://www.senat.fr/senateur/{matricule.lower()}.html")
    for i, m in enumerate(liste((a.get("mandats") or {}).get("mandat"))):
        if m["typeOrgane"] in IGNORES:
            continue
        refs = liste((m.get("organes") or {}).get("organeRef"))
        texte, territoire = titre(m, organes)
        mandature = m.get("mandature") or {}
        yield Objet("fonction", an("mandat", m["uid"]), {
            "personne_id": an("acteur", pa),
            "organisation_id": an("organe", refs[0]) if refs and refs[0] in organes else None,
            "type": TYPES_FONCTION.get(m["typeOrgane"], "autre"), "titre": texte,
            "qualite": (m.get("infosQualite") or {}).get("libQualite"),
            # Pour un député, la prise de fonction est la vraie entrée en séance (un ministre
            # réélu ne siège qu'à la fin de ses fonctions gouvernementales).
            "debut": jour(mandature.get("datePriseFonction")) or jour(m.get("dateDebut")),
            "fin": jour(m.get("dateFin")), "territoire": territoire, "legislature": val(m.get("legislature"))},
            f"/acteur/mandats/mandat/{i}")
        # Département d'élection d'un député : code INSEE publié par l'AMO (référence explicite).
        lieu = ((m.get("election") or {}).get("lieu") or {}) if m["typeOrgane"] == "ASSEMBLEE" else {}
        if code := val(lieu.get("numDepartement")):
            # 975, 977, 986, 987, 988… : collectivités d'outre-mer (fichier COMER de l'INSEE) ;
            # 099 (Français établis hors de France) n'est pas un territoire du COG : constat en revue.
            nature = "collectivite_outre_mer" if code in OUTRE_MER else "departement"
            yield Dependants("lien", {"de_id": an("mandat", m["uid"]), "nature": "territoire"},
                             [{"vers_id": IdentiteNative(Systeme.INSEE, nature, code), "ordre": 0,
                               "attributs": {"circonscription": val(lieu.get("numCirco"))}}],
                             f"/acteur/mandats/mandat/{i}/election/lieu", ("vers_id",))


def executer(ctx):
    chemin = ctx.fichier(ACTEURS.nom)
    organes = {}
    for doc in documents(ACTEURS, chemin, "organe/"):
        o = lire(doc)["organe"]
        if o.get("codeType") not in IGNORES:
            organes[o["uid"]] = o["libelle"]
    ctx.artefacts["an.organes"] = organes

    def prealable_organe(doc):
        o = organe(doc)
        return [(o.type, o.identite)] if o else []

    charger(ctx, Flux(Systeme.AN, LICENCE, lambda: documents(ACTEURS, chemin, "organe/"),
                      lambda doc: [o for o in [organe(doc)] if o], prealable_organe),
            Flux(Systeme.AN, LICENCE, lambda: documents(ACTEURS, chemin, "acteur/"),
                 lambda doc: acteur(doc, organes)))


ETAPE = Etape("an.acteurs", executer, apres=("insee.territoires",), sources=lambda p: [ACTEURS],
              description="organes, personnes et fonctions datées (AMO30), hors groupes d'amitié et d'études")


def iso(x) -> str | None:
    return str(d) if (d := jour(x)) else None


def fiche_senat(a: dict) -> str | None:
    """Matricule du Sénat cité par l'adresse « Url sénateur » (type 23) d'un acteur :
    « https://www.senat.fr/senateur/baude_veronique21674d.html » -> « 21674D »."""
    for x in liste((a.get("adresses") or {}).get("adresse")):
        m = re.search(r"(\d{4}[0-9a-z]{2})\.html$", val(x.get("valElec")) or "")
        if val(x.get("type")) == "23" and m:
            return m.group(1).upper()
    return None


def annuaire(chemin) -> dict[str, list[dict]]:
    """Nom normalisé (« prenom nom ») -> acteurs qui le portent, avec des indices pour la revue
    (député, membre du Gouvernement, dates des mandats de député, fiche Sénat citée). Sert à
    PROPOSER des candidats, jamais à décider."""
    from ....noms import normaliser
    index: dict[str, list[dict]] = {}
    for doc in documents(ACTEURS, chemin, "acteur/"):
        a = lire(doc)["acteur"]
        ident = a["etatCivil"]["ident"]
        nom = " ".join(x for x in (val(ident.get("prenom")), val(ident.get("nom"))) if x)
        mandats = liste((a.get("mandats") or {}).get("mandat"))
        types = {m["typeOrgane"] for m in mandats}
        index.setdefault(normaliser(nom), []).append({
            "acteur": uid(a["uid"]), "libelle": nom, "depute": "ASSEMBLEE" in types,
            "membre_gouvernement": bool(types & {"GOUVERNEMENT", "MINISTERE"}),
            # début (élection), prise de fonction et fin de chaque mandat de député, en ISO
            "mandats_depute": [{"debut": iso(m.get("dateDebut")),
                                "prise_de_fonction": iso((m.get("mandature") or {}).get("datePriseFonction")),
                                "fin": iso(m.get("dateFin"))} for m in mandats if m["typeOrgane"] == "ASSEMBLEE"],
            "fiche_senat": fiche_senat(a)})
    return index
