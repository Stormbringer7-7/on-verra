"""Sénateurs : personnes (matricule), mandats sénatoriaux et appartenances aux groupes, datés.

Ni date de naissance ni adresse électronique : rien ne les demande et ce ne sont jamais des clés.

Anciens mandats de député (ODSEN_ELUDEP) : le Sénat ne cite aucun identifiant AN. Chaque sénateur
ancien député part en revue (`identite_senateur_ancien_depute`) avec pour candidats les acteurs AN
homonymes et ceux dont l'AMO cite la fiche Sénat ; la concordance des dates de mandat et la fiche
citée sont des indices, jamais des preuves. Sénateur et acteur AN étant deux entités `personne`
déjà créées, la décision « même personne » s'applique par une fusion d'entités.
"""

from ....chargement import Document, Flux, charger
from ....domaine import IdentiteNative
from ....domaine.objets import Candidat, CasRevue, Objet
from ....etl import Etape, Fichier
from ....noms import normaliser
from .commun import DONNEES, LICENCE, Systeme, document_ligne, jour, lignes_csv, senat

GENERAL = Fichier("senateurs.csv", f"{DONNEES}/senateurs/ODSEN_GENERAL.csv")
MANDATS = Fichier("elusen.csv", f"{DONNEES}/senateurs/ODSEN_ELUSEN.csv")
GROUPES = Fichier("histogroupes.csv", f"{DONNEES}/senateurs/ODSEN_HISTOGROUPES.csv")
ANCIENS_DEPUTES = Fichier("eludep.csv", f"{DONNEES}/senateurs/ODSEN_ELUDEP.csv")
DEBUT_AMO = "2002-06-19"                       # premier mandat de député publié par l'AMO30 (12e législature)
SENAT = senat("organe", "SENAT")


def docs(f: Fichier, chemin, cle: str):
    return lambda: (document_ligne(f, f.nom, ligne[cle], ligne) for ligne in lignes_csv(chemin))


def senateur(doc: Document):
    ligne = doc.donnees
    prenom, nom = ligne["Prénom usuel"], ligne["Nom usuel"]
    mat = ligne["Matricule"]
    yield Objet("personne", senat("senateur", mat), {
        "civilite": ligne["Qualité"], "prenom": prenom, "nom": nom, "nom_affiche": f"{prenom} {nom}"},
        f"/{doc.chemin}", f"https://www.senat.fr/senateur/{mat.lower()}.html")


def mandat(doc: Document):
    ligne = doc.donnees
    yield Objet("fonction", senat("mandat_senateur", ligne["Identifiant mandat"]), {
        "personne_id": senat("senateur", ligne["Matricule"]), "organisation_id": SENAT, "type": "senateur",
        "titre": "Sénatrice" if ligne["Qualité"].startswith(("Mme", "Mlle")) else "Sénateur",
        "qualite": ligne["Motif début de mandat"] or None,
        "debut": jour(ligne["Date de début de mandat"]), "fin": jour(ligne["Date de fin de mandat"])},
        f"/{doc.chemin}")


def groupe(doc: Document):
    """Un groupe par code, sous le nom de sa période la plus récente (le nom change dans le temps)."""
    ligne = doc.donnees
    yield Objet("organisation", senat("groupe", ligne["Code du groupe politique"]), {
        "type": "groupe_politique", "type_source": "GROUPESENAT", "nom": ligne["Nom court du groupe politique"],
        "abrege": ligne["Code du groupe politique"], "chambre": "SENAT"}, f"/{doc.chemin}")


def groupes_recents(chemin) -> list[dict]:
    recents = {}
    for ligne in lignes_csv(chemin):
        code = ligne["Code du groupe politique"]
        if code not in recents or ligne["Date de début d'appartenance"] > recents[code]["Date de début d'appartenance"]:
            recents[code] = ligne
    return list(recents.values())


