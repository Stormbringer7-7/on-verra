"""Adaptateurs canoniques de l'AN sur des documents minimaux : règles de découpage et de rattachement.

python3 -m unittest discover tests
"""

import json
import unittest

from src.chargement import Document
from src.domaine import IdentiteNative, Systeme
from src.domaine.objets import CasRevue, Dependants, Objet
from src.adaptateurs.sources.an import agenda, dossiers, seances
from src.adaptateurs.sources.an.commun import url_compte_rendu

NS = "{http://schemas.assemblee-nationale.fr/referentiel}"


def doc(f, contenu, chemin="x"):
    octets = contenu.encode() if isinstance(contenu, str) else json.dumps(contenu).encode()
    return Document(f, chemin, octets)


def par(syceron, acteur, nom, texte, **attributs):
    autres = " ".join(f'{k}="{v}"' for k, v in attributs.items())
    orateur = f"<orateurs><orateur><id>{acteur}</id><nom>{nom}</nom></orateur></orateurs>" if acteur else "<orateurs/>"
    return (f'<paragraphe id_syceron="{syceron}" {f"id_acteur={chr(34)}{acteur}{chr(34)}" if acteur else ""} '
            f'code_grammaire="PAROLE_GENERIQUE" {autres}>{orateur}<texte stime="12.5">{texte}</texte></paragraphe>')


def compte_rendu(*contenu):
    return (f'<compteRendu xmlns="http://schemas.assemblee-nationale.fr/referentiel"><uid>CRS1</uid>'
            f'<seanceRef>RU1</seanceRef><metadonnees><dateSeance>20260312150000000</dateSeance>'
            f'<legislature>17</legislature></metadonnees><contenu>{"".join(contenu)}</contenu></compteRendu>')


def point(titre, valeur, *paragraphes):
    return (f'<point nivpoint="1" valeur="{valeur}" code_grammaire="TITRE_TEXTE_DISCUSSION">'
            f'<texte>{titre}</texte>{"".join(paragraphes)}</point>')


def interventions(elements):
    return [e for e in elements if isinstance(e, Objet) and e.type == "intervention"]


