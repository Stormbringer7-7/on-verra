"""Barre de parcours (lecture.parcours_dossier) sur trois mini-dossiers fabriqués, valeurs calculées
à la main : accéléré en cours (conclusions de CMP lues par une seule chambre), navette normale
complète (CMP en désaccord, nouvelle lecture, lecture définitive, CC, loi publiée), texte du Sénat
adopté sans modification par l'AN. Jour de référence fixé : 10/07/2026. Règles : docs/indicateurs.md.
"""

import unittest
from datetime import date, datetime, timezone

from tests.test_postgres import CX, remettre_a_zero

REFERENCE = "2026-07-10"


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class ParcoursDossier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, ProjecteurPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Dependants, Objet
        from src.identites import RegistreIdentites
        remettre_a_zero(CX)
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)

        def dossier(uid, accelere, actes):
            ecrire(ctx, Objet("dossier", AN("dossier", uid), {"titre": uid, "type_procedure": "Projet de loi ordinaire",
                                                             "procedure_acceleree": accelere}), src, None)
            for ordre, (code, type_, jour, conclusion) in enumerate(actes):
                racine = code.split("-")[0]
                chambre = {"CMP": "CMP", "CC": "CC", "PROM": "PR"}.get(racine, "AN" if racine.startswith("AN") else "SENAT")
                lecture = {"AN1": "1", "SN1": "1", "AN2": "2", "SN2": "2", "ANNLEC": "nouvelle", "SNNLEC": "nouvelle",
                           "ANLDEF": "definitive", "CMP": "cmp", "CC": "cc", "PROM": "prom"}[racine]
                ecrire(ctx, Objet("etape", AN("acte", f"{uid}:{ordre}"), {
                    "dossier_id": AN("dossier", uid), "type": type_, "code_source": code, "chambre": chambre,
                    "lecture": lecture, "ordre": ordre, "debut": jour, "statut": "faite", "conclusion": conclusion}), src, None)

        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            # A : accéléré. Le Sénat n'a pas publié de rapport ; l'AN a lu les conclusions de la CMP,
            # la séance du Sénat est inscrite au 20/07 (après le jour de référence).
            dossier("A", True, [
                ("AN1", "lecture", None, None), ("AN1-DEPOT", "depot", date(2026, 1, 5), None),
                ("AN1-PROCACC", "procedure_acceleree", date(2026, 1, 5), None),
                ("AN1-COM-FOND-SAISIE", "saisine_commission", date(2026, 1, 6), None),
                ("AN1-COM-FOND-RAPPORT", "rapport", date(2026, 1, 20), None),
                ("AN1-DEBATS-SEANCE", "seance", date(2026, 2, 1), None),
                ("AN1-DEBATS-DEC", "decision", date(2026, 2, 2), "adopté"),
                ("SN1", "lecture", None, None), ("SN1-DEPOT", "depot", date(2026, 2, 3), None),
                ("SN1-COM-FOND-SAISIE", "saisine_commission", date(2026, 2, 3), None),
                ("SN1-DEBATS-DEC", "decision", date(2026, 3, 1), "modifié"),
                ("CMP", "cmp", None, None), ("CMP-SAISIE", "convocation_cmp", date(2026, 3, 5), None),
                ("CMP-DEC", "decision", date(2026, 3, 10), "Accord"),
                ("CMP-DEBATS-AN-DEC", "decision", date(2026, 3, 20), "adopté"),
                ("CMP-DEBATS-SN-DEC", "decision", date(2026, 3, 21), "adopté"),   # retirée de la source
                ("CMP-DEBATS-SN-SEANCE", "seance", date(2026, 7, 20), None)])
            # B : navette normale complète ; décision du CC et loi publiée hors actes AN.
            dossier("B", False, [
                ("AN1", "lecture", None, None), ("AN1-DEPOT", "depot", date(2025, 1, 10), None),
                ("AN1-DEBATS-DEC", "decision", date(2025, 3, 1), "adoptée"),
                ("SN1-DEPOT", "depot", date(2025, 3, 2), None), ("SN1-DEBATS-DEC", "decision", date(2025, 6, 1), "modifiée"),
                ("AN2-DEBATS-DEC", "decision", date(2025, 9, 1), "adoptée"),
                ("SN2-DEBATS-DEC", "decision", date(2025, 11, 1), "modifiée"),
                ("CMP-SAISIE", "convocation_cmp", date(2025, 11, 10), None),
                ("CMP-DEC", "decision", date(2025, 11, 20), "Désaccord"),
                ("ANNLEC-DEBATS-DEC", "decision", date(2026, 1, 10), "adoptée"),
                ("SNNLEC-DEBATS-DEC", "decision", date(2026, 2, 10), "rejetée"),
                ("ANLDEF-DEBATS-DEC", "decision", date(2026, 3, 10), "adoptée"),
                ("CC-SAISIE-AN", "saisine_cc", date(2026, 3, 12), None)])
            ecrire(ctx, Objet("decision_cc", IdentiteNative(Systeme.CONSTIT, "decision", "2026-1"), {
                "numero": "2026-1", "type": "DC", "date": date(2026, 4, 1), "solution": "Conformité",
                "dossier_id": AN("dossier", "B")}), src, None)
            ecrire(ctx, Objet("texte_publie", IdentiteNative(Systeme.LEGIFRANCE, "nor", "NOR1"), {
                "nature": "LOI", "numero": "2026-1", "nor": "NOR1", "date_publication": date(2026, 4, 10),
                "numero_jo": "80", "dossier_id": AN("dossier", "B")}), src, None)
            # C : déposé au Sénat, adopté sans modification par l'AN : la navette s'arrête.
            dossier("C", False, [
                ("SN1", "lecture", None, None), ("SN1-DEPOT", "depot", date(2026, 1, 1), None),
                ("SN1-DEBATS-DEC", "decision", date(2026, 2, 1), "adoptée"),
                ("AN1-DEPOT", "depot", date(2026, 2, 2), None),
                ("AN1-DEBATS-DEC", "decision", date(2026, 3, 1), "adoptée sans modification")])
            # Agenda : A a un point supprimé le 12/07 et la séance du 20/07, citée par l'acte programmé
            # (point « Eventuel ») ; C a un point confirmé le 15/07, sans acte.
            for uid, chambre, jour, etat, d in (("R1", "AN", 12, "Supprimé", "A"), ("R2", "AN", 15, "Confirmé", "C"),
                                                ("R3", "SENAT", 20, "Eventuel", "A")):
                ecrire(ctx, Objet("reunion", AN("reunion", uid), {
                    "type": "seance", "chambre": chambre, "debut": datetime(2026, 7, jour, 13, 0, tzinfo=timezone.utc)}),
                       src, None)
                ecrire(ctx, Objet("point_odj", AN("point_odj", uid), {
                    "reunion_id": AN("reunion", uid), "ordre": 1, "type": "Discussion", "etat": etat,
                    "dossier_id": AN("dossier", d)}), src, None)
            ecrire(ctx, Dependants("lien", {"de_id": AN("acte", "A:16"), "nature": "reunion"},
                                   [{"vers_id": AN("reunion", "R3"), "ordre": 0}], "/", ("vers_id",)), src, None)
        CX.execute("UPDATE canon.entite SET retiree_de_la_source_le = now() WHERE entite_id = "
                   "(SELECT entite_id FROM canon.correspondance WHERE id_source = 'A:15')")
        CX.execute(f"SET civictrace.date_reference = '{REFERENCE}'")
        try:
            ProjecteurPostgres(CX).projeter()
        finally:
            CX.execute("RESET civictrace.date_reference")

    def cases(self, uid, colonnes="cle, etat"):
        return CX.execute(f"SELECT {colonnes} FROM lecture.parcours_dossier p JOIN canon.correspondance c "
                          "ON c.entite_id = p.dossier_id AND c.type_entite = 'dossier' WHERE c.id_source = %s "
                          "ORDER BY p.rang", (uid,)).fetchall()

    def synthese(self, uid, colonnes):
        return CX.execute(f"SELECT {colonnes} FROM lecture.parcours_dossier_synthese p JOIN canon.correspondance c "
                          "ON c.entite_id = p.dossier_id AND c.type_entite = 'dossier' WHERE c.id_source = %s",
                          (uid,)).fetchone()

    def test_accelere_en_cours(self):
        self.assertEqual(self.cases("A"), [
            ("depot", "faite"), ("commission_1_o", "faite"), ("seance_1_o", "faite"),
            ("commission_1_s", "inconnu"),      # saisie, pas de rapport publié, la séance a eu lieu
            ("seance_1_s", "faite"),
            ("lecture_2_o", "sans_objet"), ("lecture_2_s", "sans_objet"),   # CMP réunie après une lecture
            ("cmp", "faite"),
            ("conclusions_cmp", "en_cours"),    # AN seule : la décision du Sénat est retirée de la source
            ("nouvelle_lecture", "a_venir"), ("lecture_definitive", "a_venir"), ("cc", "a_venir"),
            ("promulgation", "a_venir"), ("jo", "a_venir")])
        self.assertEqual(self.cases("A", "cle, debut, fin, conclusion")[1:3], [
            ("commission_1_o", date(2026, 1, 6), date(2026, 1, 20), None),
            ("seance_1_o", date(2026, 2, 1), date(2026, 2, 2), "adopté")])
        # conclusions : courante, séance du Sénat programmée le 20/07, deux étapes en provenance
        self.assertEqual(self.cases("A", "cle, courante, programmee_le, conclusion, cardinality(provenance)")[8],
                         ("conclusions_cmp", True, date(2026, 7, 20), "AN : adopté", 2))
        # prochaine échéance : l'acte du 20/07, heure et état lus sur la réunion qu'il cite ; le
        # point supprimé du 12/07 est ignoré
        self.assertEqual(self.synthese("A", "procedure, origine, etape_courante, cases_faites, cases_affichees, "
                                            "cases_inconnues, prochaine_echeance, prochaine_echeance_heure, "
                                            "prochaine_echeance_libelle, prochaine_echeance_etat, prochaine_echeance_cle"),
                         ("acceleree", "AN", "conclusions_cmp", 5, 12, 1, date(2026, 7, 20),
                          datetime(2026, 7, 20, 13, 0, tzinfo=timezone.utc), "Vote du texte de la CMP", "Eventuel",
                          "conclusions_cmp"))

    def test_navette_normale_complete(self):
        self.assertEqual(self.cases("B"), [
            ("depot", "faite"), ("lecture_1_o", "faite"), ("lecture_1_s", "faite"), ("lecture_2_o", "faite"),
            ("lecture_2_s", "faite"), ("cmp", "faite"),
            ("conclusions_cmp", "sans_objet"),  # CMP en désaccord
            ("nouvelle_lecture", "faite"), ("lecture_definitive", "faite"), ("cc", "faite"),
            ("promulgation_jo", "faite")])
        lignes = {cle: reste for cle, *reste in self.cases("B", "cle, debut, fin, conclusion, cardinality(provenance)")}
        self.assertEqual(lignes["nouvelle_lecture"], [date(2026, 1, 10), date(2026, 2, 10), "AN : adoptée · Sénat : rejetée", 2])
        # CC : saisine (acte AN) puis décision du stock CONSTIT ; loi : date du JO, sans acte de promulgation
        self.assertEqual(lignes["cc"], [date(2026, 3, 12), date(2026, 4, 1), "Conformité", 2])
        self.assertEqual(lignes["promulgation_jo"], [None, date(2026, 4, 10), "Loi n° 2026-1 · JO n° 80", 1])
        self.assertEqual(self.synthese("B", "etape_courante, cases_faites, cases_affichees, prochaine_echeance"),
                         (None, 10, 10, None))

    def test_texte_du_senat_adopte_conforme(self):
        self.assertEqual(self.cases("C", "cle, libelle, chambre, etat"), [
            ("depot", "Dépôt", "SENAT", "faite"),
            ("lecture_1_o", "1re lecture Sénat", "SENAT", "faite"),
            ("lecture_1_s", "1re lecture AN", "AN", "faite"),
            ("lecture_2_o", "2e lecture Sénat", "SENAT", "sans_objet"),
            ("lecture_2_s", "2e lecture AN", "AN", "sans_objet"),
            ("cmp", "CMP", "CMP", "sans_objet"),
            ("conclusions_cmp", "Vote du texte de la CMP", "AN+SENAT", "sans_objet"),
            ("nouvelle_lecture", "Nouvelle lecture", "AN+SENAT", "sans_objet"),
            ("lecture_definitive", "Lecture définitive AN", "AN", "sans_objet"),
            ("cc", "Conseil constit.", "CC", "a_venir"),
            ("promulgation_jo", "Promulgation et JO", "PR", "a_venir")])
        # aucune case en cours ni programmée : pas d'étape courante ; l'échéance vient de l'agenda
        # seul, sans case (le point ne cite pas d'étape)
        self.assertEqual(self.synthese("C", "etape_courante, cases_affichees, prochaine_echeance, "
                                            "prochaine_echeance_libelle, prochaine_echeance_etat, prochaine_echeance_cle"),
                         (None, 5, date(2026, 7, 15), "Séance publique AN · Discussion", "Confirmé", None))


if __name__ == "__main__":
    unittest.main()