def appartenance(doc: Document):
    ligne = doc.donnees
    code = ligne["Code du groupe politique"]
    # Une appartenance porte des fonctions successives (membre, puis président…) : l'identité est
    # la fonction occupée, avec ses propres dates.
    yield Objet("fonction", senat("fonction_groupe", ligne["Id fonction occupée"]), {
        "personne_id": senat("senateur", ligne["Matricule"]), "organisation_id": senat("groupe", code),
        "type": "membre_groupe", "titre": f"{ligne['Nom court fonction']} — {ligne['Nom court du groupe politique']}",
        "qualite": ligne["Nom court fonction"], "debut": jour(ligne["Date de début de la fonction"]),
        "fin": jour(ligne["Date de fin de la fonction"])}, f"/{doc.chemin}")


def assemblee(_):
    yield Objet("organisation", SENAT, {"type": "assemblee", "type_source": "SENAT", "nom": "Sénat",
                                        "chambre": "SENAT"}, "")


def anciens_deputes(chemin) -> list[dict]:
    """Une ligne par sénateur : ses mandats de député (une ligne ELUDEP par fonction occupée)."""
    par_matricule: dict[str, dict] = {}
    for ligne in lignes_csv(chemin):
        s = par_matricule.setdefault(ligne["Matricule"], {
            "Matricule": ligne["Matricule"], "Qualité": ligne["Qualité"], "Nom usuel": ligne["Nom usuel"],
            "Prénom usuel": ligne["Prénom usuel"], "mandats": {}})
        m = s["mandats"].setdefault(ligne["Identifiant mandat"], {
            "identifiant": ligne["Identifiant mandat"],
            "debut": str(d) if (d := jour(ligne["Date de début de mandat"])) else None,
            "fin": str(d) if (d := jour(ligne["Date de fin de mandat"])) else None,
            # mandats anciens : seules les années sont publiées
            "annee_debut": ligne["Année de début de mandat"] or None, "annee_fin": ligne["Année de fin de mandat"] or None,
            "fonctions": []})
        m["fonctions"].append(ligne["Fonction"])
    return [{**s, "mandats": list(s["mandats"].values())} for s in par_matricule.values()]


def fiches_citees(annuaire: dict) -> dict[str, list[dict]]:
    """Matricule Sénat -> acteurs AN dont l'AMO cite la fiche Sénat (« Url sénateur »)."""
    index: dict[str, list[dict]] = {}
    for acteurs in annuaire.values():
        for a in acteurs:
            if a.get("fiche_senat"):
                index.setdefault(a["fiche_senat"], []).append(a)
    return index


def chevauche(eludep: dict, amo: dict) -> bool:
    debut = amo["prise_de_fonction"] or amo["debut"]
    return bool(debut) and debut <= (eludep["fin"] or "9999") and (amo["fin"] or "9999") >= eludep["debut"]