class Seances(unittest.TestCase):
    INDEX = {("17", "1364"): {"DLR_FIN_DE_VIE"}, ("17", "1281"): {"DLR_SOINS"}}

    def test_adresse_publique_des_comptes_rendus(self):
        # Vérifié le 25/10/2026 : dyn/opendata/CRSANR5L17S2027O1N018.html répond 404 (seul le .xml
        # existe) ; dyn/17/comptes-rendus/seance/<uid> redirige vers « premiere-seance-du-lundi-
        # 12-octobre-2026 », dont les ancres sont les id_syceron (#4182347).
        self.assertEqual(url_compte_rendu("CRSANR5L17S2027O1N018"),
                         "https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2027O1N018")
        self.assertEqual(url_compte_rendu("CRCANR5L17S2027PO884839N001"),
                         "https://www.assemblee-nationale.fr/dyn/opendata/CRCANR5L17S2027PO884839N001.html")
        self.assertIsNone(url_compte_rendu("CRSSNR5S2025IDS20241009"))   # Sénat : l'AN répond 500
        self.assertIsNone(url_compte_rendu(None))

    def analyser(self, xml):
        return list(seances.seance(doc(seances.SEANCES, xml), NS, self.INDEX))

    def test_tour_de_parole_regroupe_les_paragraphes_consecutifs(self):
        res = interventions(self.analyser(compte_rendu(point(
            "Droit à l’aide à mourir", " (n[[o]] 1364)",
            par(1, "PA1", "Mme A", "Premier."), par(2, "PA1", "Mme A", "Second."),
            par(3, "PA2", "M. B", "Réponse."), par(4, "PA1", "Mme A", "Reprise.")))))
        self.assertEqual([i.valeurs["texte"] for i in res], ["Premier.\nSecond.", "Réponse.", "Reprise."])
        self.assertEqual([i.valeurs["ordre"] for i in res], [0, 1, 2])
        self.assertEqual(res[0].identite, IdentiteNative(Systeme.AN, "intervention", "CRS1#1"))
        self.assertEqual(res[0].valeurs["orateur_id"], IdentiteNative(Systeme.AN, "acteur", "PA1"))
        self.assertEqual(res[0].valeurs["horodatage_s"], 12.5)

    def test_numero_de_texte_rattache_au_dossier(self):
        res = interventions(self.analyser(compte_rendu(point("X", " (n[[o]] 1364)", par(1, "PA1", "A", "t")))))
        self.assertEqual(res[0].valeurs["dossier_id"], IdentiteNative(Systeme.AN, "dossier", "DLR_FIN_DE_VIE"))

    def test_discussion_commune_liens_sans_choisir(self):
        elements = self.analyser(compte_rendu(point("X", " (n[[o]] 1281 et 1364)", par(1, "PA1", "A", "t"))))
        self.assertIsNone(interventions(elements)[0].valeurs["dossier_id"])
        liens = [e for e in elements if isinstance(e, Dependants)]
        self.assertEqual({l["vers_id"].id_source for l in liens[0].lignes}, {"DLR_FIN_DE_VIE", "DLR_SOINS"})

    def test_sans_numero_pas_de_dossier(self):
        res = interventions(self.analyser(compte_rendu(point("Questions au Gouvernement", "", par(1, "PA1", "A", "t")))))
        self.assertIsNone(res[0].valeurs["dossier_id"])

    def test_voix_collective_et_identifiant_hors_referentiel(self):
        elements = list(seances.seance(doc(seances.SEANCES, compte_rendu(point(
            "X", "", par(1, "PA0", "Un député du groupe RN", "Très bien !"),
            par(2, "PA-125869", "M. François Bayrou", "t")))), NS, self.INDEX,
            annuaire={"francois bayrou": [{"acteur": "PA2150", "libelle": "François Bayrou", "depute": True,
                                           "membre_gouvernement": True}]}))
        res = interventions(elements)
        self.assertIsNone(res[0].valeurs["orateur_id"])                     # voix collective : personne
        self.assertEqual(res[1].valeurs["orateur_id"],
                         IdentiteNative(Systeme.AN, "acteur_hors_referentiel", "PA-125869"))
        cas = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual((cas[0].type, cas[0].nature, [c.identite.id_source for c in cas[0].candidats]),
                         ("orateur_sans_identifiant", "identite", ["PA2150"]))
        self.assertLess(elements.index(cas[0]), elements.index(res[1]))    # avant les interventions

    def test_amendement_ambigu_en_revue(self):
        chercher = lambda reunion, numeros, dossier=None: ([], [("12", ["AM1", "AM2"])])
        elements = list(seances.seance(doc(seances.SEANCES, compte_rendu(point(
            "X", " (n[[o]] 1364)", par(1, "PA1", "A", "t", adt="12")))), NS, self.INDEX, chercher))
        cas = [e for e in elements if isinstance(e, CasRevue)][0]
        self.assertEqual((cas.type, cas.champ, len(cas.candidats), cas.cibles[0][1].id_source),
                         ("amendement_ambigu", "amendement_id", 2, "CRS1#1"))
        self.assertIsNone(interventions(elements)[0].valeurs["amendement_id"])   # pas de choix par le code

    def test_didascalie_sans_orateur(self):
        res = interventions(self.analyser(compte_rendu(point("X", "", par(1, None, "", "La séance est suspendue.")))))
        self.assertEqual((res[0].valeurs["orateur_id"], res[0].valeurs["orateur_libelle"]), (None, ""))

    def test_numeros_cites(self):
        self.assertEqual(seances.numeros_cites(" (n[[os]] 2406, 2401)"), ["2406", "2401"])
        self.assertEqual(seances.numeros_cites(" (n[[o]] 2915 rectifié)"), ["2915"])


