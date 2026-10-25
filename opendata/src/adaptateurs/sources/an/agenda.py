"""Agenda de l'AN : réunions (séances, commissions), points d'ordre du jour, présences.

Les personnes auditionnées sont annoncées mais publiées vides (`personneAuditionnee: [null…]`) :
leurs noms ne figurent que dans les comptes rendus de commission.
"""

from ....chargement import Document, Flux
from ....domaine.objets import Dependants, Objet
from .commun import LICENCE, Systeme, an, documents, fichier, instant, liste, lire, url_compte_rendu, val

AGENDA = fichier("agenda.json.zip", "vp/reunions/Agenda.json.zip")
TYPES_REUNION = {"seance_type": "seance", "reunionCommission_type": "commission"}
PRESENCES = {"présent": "present", "absent": "absent", "excusé": "excuse"}


def points(r: dict) -> list[dict]:
    return liste(((r.get("ODJ") or {}).get("pointsODJ") or {}).get("pointODJ"))


def reunion(doc: Document):
    r = lire(doc)["reunion"]
    uid, ident = r["uid"], an("reunion", r["uid"])
    compte_rendu = val(r.get("compteRenduRef"))
    if compte_rendu:
        yield Objet("document", an("document", compte_rendu), {
            "type": "compte_rendu", "type_source": compte_rendu[:3], "numero": compte_rendu,
            "url": url_compte_rendu(compte_rendu)}, "/reunion/compteRenduRef")
    yield Objet("reunion", ident, {
        "type": TYPES_REUNION.get(r.get("@xsi:type"), "autre"), "chambre": "AN",
        "organe_id": an("organe", val(r.get("organeReuniRef"))), "debut": instant(r.get("timeStampDebut")),
        "legislature": "17", "compte_rendu_id": an("document", compte_rendu)}, "/reunion")
    for i, p in enumerate(points(r)):
        dossiers = [val(x) for x in liste((p.get("dossiersLegislatifsRefs") or {}).get("dossierRef")) if val(x)]
        point = an("point_odj", p["uid"])
        yield Objet("point_odj", point, {
            "reunion_id": ident, "ordre": i, "objet": val(p.get("objet")), "type": val(p.get("typePointODJ")),
            "etat": (p.get("cycleDeVie") or {}).get("etat"),
            # un seul dossier : rattachement direct ; plusieurs : seulement par les liens ci-dessous
            "dossier_id": an("dossier", dossiers[0]) if len(dossiers) == 1 else None},
            f"/reunion/ODJ/pointsODJ/pointODJ/{i}")
        yield Dependants("lien", {"de_id": point, "nature": "dossier"},
                         [{"vers_id": an("dossier", d), "ordre": j} for j, d in enumerate(dossiers)],
                         f"/reunion/ODJ/pointsODJ/pointODJ/{i}", ("vers_id",))
    presents = liste(((r.get("participants") or {}).get("participantsInternes") or {}).get("participantInterne"))
    yield Dependants("participation", {"reunion_id": ident},
                     [{"personne_id": an("acteur", val(p.get("acteurRef"))),
                       "presence": PRESENCES.get(val(p.get("presence")), val(p.get("presence")) or "inconnue")}
                      for p in {val(p.get("acteurRef")): p for p in presents if val(p.get("acteurRef"))}.values()],
                     "/reunion/participants", ("personne_id",))


def flux(chemin) -> list[Flux]:
    def prealable(doc):
        r = lire(doc)["reunion"]
        cr = val(r.get("compteRenduRef"))
        return ([("document", an("document", cr))] if cr else []) + [("reunion", an("reunion", r["uid"]))] + [
            ("point_odj", an("point_odj", p["uid"])) for p in points(r)]

    return [Flux(Systeme.AN, LICENCE, lambda: documents(AGENDA, chemin, "reunion/"), reunion, prealable)]
