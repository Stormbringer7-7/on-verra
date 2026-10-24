"""Sénateurs anciens députés (ODSEN_ELUDEP) : un homonyme seul part en revue ; une fiche Sénat citée
par l'AMO est une référence explicite, traitée par `an.acteurs` (fusion), sans revue.

Extraits réels (24/10/2026) : Gabriel Amard (20684B), député de 2022 à 2026 puis sénateur, et
l'acteur AMO PA794906 qui cite sa fiche Sénat ; Jacqueline Fraysse-Cazalis (86027F), « Jacqueline
Fraysse » à l'AN ; François Abadie (83008P), député en 1981, absent de l'AMO. Le contrat de la
décision est rejoué sur Postgres. python3 -m unittest discover tests
"""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from src import revue
from src.adaptateurs.sources.an import acteurs
from src.adaptateurs.sources.senat import senateurs
from src.adaptateurs.sources.senat.commun import document_ligne
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, ecrire
from src.domaine import EnregistrementSource, IdentiteNative, Methode, Statut, Systeme
from src.domaine.objets import CasRevue, Objet
from src.identites import RegistreIdentites

AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
SENAT = lambda t, i: IdentiteNative(Systeme.SENAT, t, i)

ELUDEP = """% Requête :select s.senmat as "Matricule", …
% from senateurs.sen s
% 790 ligne(s) de résultat
Matricule,Qualité,Nom usuel,Prénom usuel,État Sénateur,Identifiant mandat,Date d'élection,Date de début de mandat,Année de début de mandat,Date de fin de mandat,Année de fin de mandat,Identifiant fonction,Date de début de fonction,Année de début de fonction,Date de fin de fonction,Année de fin de fonction,Fonction
83008P,M.,Abadie,François,ANCIEN,51774,,1981-07-02 00:00:00.0,,1981-07-23 00:00:00.0,,51376,1981-07-02 00:00:00.0,,1981-07-23 00:00:00.0,,Député
20684B,M.,Amard,Gabriel,ACTIF,52998,,2022-06-22 00:00:00.0,,2024-06-09 00:00:00.0,,52535,2022-06-22 00:00:00.0,,2024-06-09 00:00:00.0,,Député
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55837,2024-07-08 00:00:00.0,,2024-07-20 00:00:00.0,,Député
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55838,2024-07-20 00:00:00.0,,2025-10-01 00:00:00.0,,Secrétaire de l'Assemblée nationale
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55839,2025-10-02 00:00:00.0,,2026-09-30 00:00:00.0,,Député
86027F,Mme,Fraysse-Cazalis,Jacqueline,ANCIEN,50779,,2002-06-25 00:00:00.0,,2007-06-25 00:00:00.0,,50072,2002-06-25 00:00:00.0,,,,Député
86027F,Mme,Fraysse-Cazalis,Jacqueline,ANCIEN,50780,,2007-06-26 00:00:00.0,,2012-06-25 00:00:00.0,,50073,2007-06-26 00:00:00.0,,,,Député
"""

# AMO30, json/acteur/PA794906.json (condensé)
PA794906 = {"acteur": {
    "uid": {"#text": "PA794906"}, "etatCivil": {"ident": {"civ": "M.", "prenom": "Gabriel", "nom": "Amard"}},
    "adresses": {"adresse": [{"@xsi:type": "AdresseSiteWeb_Type", "uid": "AD885845", "type": "23",
                              "typeLibelle": "Url sénateur",
                              "valElec": "https://www.senat.fr/senateur/amard_gabriel20684b.html"}]},
    "mandats": {"mandat": [
        {"uid": "PM843284", "typeOrgane": "ASSEMBLEE", "legislature": "17", "dateDebut": "2024-07-07",
         "dateFin": "2026-09-30", "mandature": {"datePriseFonction": "2024-07-08", "causeFin": "Élection au Sénat"}},
        {"uid": "PM797187", "typeOrgane": "ASSEMBLEE", "legislature": "16", "dateDebut": "2022-06-19",
         "dateFin": "2024-06-09", "mandature": {"datePriseFonction": "2022-06-22"}}]}}}

# annuaire de l'AMO tel que le donne acteurs.annuaire() (PA1364 : dates de l'AMO, à quelques jours près)
ANNUAIRE = {
    "jacqueline fraysse": [{"acteur": "PA1364", "libelle": "Jacqueline Fraysse", "depute": True,
                            "membre_gouvernement": False, "fiche_senat": "86027F", "mandats_depute": [
                                {"debut": "2002-06-19", "prise_de_fonction": "2002-06-19", "fin": "2007-06-19"},
                                {"debut": "2007-06-20", "prise_de_fonction": "2007-06-20", "fin": "2012-06-19"}]}]}


def eludep(dossier: Path) -> Path:
    chemin = dossier / "eludep.csv"
    chemin.write_bytes(ELUDEP.encode("cp1252"))
    return chemin


def amo(dossier: Path) -> Path:
    chemin = dossier / "acteurs.json.zip"
    with zipfile.ZipFile(chemin, "w") as z:
        z.writestr("json/acteur/PA794906.json", json.dumps(PA794906))
    return chemin


