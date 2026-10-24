"""Questions de l'AN sur des extraits réels condensés (cache du 24/10/2026) : identifiants publiés
seulement, textes tels que publiés, aucun lien supposé vers une séance ou un ministre.

python3 -m unittest discover tests
"""

import json
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path

from src.adaptateurs.sources.an import questions
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, Document, charger
from src.identites import RegistreIdentites
from tests.test_postgres import CX

NIL = None                              # les questions publient `null`, pas `{"@xsi:nil": "true"}`


def jo(type_jo, date_jo, page=NIL):
    return {"infoJO": {"typeJO": type_jo, "dateJO": date_jo, "pageJO": page, "numJO": NIL}}


def ministere(ref, developpe):
    return {"organeRef": ref, "abrege": developpe, "developpe": developpe}


# questions_gouvernement.json.zip › json/QANR5L17QG390.json (texte de l'échange condensé)
QG390 = {"question": {
    "@xsi:type": "QuestionGouvernement_Type", "uid": "QANR5L17QG390",
    "identifiant": {"numero": "390", "regime": "5eme Republique", "legislature": "17"}, "type": "QG",
    "indexationAN": {"rubrique": "outre-mer", "teteAnalyse": NIL,
                     "analyses": {"analyse": "Continuité territoriale pour les fonctionnaires et militaires ultramarins"}},
    "auteur": {"identite": {"acteurRef": "PA721110", "mandatRef": "PM843782"},
               "groupe": {"organeRef": "PO845485", "abrege": "LIOT"}},
    "minInt": ministere("PO855072", "Ministère des outre-mer"),
    "minAttribs": {"minAttrib": {**jo("JO_DEBAT", "2025-02-12"),
                                 "denomination": ministere("PO855072", "Ministère des outre-mer")}},
    "textesQuestion": NIL,
    "textesReponse": {"texteReponse": {**jo("JO_DEBAT", "2025-02-12", "1125"), "texte": (
        "</p><p align=\"CENTER\"> CONTINUITÉ TERRITORIALE POUR LES FONCTIONNAIRES ET MILITAIRES ULTRAMARINS "
        "<a name=PG17></a> </p><br><strong>Mme la présidente . </strong>La parole est à Mme Nicole Sanquer.<br>"
        "<br><strong>M. Manuel Valls,</strong><i> ministre d'État, ministre des outre-mer . </i>Madame la députée…")}},
    "cloture": {"codeCloture": "REP_PUB", "libelleCloture": "Réponse publiée", "dateCloture": "2025-02-12",
                **jo("JO_DEBAT", "2025-02-12", "1125")}}}

# questions_ecrites.json.zip › json/QANR5L17QE10205.json : réattribuée au changement de
# gouvernement (décret du 13/10/2025 publié après la question du 14/10), sans réponse, signalée
QE10205 = {"question": {
    "@xsi:type": "QuestionEcrite_Type", "uid": "QANR5L17QE10205",
    "identifiant": {"numero": "10205", "legislature": "17"}, "type": "QE",
    "indexationAN": {"rubrique": "assurance maladie maternité",
                     "analyses": {"analyse": "Absence de remboursement des traitements contre les migraines chroniques"}},
    "auteur": {"identite": {"acteurRef": "PA719412", "mandatRef": "PM842651"},
               "groupe": {"organeRef": "PO845407", "abrege": "EPR"}},
    "minInt": ministere("PO873446", "Ministère du travail, de la santé, des solidarités, des familles, de l’autonomie "
                                    "et des personnes handicapées"),
    "minAttribs": {"minAttrib": [
        {**jo("JO_QUESTION", "2025-10-14"), "denomination": ministere(
            "PO873446", "Ministère du travail, de la santé, des solidarités, des familles, de l’autonomie et des "
                        "personnes handicapées")},
        {**jo("JO_LOI_DECRET", "2025-10-13"), "denomination": ministere(
            "PO873673", "Ministère de la santé, des familles, de l’autonomie et des personnes handicapées")}]},
    "textesQuestion": {"texteQuestion": {**jo("JO_QUESTION", "2025-10-14", "8480"),
                                         "texte": "Mme Sandrine Le Feur attire l'attention de Mme la ministre du travail…"}},
    "textesReponse": NIL, "cloture": NIL,
    "signalement": {"dateDepotSignal": "2026-05-04", **jo("JO_QUESTION", "2026-05-05")}, "renouvellements": NIL}}

