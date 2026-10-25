"""Questions de l'AN : au Gouvernement (QG), écrites (QE), orales sans débat (QOSD).

Tout par identifiant publié : auteur (`acteurRef`), son groupe et les ministères (`organeRef`).
L'AN ne publie pas l'acteur du ministre qui répond : seul le ministère attributaire est relié ;
le nom du ministre reste dans le texte de la réponse, tel que publié. Aucun lien vers la séance
(la question ne cite ni réunion ni compte rendu) : rien n'est cherché par date ou par titre.

Textes question et réponse : première publication ; les errata publiés sont gardés à part.
"""

from ....chargement import Document, Flux, charger
from ....domaine.objets import Objet
from ....etl import Etape
from .commun import LICENCE, Systeme, an, documents, fichier, jour, liste, lire, val

QUESTIONS_GOUVERNEMENT = fichier("questions_gouvernement.json.zip",
                                 "questions/questions_gouvernement/Questions_gouvernement.json.zip")
QUESTIONS_ECRITES = fichier("questions_ecrites.json.zip", "questions/questions_ecrites/Questions_ecrites.json.zip")
QUESTIONS_ORALES = fichier("questions_orales.json.zip",
                           "questions/questions_orales_sans_debat/Questions_orales_sans_debat.json.zip")
FICHIERS = [QUESTIONS_GOUVERNEMENT, QUESTIONS_ECRITES, QUESTIONS_ORALES]


def jo(x) -> dict:
    return x.get("infoJO") or {} if isinstance(x, dict) else {}


def question(doc: Document):
    q = lire(doc)["question"]
    uid, ident = q["uid"], an("question", q["uid"])
    numero, legislature = q["identifiant"]["numero"], q["identifiant"].get("legislature")
    auteur = q.get("auteur") or {}
    indexation = q.get("indexationAN") or {}
    interroge = q.get("minInt") or {}
    attributions = liste((q.get("minAttribs") or {}).get("minAttrib"))
    derniere = (attributions[-1].get("denomination") or {}) if attributions else {}
    textes_q = liste((q.get("textesQuestion") or {}).get("texteQuestion"))
    textes_r = liste((q.get("textesReponse") or {}).get("texteReponse"))
    cloture = q.get("cloture") or {}
    errata = [{"objet": objet, "date_jo": val(jo(t).get("dateJO")), "erratum": val(t.get("erratum")),
               "texte": val(t.get("texte"))}
              for objet, textes in (("question", textes_q), ("reponse", textes_r)) for t in textes[1:]]
    # QAG : pas de texte de question publié à part, question et réponse forment un seul échange
    # publié au JO débats ; la date de la question est celle de cet échange.
    date = jour(jo(textes_q[0]).get("dateJO")) if textes_q else None
    date_reponse = jour(jo(textes_r[0]).get("dateJO")) if textes_r else None
    yield Objet("question", ident, {
        "chambre": "AN", "type": q["type"], "numero": numero, "legislature": legislature,
        "auteur_id": an("acteur", val((auteur.get("identite") or {}).get("acteurRef"))),
        "groupe_auteur_id": an("organe", val((auteur.get("groupe") or {}).get("organeRef"))),
        "ministere_interroge_id": an("organe", val(interroge.get("organeRef"))),
        "ministere": val(interroge.get("developpe")),
        "ministere_attributaire_id": an("organe", val(derniere.get("organeRef"))),
        "ministere_attributaire": val(derniere.get("developpe")),
        "rubrique": val(indexation.get("rubrique")),
        "titre": val((indexation.get("analyses") or {}).get("analyse")),
        "date": date or (date_reponse if q["type"] == "QG" else None), "date_reponse": date_reponse,
        "texte_question": val(textes_q[0].get("texte")) if textes_q else None,
        "texte_reponse": val(textes_r[0].get("texte")) if textes_r else None,
        "page_jo_reponse": val(jo(textes_r[0]).get("pageJO")) if textes_r else None,
        "cloture": val(cloture.get("codeCloture")), "cloture_libelle": val(cloture.get("libelleCloture")),
        "date_cloture": jour(cloture.get("dateCloture")),
        "publication_jo": {
            "attributions": [{"organe": val((a.get("denomination") or {}).get("organeRef")),
                              "libelle": val((a.get("denomination") or {}).get("developpe")),
                              "date_jo": val(jo(a).get("dateJO")), "type_jo": val(jo(a).get("typeJO"))}
                             for a in attributions],
            "errata": errata,
            "renouvellements": [val(jo(r).get("dateJO")) for r in
                                liste((q.get("renouvellements") or {}).get("renouvellement"))],
            "signalement": val((q.get("signalement") or {}).get("dateDepotSignal"))}},
        "/question", f"https://www.assemblee-nationale.fr/dyn/{legislature}/questions/{uid}")


def flux(*chemins) -> list[Flux]:
    """Un flux par archive, lu membre par membre ; aucun autre flux ne cite une question, donc pas
    de passe préalable."""
    return [Flux(Systeme.AN, LICENCE, lambda f=f, c=c: documents(f, c), question) for f, c in zip(FICHIERS, chemins)]


def executer(ctx):
    charger(ctx, *flux(*(ctx.fichier(f.nom) for f in FICHIERS)))


ETAPE = Etape("an.questions", executer, apres=("an.acteurs",), sources=lambda p: FICHIERS,
              description="questions au Gouvernement, écrites et orales sans débat, avec leurs réponses")
