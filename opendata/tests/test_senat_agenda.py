"""Agenda de la séance publique du Sénat (DOSLEG `date_seance`) : jours de discussion d'un dossier.

Extrait réel condensé du dump du 24/10/2026 : pjl25-911 (protection des enfants), inscrit en
séance les 27, 28, 29, 30 octobre et 3 novembre 2026. Le contrat est rejoué sur Postgres.
python3 -m unittest discover tests
"""

import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path

from src.adaptateurs.sources.senat import agenda
from src.adaptateurs.sources.senat.dossiers import DOSLEG
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon, ecrire
from src.domaine import EnregistrementSource, IdentiteNative, Systeme
from src.domaine.objets import Ensemble, Objet
from src.identites import RegistreIdentites

SENAT = lambda t, i: IdentiteNative(Systeme.SENAT, t, i)
# clés complétées d'espaces, comme dans le dump
LOI = "83479       \tpjl \tpjl25-911\tProtection des enfants                    \n" \
      "85381       \tppl \tppl25-940\tAccès à un panier diversifié de denrées alimentaires\n"
LECTURE = "97392          \t83479       \t1  \tPremière lecture             \n"
LECASS = "111525         \t97392          \tS\n" "99999          \t97392          \tA\n"
DATES = ["111525         \t2026-10-27 00:00:00\t31479\t\\N", "111525         \t2026-10-28 00:00:00\t31480\t\\N",
         "111525         \t2026-10-29 00:00:00\t31481\t\\N", "111525         \t2026-10-30 00:00:00\t31519\t\\N",
         "111525         \t2026-11-03 00:00:00\t31520\t\\N",
         "111525         \t2024-06-11 00:00:00\t28500\t\\N",       # avant la 17e législature : ignorée
         "99999          \t2026-10-27 00:00:00\t31600\t\\N",       # lecture de l'AN : ignorée
         "424242         \t2026-10-27 00:00:00\t31601\t\\N"]       # lecture inconnue : chaîne rompue


def dump(dossier: Path, dates=DATES) -> Path:
    chemin = dossier / "dosleg.zip"
    with zipfile.ZipFile(chemin, "w") as z:
        z.writestr("dosleg.sql", "SET client_encoding = 'UTF8';\n"
                   f"COPY loi (loicod, typloicod, signet, loient) FROM stdin;\n{LOI}\\.\n"
                   f"COPY lecture (lecidt, loicod, typleccod, leccom) FROM stdin;\n{LECTURE}\\.\n"
                   f"COPY lecass (lecassidt, lecidt, codass) FROM stdin;\n{LECASS}\\.\n"
                   "COPY date_seance (lecidt, date_s, code, statut) FROM stdin;\n" + "\n".join(dates) + "\n\\.\n")
    return chemin


class Lecture(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.chemin = dump(Path(self.dossier.name))

    def tearDown(self):
        self.dossier.cleanup()

    def test_jours_de_seance_relies_au_dossier(self):
        elements = list(agenda.agenda(agenda.document(self.chemin)))
        objets = [e for e in elements if isinstance(e, Objet)]
        self.assertEqual([o.identite.id_source for o in objets], ["31479", "31480", "31481", "31519", "31520"])
        premier = objets[0].valeurs
        self.assertEqual((premier["dossier_id"], premier["date"], premier["libelle"], premier["lecture"],
                          premier["chambre"], premier["type_etape"]),
                         (SENAT("dossier", "pjl25-911"), date(2026, 10, 27), "Séance publique du Sénat — Première lecture",
                          "1", "SENAT", "seance"))
        (ensemble,) = [e for e in elements if isinstance(e, Ensemble)]
        self.assertEqual((ensemble.champ, ensemble.parent, len(ensemble.identites)),
                         ("organisation_id", SENAT("organe", "SENAT"), 5))

    def test_lecture_an_chaine_rompue_et_dates_anciennes_ignorees(self):
        codes = {l["code"] for l in agenda.seances(self.chemin)}
        self.assertNotIn("28500", codes)                       # avant le 18/07/2024
        objets = [e.identite.id_source for e in agenda.agenda(agenda.document(self.chemin)) if isinstance(e, Objet)]
        self.assertFalse({"31600", "31601"} & set(objets))      # aucun dossier supposé


class ContratAgenda:
    """Charger, puis relire un ordre du jour modifié : la date disparue est retirée, pas supprimée."""

    def fabrique(self):
        raise NotImplementedError

    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.entrepot = self.fabrique()
        self.registre = RegistreIdentites(self.entrepot)
        source, _ = self.entrepot.enregistrer_source(EnregistrementSource(Systeme.SENAT, "x", "y", "z"))
        ctx = ContexteCanon(self.entrepot, self.registre, {}, {})
        ecrire(ctx, Objet("organisation", SENAT("organe", "SENAT"), {"type": "assemblee", "nom": "Sénat",
                                                                    "chambre": "SENAT"}), source, None)
        ecrire(ctx, Objet("dossier", SENAT("dossier", "pjl25-911"), {"titre": "Protection des enfants"}), source, None)

    def tearDown(self):
        self.dossier.cleanup()

    def charger(self, dates):
        chemin = dump(Path(self.dossier.name), dates)
        agenda.executer(ContexteCanon(self.entrepot, self.registre, {DOSLEG.nom: chemin}, {}))

    def test_ordre_du_jour_modifie(self):
        self.charger(DATES)
        dossier = self.registre.resoudre(SENAT("dossier", "pjl25-911"))
        e = self.registre.resoudre(SENAT("date_seance", "31520"))
        self.assertEqual((self.entrepot.lire("evenement_agenda", e)["dossier_id"],
                          str(self.entrepot.lire("evenement_agenda", e)["date"])), (dossier, "2026-11-03"))
        self.assertEqual(self.entrepot.retirees("evenement_agenda"), set())
        # la Conférence des présidents retire le 3 novembre
        self.charger([d for d in DATES if "31520" not in d])
        self.assertEqual(self.entrepot.retirees("evenement_agenda"), {e})
        self.assertIsNotNone(self.entrepot.lire("evenement_agenda", e))     # marquée, jamais supprimée


class AgendaMemoire(ContratAgenda, unittest.TestCase):
    fabrique = staticmethod(EntrepotMemoire)


from tests.test_postgres import CX, remettre_a_zero  # noqa: E402


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class AgendaPostgres(ContratAgenda, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation, analytique.cas_revue CASCADE")
        return EntrepotPostgres(CX)


class Etape(unittest.TestCase):
    def test_enregistree_apres_les_dossiers(self):
        from src.adaptateurs.sources.senat import ETAPES
        self.assertIn(agenda.ETAPE, ETAPES)
        self.assertIn("senat.dossiers", agenda.ETAPE.apres)


if __name__ == "__main__":
    unittest.main()