def ancien_depute(doc: Document, annuaire: dict, fiches: dict | None = None):
    """Sénateur ancien député : quel acteur AN est-ce ? Candidats : homonymes de l'AMO.
    Si l'AMO cite la fiche Sénat d'un acteur, c'est une référence explicite : l'étape `an.acteurs`
    relie déjà les deux (fusion), rien à revoir ici. Aucun candidat (mandats antérieurs à l'AMO) :
    rien à revoir non plus."""
    s = doc.donnees
    mat, nom = s["Matricule"], f"{s['Prénom usuel']} {s['Nom usuel']}"
    homonymes = {a["acteur"]: a for a in annuaire.get(normaliser(nom), [])}
    cites = {a["acteur"]: a for a in (fiches if fiches is not None else fiches_citees(annuaire)).get(mat, [])}
    if cites or not homonymes:
        return
    mandats = s["mandats"]
    comparables = [m for m in mandats if m["debut"] and m["debut"] >= DEBUT_AMO]
    candidats = []
    for pa, a in sorted({**homonymes, **cites}.items()):
        amo = a.get("mandats_depute", [])
        debuts_an = {d for x in amo for d in (x["debut"], x["prise_de_fonction"]) if d}
        candidats.append(Candidat("personne", IdentiteNative(Systeme.AN, "acteur", pa), a["libelle"], {
            "homonyme": pa in homonymes, "fiche_senat_citee": pa in cites, "depute": a["depute"],
            # mandats ELUDEP datés depuis le début de l'AMO : même date de début (élection ou prise
            # de fonction), ou au moins une période commune avec un mandat de député de l'AMO
            "debuts_concordants": sum(1 for m in comparables if m["debut"] in debuts_an),
            "mandats_chevauchants": sum(1 for m in comparables if any(chevauche(m, x) for x in amo))}))
    forts = [c for c in candidats if c.indices["fiche_senat_citee"]
             and (c.indices["mandats_chevauchants"] or not comparables)]
    annees = sorted(x[:4] for m in mandats for x in (m["debut"] or m["annee_debut"], m["fin"] or m["annee_fin"]) if x)
    periode = f"{annees[0]}–{annees[-1]}" if annees else "dates non publiées"
    titre = "sénatrice" if s["Qualité"].startswith(("Mme", "Mlle")) else "sénateur"
    yield CasRevue(
        "identite_senateur_ancien_depute", f"identite_senateur_ancien_depute:{mat}", "identite",
        f"{s['Qualité']} {nom} ({mat}), {titre}, a été député ({len(mandats)} mandat(s), {periode}) : "
        f"{len(candidats)} acteur(s) AN candidat(s)",
        sujet=("personne", senat("senateur", mat)), candidats=tuple(candidats),
        # décider : relier le matricule à l'acteur ; les deux entités existent, la décision
        # s'applique par une fusion d'entités (docs/rapprochements.md §10) ; « aucun » : rien à faire
        contexte={"mandats_depute": mandats, "mandats_comparables": len(comparables), "priorite": 1 if forts else 2,
                  "effet": "fusion de la personne du sénateur dans celle de l'acteur choisi"})


def executer(ctx):
    from ..an import travaux                    # annuaire des noms de l'AMO : candidats de revue
    general, mandats, groupes = (ctx.fichier(f.nom) for f in (GENERAL, MANDATS, GROUPES))
    deputes = ctx.fichier(ANCIENS_DEPUTES.nom)
    annuaire = travaux.annuaire(ctx)
    fiches = fiches_citees(annuaire)
    charger(ctx, Flux(Systeme.SENAT, LICENCE, lambda: iter([Document(GENERAL, "senat", b"SENAT", "SENAT")]), assemblee),
            Flux(Systeme.SENAT, LICENCE, docs(GENERAL, general, "Matricule"), senateur),
            Flux(Systeme.SENAT, LICENCE, docs(MANDATS, mandats, "Identifiant mandat"), mandat),
            Flux(Systeme.SENAT, LICENCE, lambda: (document_ligne(GROUPES, "groupes", l["Code du groupe politique"], l)
                                                  for l in groupes_recents(groupes)), groupe,
                 lambda d: [("organisation", senat("groupe", d.donnees["Code du groupe politique"]))]),
            Flux(Systeme.SENAT, LICENCE, docs(GROUPES, groupes, "Id fonction occupée"), appartenance),
            # après les sénateurs : le sujet du cas (le matricule) est alors identifié
            Flux(Systeme.SENAT, LICENCE, lambda: (document_ligne(ANCIENS_DEPUTES, "eludep", s["Matricule"], s)
                                                  for s in anciens_deputes(deputes)),
                 lambda d: ancien_depute(d, annuaire, fiches)))


ETAPE = Etape("senat.senateurs", executer, apres=("an.acteurs",),
              sources=lambda p: [GENERAL, MANDATS, GROUPES, ANCIENS_DEPUTES],
              description="sénateurs, mandats sénatoriaux et appartenances aux groupes (ODSEN) ; "
                          "anciens députés en revue")