# questions_ecrites.json.zip › json/QANR5L17QE10698.json : réponse republiée par erratum
QE10698 = {"question": {
    "uid": "QANR5L17QE10698", "identifiant": {"numero": "10698", "legislature": "17"}, "type": "QE",
    "indexationAN": {"rubrique": "défense", "analyses": {
        "analyse": "Statut de l'ouvrier d'Etat et difficultés de recrutement à l'AIA de Bordeaux"}},
    "auteur": {"identite": {"acteurRef": "PA841251"}, "groupe": {"organeRef": "PO845413"}},
    "minInt": ministere("PO873656", "Ministère des armées et des anciens combattants"),
    "minAttribs": {"minAttrib": {**jo("JO_QUESTION", "2025-11-04"), "denomination": ministere(
        "PO873656", "Ministère des armées et des anciens combattants")}},
    "textesQuestion": {"texteQuestion": {**jo("JO_QUESTION", "2025-11-04", "8864"),
                                         "texte": "Mme Mathilde Feld interroge Mme la ministre des armées…"}},
    "textesReponse": {"texteReponse": [
        {**jo("JO_QUESTION", "2026-01-13", "148"), "texte": "Le service industriel de l'aéronautique (SIAé) adapte…"},
        {**jo("JO_QUESTION", "2026-01-27", "718"), "erratum": "Le service industriel de l’aéronautique (SIAé) adapte…",
         "texte": "<p>Le service industriel de l’aéronautique (SIAé) adapte…"}]},
    "cloture": {"codeCloture": "REP_PUB", "libelleCloture": "Réponse publiée", "dateCloture": "2026-01-13"}}}

# questions_orales.json.zip › json/QANR5L17QOSD186.json
QOSD186 = {"question": {
    "uid": "QANR5L17QOSD186", "identifiant": {"numero": "186", "legislature": "17"}, "type": "QOSD",
    "indexationAN": {"rubrique": "enseignement", "analyses": {
        "analyse": "Manque d'accompagnement des élèves en situation de handicap dans le Val-de-Marne"}},
    "auteur": {"identite": {"acteurRef": "PA795310"}, "groupe": {"organeRef": "PO845413"}},
    "minInt": ministere("PO855069", "Ministère de l’éducation nationale, de l’enseignement supérieur et de la recherche"),
    "minAttribs": {"minAttrib": {**jo("JO_QUESTION", "2025-02-25"), "denomination": ministere(
        "PO855069", "Ministère de l’éducation nationale, de l’enseignement supérieur et de la recherche")}},
    "textesQuestion": {"texteQuestion": {**jo("JO_QUESTION", "2025-02-25"),
                                         "texte": "Mme Clémence Guetté alerte Mme la ministre d'État…"}},
    "textesReponse": {"texteReponse": {**jo("JO_DEBAT", "2025-03-05", "1674"),
                                       "texte": "</p><p align=\"CENTER\"> ÉLÈVES EN SITUATION DE HANDICAP…"}},
    "cloture": {"codeCloture": "REP_PUB", "libelleCloture": "Réponse publiée", "dateCloture": "2025-03-05"}}}


def analyser(contenu, f=questions.QUESTIONS_ECRITES):
    uid = contenu["question"]["uid"]
    return list(questions.question(Document(f, f"json/{uid}.json", json.dumps(contenu).encode(), uid)))