class Dossiers(unittest.TestCase):
    DOSSIER = {"dossierParlementaire": {
        "uid": "DLR1", "legislature": "17", "titreDossier": {"titre": "Fin de vie", "titreChemin": "fin_vie"},
        "procedureParlementaire": {"libelle": "Proposition de loi ordinaire"},
        "initiateur": {"acteurs": {"acteur": [{"acteurRef": "PA1"}, {"acteurRef": "PA1"}]}},
        "actesLegislatifs": {"acteLegislatif": {
            "@xsi:type": "Etape_Type", "uid": "L17-AN1", "codeActe": "AN1", "dateActe": None,
            "actesLegislatifs": {"acteLegislatif": [
                {"@xsi:type": "DepotInitiative_Type", "uid": "L17-DEP", "codeActe": "AN1-DEPOT",
                 "dateActe": "2025-03-11T00:00:00.000+01:00", "organeRef": "PO1", "texteAssocie": "PIONANR5L17B1100"},
                {"@xsi:type": "DiscussionSeancePublique_Type", "uid": "L17-SEA", "codeActe": "AN1-DEBATS-SEANCE",
                 "dateActe": "2025-05-12T00:00:00.000+02:00", "reunionRef": "RU1", "odjRef": "RU1PT1"}]}}}}}

    def test_etapes_publiees_avec_identite_composite(self):
        elements = list(dossiers.dossier(doc(dossiers.DOSSIERS, self.DOSSIER)))
        etapes = [e for e in elements if isinstance(e, Objet) and e.type == "etape"]
        self.assertEqual([e.valeurs["type"] for e in etapes], ["lecture", "depot", "seance"])
        self.assertEqual(etapes[1].identite.id_source, "DLR1:L17-DEP")
        self.assertEqual(etapes[1].valeurs["parent_id"].id_source, "DLR1:L17-AN1")
        self.assertEqual([e.valeurs["chambre"] for e in etapes], ["AN", "AN", "AN"])
        d = elements[0]
        self.assertEqual((d.valeurs["initiative"], str(d.valeurs["date_depot"])), ("parlementaire", "2025-03-11"))

    def test_projet_de_loi_initiative_gouvernement_meme_avec_ministres_initiateurs(self):
        # DLR5L17N54085 : l'AN liste les deux ministres comme « acteurs » initiateurs
        projet = json.loads(json.dumps(self.DOSSIER).replace("PIONANR5L17B1100", "PRJLANR5L17B2632"))
        d = next(iter(dossiers.dossier(doc(dossiers.DOSSIERS, projet))))
        self.assertEqual(d.valeurs["initiative"], "gouvernement")

    def test_liens_dedoublonnes(self):
        elements = list(dossiers.dossier(doc(dossiers.DOSSIERS, self.DOSSIER)))
        initiateurs = next(e for e in elements if isinstance(e, Dependants) and e.parent["nature"] == "initiateur")
        self.assertEqual(len(initiateurs.lignes), 1)
        reunion = next(e for e in elements if isinstance(e, Dependants) and e.parent["nature"] == "reunion"
                       and e.parent["de_id"].id_source == "DLR1:L17-SEA")
        self.assertEqual(reunion.lignes[0]["vers_id"], IdentiteNative(Systeme.AN, "reunion", "RU1"))


class Agenda(unittest.TestCase):
    def test_reunion_points_presences(self):
        r = {"reunion": {"@xsi:type": "reunionCommission_type", "uid": "RU1", "organeReuniRef": "PO1",
                         "timeStampDebut": "2026-03-11T16:30:00.000+01:00", "compteRenduRef": "CRC1",
                         "ODJ": {"pointsODJ": {"pointODJ": [
                             {"uid": "PT1", "objet": "Examen", "dossiersLegislatifsRefs": {"dossierRef": "DLR1"},
                              "cycleDeVie": {"etat": "Confirmé"}},
                             {"uid": "PT2", "objet": "Commun", "dossiersLegislatifsRefs": {"dossierRef": ["DLR1", "DLR2"]},
                              "cycleDeVie": {"etat": "Supprimé"}}]}},
                         "participants": {"participantsInternes": {"participantInterne": [
                             {"acteurRef": "PA1", "presence": "présent"}, {"acteurRef": "PA2", "presence": "excusé"}]}}}}
        elements = list(agenda.reunion(doc(agenda.AGENDA, r)))
        objets = {e.identite.id_source: e for e in elements if isinstance(e, Objet)}
        self.assertEqual(objets["RU1"].valeurs["type"], "commission")
        self.assertEqual(objets["CRC1"].valeurs["type"], "compte_rendu")
        self.assertEqual(objets["PT1"].valeurs["dossier_id"].id_source, "DLR1")
        self.assertIsNone(objets["PT2"].valeurs["dossier_id"])          # deux dossiers : liens seulement
        self.assertEqual(objets["PT2"].valeurs["etat"], "Supprimé")
        presences = next(e for e in elements if isinstance(e, Dependants) and e.table == "participation")
        self.assertEqual([l["presence"] for l in presences.lignes], ["present", "excuse"])


if __name__ == "__main__":
    unittest.main()