class Lecture(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        d = Path(self.dossier.name)
        self.senateurs = {s["Matricule"]: s for s in senateurs.anciens_deputes(eludep(d))}
        self.annuaire = {**acteurs.annuaire(amo(d)), **ANNUAIRE}

    def tearDown(self):
        self.dossier.cleanup()

    def cas(self, matricule):
        s = self.senateurs[matricule]
        return list(senateurs.ancien_depute(document_ligne(senateurs.ANCIENS_DEPUTES, "eludep", matricule, s),
                                            self.annuaire))

    def test_annuaire_lit_la_fiche_senat_et_les_mandats(self):
        (a,) = self.annuaire["gabriel amard"]
        self.assertEqual((a["fiche_senat"], a["mandats_depute"][0]),
                         ("20684B", {"debut": "2024-07-07", "prise_de_fonction": "2024-07-08", "fin": "2026-09-30"}))

    def test_un_document_par_senateur_mandats_regroupes(self):
        amard = self.senateurs["20684B"]
        self.assertEqual([(m["identifiant"], m["debut"], m["fin"]) for m in amard["mandats"]],
                         [("52998", "2022-06-22", "2024-06-09"), ("54396", "2024-07-08", "2026-09-30")])
        self.assertEqual(amard["mandats"][1]["fonctions"], ["Député", "Secrétaire de l'Assemblée nationale", "Député"])

    def test_fiche_citee_par_l_amo_pas_de_revue(self):
        # l'AMO cite la fiche Sénat : référence explicite (an.acteurs), même malgré un nom différent
        # (« Fraysse-Cazalis » au Sénat, « Fraysse » à l'AN)
        self.assertEqual(self.cas("20684B"), [])
        self.assertEqual(self.cas("86027F"), [])

    def test_homonyme_seul_en_revue_avec_indices(self):
        (amard,) = self.annuaire["gabriel amard"]
        self.annuaire["gabriel amard"] = [{**amard, "fiche_senat": None}]      # sans fiche citée
        (cas,) = self.cas("20684B")
        self.assertIsInstance(cas, CasRevue)                    # ni Objet ni Rapprochement : rien n'est relié
        self.assertEqual((cas.type, cas.cle, cas.nature, cas.sujet),
                         ("identite_senateur_ancien_depute", "identite_senateur_ancien_depute:20684B", "identite",
                          ("personne", SENAT("senateur", "20684B"))))
        (c,) = cas.candidats
        self.assertEqual((c.identite, c.indices), (AN("acteur", "PA794906"), {
            "homonyme": True, "fiche_senat_citee": False, "depute": True, "debuts_concordants": 2,
            "mandats_chevauchants": 2}))
        self.assertEqual((cas.contexte["mandats_comparables"], cas.contexte["priorite"]), (2, 2))
        self.assertIn("2022–2026", cas.constat)

    def test_sans_candidat_pas_de_cas(self):
        self.assertEqual(self.cas("83008P"), [])                # député en 1981 : avant l'AMO

    def test_etape_apres_les_acteurs_an(self):
        self.assertIn("an.acteurs", senateurs.ETAPE.apres)
        self.assertIn(senateurs.ANCIENS_DEPUTES, senateurs.ETAPE.sources({}))


class ContratDecision:
    """Sénateur et acteur AN sont deux entités `personne` : la décision « même personne » les
    fusionne (docs/rapprochements.md §7)."""

    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        dossier = tempfile.TemporaryDirectory()
        self.addCleanup(dossier.cleanup)
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)
        self.ctx = ContexteCanon(self.entrepot, self.registre, {}, {})
        self.source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.SENAT, "x", "y", "z"))
        for identite in (AN("acteur", "PA794906"), SENAT("senateur", "20684B")):
            ecrire(self.ctx, Objet("personne", identite, {"nom": "Amard", "nom_affiche": "Gabriel Amard"}),
                   self.source, None)
        s = senateurs.anciens_deputes(eludep(Path(dossier.name)))
        amard = next(x for x in s if x["Matricule"] == "20684B")
        annuaire = {"gabriel amard": [{"acteur": "PA794906", "libelle": "Gabriel Amard", "depute": True,
                                       "fiche_senat": None, "mandats_depute": []}]}      # homonyme seul
        (self.cas,) = senateurs.ancien_depute(document_ligne(senateurs.ANCIENS_DEPUTES, "eludep", "20684B", amard),
                                              annuaire)

    def test_cas_applicable_par_fusion(self):
        ecrire(self.ctx, self.cas, self.source, None)
        (c,) = self.entrepot.cas_revue()
        # le sujet et le candidat sont deux entités existantes : c'est ce que la fusion attend
        self.assertEqual((c["statut"], c["sujet_id"] is not None, c["candidats"][0]["entite_id"] is not None),
                         ("A_REVOIR", True, True))
        self.assertNotEqual(str(c["sujet_id"]), c["candidats"][0]["entite_id"])

    def test_decision_fusionne_les_deux_fiches(self):
        ecrire(self.ctx, self.cas, self.source, None)
        senateur = self.registre.resoudre(SENAT("senateur", "20684B"))
        acteur = self.registre.resoudre(AN("acteur", "PA794906"))
        revue.decider(self.entrepot, self.registre, self.cas.cle, 0, "relecteur", "fiche Sénat citée par l'AMO")
        self.assertEqual(self.registre.resoudre(SENAT("senateur", "20684B")), acteur)
        self.assertEqual(self.entrepot.fusionnee_dans(senateur), acteur)
        manuelle = [c for c in self.entrepot.correspondances(SENAT("senateur", "20684B")) if c.methode == Methode.MANUAL]
        self.assertEqual([(c.statut, c.preuve["cas"]) for c in manuelle], [(Statut.VERIFIED, self.cas.cle)])


class DecisionMemoire(ContratDecision, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)



from tests.test_postgres import CX, remettre_a_zero  # noqa: E402


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class DecisionPostgres(ContratDecision, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation, analytique.cas_revue CASCADE")
        return EntrepotPostgres(CX)


if __name__ == "__main__":
    unittest.main()