class Questions(unittest.TestCase):
    def test_question_au_gouvernement(self):
        (q,) = analyser(QG390, questions.QUESTIONS_GOUVERNEMENT)
        v = q.valeurs
        self.assertEqual((q.type, str(q.identite)), ("question", "AN:question:QANR5L17QG390"))
        self.assertEqual((v["type"], v["numero"], v["auteur_id"].id_source, v["groupe_auteur_id"].id_source),
                         ("QG", "390", "PA721110", "PO845485"))
        self.assertEqual((v["ministere_interroge_id"].id_source, v["ministere_attributaire_id"].id_source,
                          v["ministere"]), ("PO855072", "PO855072", "Ministère des outre-mer"))
        self.assertEqual((v["rubrique"], v["titre"]), ("outre-mer", "Continuité territoriale pour les fonctionnaires "
                                                                    "et militaires ultramarins"))
        # pas de texte de question à part : la date est celle de l'échange publié au JO débats
        self.assertEqual((v["texte_question"], v["date"], v["date_reponse"], v["page_jo_reponse"]),
                         (None, date(2025, 2, 12), date(2025, 2, 12), "1125"))
        self.assertTrue(v["texte_reponse"].startswith("</p><p align=\"CENTER\"> CONTINUITÉ TERRITORIALE"))
        self.assertEqual(q.url, "https://www.assemblee-nationale.fr/dyn/17/questions/QANR5L17QG390")

    def test_ministre_jamais_devine(self):
        """Le nom du ministre n'est que dans le texte de l'échange : aucune personne n'est reliée."""
        (q,) = analyser(QG390, questions.QUESTIONS_GOUVERNEMENT)
        self.assertFalse({k for k, x in q.valeurs.items() if x is not None and k.endswith("_id")}
                         - {"auteur_id", "groupe_auteur_id", "ministere_interroge_id", "ministere_attributaire_id"})
        self.assertNotIn("PA", "".join(x.id_source for k, x in q.valeurs.items() if k.startswith("ministere_") and
                                       k.endswith("_id")))

    def test_attribution_dans_l_ordre_publie(self):
        (q,) = analyser(QE10205)
        v = q.valeurs
        # la dernière de la liste, pas la plus récente par date JO (13/10 < 14/10)
        self.assertEqual(v["ministere_attributaire_id"].id_source, "PO873673")
        self.assertEqual(v["ministere_interroge_id"].id_source, "PO873446")
        self.assertEqual([(a["organe"], a["date_jo"], a["type_jo"]) for a in v["publication_jo"]["attributions"]],
                         [("PO873446", "2025-10-14", "JO_QUESTION"), ("PO873673", "2025-10-13", "JO_LOI_DECRET")])
        self.assertEqual((v["date"], v["date_reponse"], v["texte_reponse"], v["cloture"]),
                         (date(2025, 10, 14), None, None, None))
        self.assertEqual(v["publication_jo"]["signalement"], "2026-05-04")

    def test_erratum_garde_a_part(self):
        (q,) = analyser(QE10698)
        v = q.valeurs
        self.assertEqual((v["texte_reponse"], v["date_reponse"], v["page_jo_reponse"]),
                         ("Le service industriel de l'aéronautique (SIAé) adapte…", date(2026, 1, 13), "148"))
        (e,) = v["publication_jo"]["errata"]
        self.assertEqual((e["objet"], e["date_jo"], e["texte"]),
                         ("reponse", "2026-01-27", "<p>Le service industriel de l’aéronautique (SIAé) adapte…"))

    def test_question_orale(self):
        (q,) = analyser(QOSD186, questions.QUESTIONS_ORALES)
        v = q.valeurs
        self.assertEqual((v["type"], v["date"], v["date_reponse"], v["cloture"], v["date_cloture"]),
                         ("QOSD", date(2025, 2, 25), date(2025, 3, 5), "REP_PUB", date(2025, 3, 5)))

    def test_documents_inchanges_sautes(self):
        """Lecture membre par membre de l'archive ; un document déjà vu n'est pas relu."""
        with tempfile.TemporaryDirectory() as d:
            chemins = []
            for f, contenus in ((questions.QUESTIONS_GOUVERNEMENT, [QG390]), (questions.QUESTIONS_ECRITES, [QE10205, QE10698]),
                                (questions.QUESTIONS_ORALES, [QOSD186])):
                chemins.append(Path(d) / f.nom)
                with zipfile.ZipFile(chemins[-1], "w") as z:
                    for c in contenus:
                        z.writestr(f"json/{c['question']['uid']}.json", json.dumps(c))
            e = EntrepotMemoire()
            ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
            charger(ctx, *questions.flux(*chemins))
            self.assertEqual((ctx.bilan["ecrit.question"], ctx.bilan["documents_lus"]), (4, 4))
            # auteurs et ministères non chargés ici : références vides et constatées, jamais supposées
            self.assertEqual(ctx.bilan["reference_inconnue.AN.acteur"], 4)
            charger(ctx, *questions.flux(*chemins))
            self.assertEqual((ctx.bilan["documents_inchanges"], ctx.bilan["documents_lus"]), (4, 4))


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class QuestionPostgres(unittest.TestCase):
    """Les colonnes de 0014 existent et acceptent ce que produit l'adaptateur (JSONB compris)."""

    def test_ecrite_avec_auteur_et_ministeres_relies(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, migrer
        from src.chargement import ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Objet
        migrer(CX)
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            ecrire(ctx, Objet("personne", AN("acteur", "PA719412"), {"nom": "Le Feur", "nom_affiche": "Sandrine Le Feur"}),
                   src, None)
            for po in ("PO845407", "PO873446", "PO873673"):
                ecrire(ctx, Objet("organisation", AN("organe", po), {"type": "ministere", "nom": po}), src, None)
            for element in analyser(QE10205):
                ecrire(ctx, element, src, None)
        ligne = CX.execute(
            "SELECT q.type, q.numero, a.id_source, m.id_source, q.publication_jo -> 'attributions' -> 1 ->> 'type_jo' "
            "FROM canon.question q JOIN canon.correspondance a ON a.entite_id = q.auteur_id "
            "JOIN canon.correspondance m ON m.entite_id = q.ministere_attributaire_id").fetchone()
        self.assertEqual(ligne, ("QE", "10205", "PA719412", "PO873673", "JO_LOI_DECRET"))


class Etape(unittest.TestCase):
    def test_apres_les_acteurs(self):
        from src.adaptateurs.sources import an
        self.assertIn(questions.ETAPE, an.ETAPES)
        self.assertEqual(questions.ETAPE.apres, ("an.acteurs",))
        self.assertEqual([f.nom for f in questions.ETAPE.sources({})],
                         ["questions_gouvernement.json.zip", "questions_ecrites.json.zip", "questions_orales.json.zip"])


if __name__ == "__main__":
    unittest.main()