class Commissions(unittest.TestCase):
    from src.adaptateurs.sources.an import commissions as module

    @staticmethod
    def html(*paragraphes):
        return "<html><body>" + "".join(paragraphes) + "</body></html>"

    @staticmethod
    def p(*morceaux):
        """morceaux : (texte, style) avec style '', 'b' (gras) ou 'i' (italique)."""
        styles = {"": "", "b": "font-weight:bold", "i": "font-style:italic"}
        return "<p>" + "".join(f'<span style="{styles[s]}">{t}</span>' for t, s in morceaux) + "</p>"

    def analyser(self, contenu):
        self.dernier = contenu
        d = Document(self.module.agenda.AGENDA, "commissions/CRC1.html", contenu.encode())
        return [e for e in self.module.compte_rendu(d, {"CRC1": ("RU1", "PO1")}, {("17", "4"): {"DLR_PLACSS"}},
                                                    {("PO1", "4", "AS3"): ["AM3"], ("PO1", "4", "AS5"): ["AM5"]})
                if isinstance(e, Objet) and e.type == "intervention"]

    def test_decoupage(self):
        res = self.analyser(self.html(
            self.p(("La commission auditionne M. X.", "i")),
            self.p(("M. François de La Guéronnière, conseiller maître.", "b"), (" Merci de m’avoir invité.", "")),
            self.p(("La commission examine le projet de loi (n°\xa04).", "i")),
            self.p(("Article 1er\xa0: Approbation des tableaux", "b")),
            self.p(("Amendements de suppression AS3 de Mme Runel et AS5 de M. Peytavie", "i")),
            self.p(("M. Yannick Monnet (GDR), rapporteur.", "b"), (" Avis défavorable.", "")),
            self.p(("Je m’en explique.", "")),
            self.p(("Présents. – Mme A, M. B", "i"))))
        v = [r.valeurs for r in res]
        self.assertEqual([x["role"] for x in v], ["didascalie", "parole", "didascalie", "intitule", "didascalie", "parole"])
        self.assertEqual((v[1]["orateur_libelle"], v[1]["qualite"]), ("M. François de La Guéronnière", "conseiller maître"))
        self.assertIsNone(v[1]["dossier_id"])                       # avant que le texte soit cité
        self.assertEqual(v[5]["dossier_id"].id_source, "DLR_PLACSS")
        self.assertEqual((v[5]["article"], v[5]["amendements"]), ("Article 1er", "AS3, AS5"))
        self.assertEqual(v[5]["texte"], "Avis défavorable.\nJe m’en explique.")
        self.assertEqual(v[5]["orateur_libelle"], "M. Yannick Monnet (GDR)")
        self.assertIsNone(v[5]["amendement_id"])                    # deux amendements discutés : liens
        liens = [e for e in self.module.compte_rendu(
            Document(self.module.agenda.AGENDA, "commissions/CRC1.html", self.dernier.encode()),
            {"CRC1": ("RU1", "PO1")}, {("17", "4"): {"DLR_PLACSS"}},
            {("PO1", "4", "AS3"): ["AM3"], ("PO1", "4", "AS5"): ["AM5"]}) if isinstance(e, Dependants)]
        self.assertEqual({l["vers_id"].id_source for l in liens[0].lignes}, {"AM3", "AM5"})
        self.assertFalse(any("orateur_id" in x for x in v))        # nom publié seulement, aucun lien supposé
        cas = [e for e in self.module.compte_rendu(
            Document(self.module.agenda.AGENDA, "commissions/CRC1.html", self.dernier.encode()),
            {"CRC1": ("RU1", "PO1")}, {("17", "4"): {"DLR_PLACSS"}}, {}, {"RU1": {"PA9": "présent"}},
            {"yannick monnet": [{"acteur": "PA9", "libelle": "Yannick Monnet", "depute": True,
                                 "membre_gouvernement": False}]}) if isinstance(e, CasRevue)]
        orateur = next(c for c in cas if c.type == "orateur_commission" and "Monnet" in c.cle)
        self.assertEqual((orateur.champ, [c.indices["presence"] for c in orateur.candidats]), ("orateur_id", ["présent"]))
        self.assertTrue(any(c.type == "amendement_introuvable" for c in cas))     # AS3, AS5 : index vide

    def test_numero_de_texte_rectifie(self):
        res = self.analyser(self.html(self.p(("La commission examine le projet de loi (n°\xa04 rect.).", "i")),
                                      self.p(("M. A, rapporteur.", "b"), (" Bien.", ""))))
        self.assertEqual(res[1].valeurs["dossier_id"].id_source, "DLR_PLACSS")

    def test_compte_rendu_sans_reunion_ignore(self):
        d = Document(self.module.agenda.AGENDA, "commissions/CRC9.html", b"<html><body><p>x</p></body></html>")
        self.assertEqual(list(self.module.compte_rendu(d, {}, {})), [])


class Amendements(unittest.TestCase):
    from src.adaptateurs.sources.an import amendements as module

    def test_amendement(self):
        a = {"amendement": {
            "uid": "AMANR5L17PO420120B2851P0D1N000002", "texteLegislatifRef": "PIONANR5L17B2851",
            "amendementParentRef": {"@xsi:nil": "true"}, "identification": {"numeroLong": "AS2"},
            "cycleDeVie": {"dateDepot": "2026-09-29", "sort": "Adopté", "dateSort": "2026-10-06T17:06:55+02:00"},
            "pointeurFragmentTexte": {"division": {"articleDesignationCourte": "ART. 3", "urlDivisionTexteVise": "/17/textes/2851.asp#D_Article_3"}},
            "corps": {"contenuAuteur": {"dispositif": "<p>Supprimer.</p>", "exposeSommaire": "<p>Parce que.</p>"}},
            "seanceDiscussionRef": {"@xsi:nil": "true"},
            "signataires": {"auteur": {"acteurRef": "PA1", "groupePolitiqueRef": "PO845401"},
                            "cosignataires": {"acteurRef": ["PA2", "PA2", "PA3"]}}}}
        d = doc(self.module.AMENDEMENTS, a, "json/DLR5L17N53886/PIONANR5L17B2851/AMANR5L17PO420120B2851P0D1N000002.json")
        elements = list(self.module.amendement(d))
        v = elements[0].valeurs
        self.assertEqual((v["dossier_id"].id_source, v["texte_vise_id"].id_source), ("DLR5L17N53886", "PIONANR5L17B2851"))
        self.assertEqual((v["numero"], v["sort"], v["division"], v["organe_examen_id"].id_source),
                         ("AS2", "adopte", "ART. 3", "PO420120"))
        self.assertIsNone(v["parent_id"])
        liens = {e.parent["nature"]: [l["vers_id"].id_source for l in e.lignes] for e in elements[1:]}
        self.assertEqual(liens, {"auteur": ["PA1"], "cosignataire": ["PA2", "PA3"], "groupe_auteur": ["PO845401"]})

    def test_irrecevable_sans_sort(self):
        etat = lambda libelle: {"cycleDeVie": {"sort": None, "etatDesTraitements": {"etat": {"libelle": libelle}}}}
        self.assertEqual(self.module.sort(etat("Irrecevable 40")), "irrecevable")
        self.assertEqual(self.module.sort(etat("Retiré")), "retire")
        self.assertEqual(self.module.sort(etat("En traitement")), "en_attente")
        self.assertEqual(self.module.sort({"cycleDeVie": {}}), "en_attente")


class Scrutins(unittest.TestCase):
    from src.adaptateurs.sources.an import scrutins as module

    def test_scrutin(self):
        s = {"scrutin": {"uid": "VT1", "numero": "995", "legislature": "17", "seanceRef": "RU1",
                         "dateScrutin": "2025-03-13", "titre": "l'amendement n° 8 de Mme X à l'article 6 de la proposition de loi Y.",
                         "typeVote": {"codeTypeVote": "SPO", "libelleTypeVote": "scrutin public ordinaire"},
                         "sort": {"code": "rejeté"}, "objet": {"dossierLegislatif": None},
                         "syntheseVote": {"nombreVotants": "3", "decompte": {"pour": "1", "contre": "2", "abstentions": "0"}},
                         "ventilationVotes": {"organe": {"groupes": {"groupe": [{
                             "organeRef": "PO1", "nombreMembresGroupe": "10",
                             "vote": {"positionMajoritaire": "pour", "decompteVoix": {"pour": "1", "contre": "2", "abstentions": "0"},
                                      "decompteNominatif": {"pours": {"votant": {"acteurRef": "PA1", "parDelegation": "false"}},
                                                            "contres": {"votant": [{"acteurRef": "PA2"}, {"acteurRef": "PA3", "parDelegation": "true"}]}}}}]}}}}}
        elements = list(self.module.scrutin(doc(self.module.SCRUTINS, s), {"VT1": ("DLR1", "DLR1:L17-SEA")},
                                            lambda reunion, numeros, dossier=None: (["AM8"], []) if (reunion, numeros) == ("RU1", ["8"]) else ([], [])))
        v = elements[0].valeurs
        self.assertEqual((v["nature"], v["dossier_id"].id_source, v["etape_id"].id_source, v["amendement_id"].id_source),
                         ("amendement", "DLR1", "DLR1:L17-SEA", "AM8"))
        positions, votes = elements[1], elements[2]
        self.assertEqual(positions.lignes[0]["position_majoritaire"], "contre")   # recalculée, pas « pour » publié
        self.assertEqual(sorted((l["personne_id"].id_source, l["position"], l["par_delegation"]) for l in votes.lignes),
                         [("PA1", "pour", False), ("PA2", "contre", False), ("PA3", "contre", True)])

    def test_nature(self):
        self.assertEqual(self.module.nature("l'ensemble du projet de loi X"), "ensemble")
        self.assertEqual(self.module.nature("la motion de rejet préalable"), "motion")
