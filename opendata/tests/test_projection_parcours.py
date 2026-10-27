"""
Parcours suivi (lecture.parcours_*) sur des mini-dossiers fabriqués, d'après les modèles de
opendata/parcours/, valeurs calculées à la main : loi accélérée en cours avec un 49.3 (conclusions
de CMP lues par une seule chambre), navette normale complète (CMP en désaccord, nouvelle lecture,
lecture définitive, CC, loi publiée), texte du Sénat adopté sans modification par l'AN,
engagement de responsabilité rattaché au texte, résolution 34-1, dossier du Sénat (codes DOSLEG)
devenu caduc. Jour de référence fixé : 10/07/2026. Règles : docs/indicateurs.md.
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

        def dossier(uid, actes, type_procedure="Projet de loi ordinaire"):
            """`actes` : (code, type, jour, conclusion), chambre et lecture lues sur le code AN, ou
            (code, type, jour, conclusion, chambre, lecture) pour un code DOSLEG."""
            ecrire(ctx, Objet("dossier", AN("dossier", uid), {"titre": uid, "type_procedure": type_procedure}), src, None)
            for ordre, (code, type_, jour, conclusion, *chambre_lecture) in enumerate(actes):
                racine = code.split("-")[0]
                chambre, lecture = chambre_lecture or (
                    {"CMP": "CMP", "CC": "CC", "PROM": "PR"}.get(racine, "AN" if racine.startswith("AN") else "SENAT"),
                    {"AN1": "1", "SN1": "1", "AN2": "2", "SN2": "2", "ANNLEC": "nouvelle", "SNNLEC": "nouvelle",
                     "ANLDEF": "definitive", "ANLUNI": "unique", "AN21": "an21", "CMP": "cmp", "CC": "cc",
                     "PROM": "prom"}[racine])
                ecrire(ctx, Objet("etape", AN("acte", f"{uid}:{ordre}"), {
                    "dossier_id": AN("dossier", uid), "type": type_, "code_source": code, "chambre": chambre,
                    "lecture": lecture, "ordre": ordre, "debut": jour, "statut": "faite", "conclusion": conclusion}), src, None)

        def cite(acte, document):
            ecrire(ctx, Dependants("lien", {"de_id": AN("acte", acte), "nature": "texte"},
                                   [{"vers_id": AN("document", document), "ordre": 0}], "/", ("vers_id",)), src, None)

        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            # A : accéléré, 49.3 en première lecture (motion rejetée). Le Sénat n'a pas publié de
            # rapport ; l'AN a lu les conclusions de la CMP, la séance du Sénat est inscrite au 20/07
            # (après le jour de référence).
            dossier("A", [
                ("AN1", "lecture", None, None), ("AN1-DEPOT", "depot", date(2026, 1, 5), None),
                ("AN1-PROCACC", "procedure_acceleree", date(2026, 1, 5), None),
                ("AN1-COM-FOND-SAISIE", "saisine_commission", date(2026, 1, 6), None),
                ("AN1-COM-FOND-RAPPORT", "rapport", date(2026, 1, 20), None),
                ("AN1-DEBATS-SEANCE", "seance", date(2026, 2, 1), None),
                ("AN1-DEBATS-DEC", "decision", date(2026, 2, 2), "adopté"),
                ("AN1-DGVT", "declaration_gouvernement", date(2026, 2, 1), None),
                ("AN1-MOTION-VOTE", "motion", date(2026, 2, 2), "Motion rejetée"),
                ("SN1", "lecture", None, None), ("SN1-DEPOT", "depot", date(2026, 2, 3), None),
                ("SN1-COM-FOND-SAISIE", "saisine_commission", date(2026, 2, 3), None),
                ("SN1-DEBATS-DEC", "decision", date(2026, 3, 1), "modifié"),
                ("CMP", "cmp", None, None), ("CMP-SAISIE", "convocation_cmp", date(2026, 3, 5), None),
                ("CMP-DEC", "decision", date(2026, 3, 10), "Accord"),
                ("CMP-DEBATS-AN-DEC", "decision", date(2026, 3, 20), "adopté"),
                ("CMP-DEBATS-SN-DEC", "decision", date(2026, 3, 21), "adopté"),   # retirée de la source
                ("CMP-DEBATS-SN-SEANCE", "seance", date(2026, 7, 20), None),
                ("AN1-INCONNU", "autre", date(2026, 3, 22), None)])                # code hors correspondances
            # B : navette normale complète ; décision du CC et loi publiée hors actes AN.
            dossier("B", [
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
            dossier("C", [
                ("SN1", "lecture", None, None), ("SN1-DEPOT", "depot", date(2026, 1, 1), None),
                ("SN1-DEBATS-DEC", "decision", date(2026, 2, 1), "adoptée"),
                ("AN1-DEPOT", "depot", date(2026, 2, 2), None),
                ("AN1-DEBATS-DEC", "decision", date(2026, 3, 1), "adoptée sans modification")])
            # E : l'engagement de responsabilité sur A, publié comme dossier ; sa déclaration (DECL1)
            # est citée par l'acte AN1-DGVT de A.
            dossier("E", [
                ("AN21", "lecture", None, None), ("AN21-DGVT", "declaration_gouvernement", date(2026, 2, 1), None),
                ("AN21-MOTION", "motion", date(2026, 2, 1), None),
                ("AN21-MOTION-VOTE", "motion", date(2026, 2, 3), "Motion rejetée"),
                ("AN21-DEBATS-SEANCE", "seance", date(2026, 2, 3), None)],
                "Engagement de la responsabilité gouvernementale")
            ecrire(ctx, Objet("document", AN("document", "DECL1"), {"dossier_id": AN("dossier", "E"), "type": "autre"}),
                   src, None)
            cite("E:1", "DECL1")
            cite("A:7", "DECL1")
            # F : résolution de l'article 34-1, adoptée.
            dossier("F", [("ANLUNI", "lecture", None, None), ("ANLUNI-DEPOT", "depot", date(2026, 4, 1), None),
                          ("ANLUNI-DEBATS-DEC", "decision", date(2026, 5, 1), "adoptée")], "Résolution Article 34-1")
            # G : proposition de loi du Sénat (codes DOSLEG), adoptée au Sénat puis caduque (état sans date).
            dossier("G", [
                ("DOSLEG-1", "lecture", None, None, None, "1"),
                ("DOSLEG-1-S-TXT1", "depot", date(2020, 1, 1), "déposé au Sénat", "SENAT", "1"),
                ("DOSLEG-1-S-RAP", "rapport", date(2020, 2, 1), None, "SENAT", "1"),
                ("DOSLEG-1-S-TXT11", "decision", date(2020, 3, 1), "adopté par le Sénat", "SENAT", "1"),
                ("DOSLEG-ETAT-05", "etat", None, "caduc", None, None)], "proposition de loi")
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
            ecrire(ctx, Dependants("lien", {"de_id": AN("acte", "A:18"), "nature": "reunion"},
                                   [{"vers_id": AN("reunion", "R3"), "ordre": 0}], "/", ("vers_id",)), src, None)
        CX.execute("UPDATE canon.entite SET retiree_de_la_source_le = now() WHERE entite_id = "
                   "(SELECT entite_id FROM canon.correspondance WHERE id_source = 'A:17')")
        CX.execute(f"SET civictrace.date_reference = '{REFERENCE}'")
        try:
            ProjecteurPostgres(CX).projeter()
        finally:
            CX.execute("RESET civictrace.date_reference")

    def requete(self, table, uid, colonnes, ordre=""):
        return CX.execute(f"SELECT {colonnes} FROM lecture.{table} p JOIN canon.correspondance c "
                          "ON c.entite_id = p.dossier_id AND c.type_entite = 'dossier' WHERE c.id_source = %s "
                          f"{ordre}", (uid,)).fetchall()

    def cases(self, uid, colonnes="cle, etat"):
        return self.requete("parcours_dossier", uid, colonnes, "ORDER BY p.rang")

    def synthese(self, uid, colonnes):
        return self.requete("parcours_dossier_synthese", uid, colonnes)[0]

    def test_accelere_en_cours(self):
        self.assertEqual(self.cases("A"), [
            ("depot", "faite"), ("commission_1_o", "faite"), ("seance_1_o", "faite"), ("transmission_1_s", "faite"),
            ("commission_1_s", "inconnu"),      # saisie, pas de rapport publié, la séance a eu lieu
            ("seance_1_s", "faite"),
            ("lecture_2_o", "sans_objet"), ("lecture_2_s", "sans_objet"), ("lecture_n", "sans_objet"),
            ("cmp", "faite"),
            ("conclusions_cmp", "en_cours"),    # AN seule : la décision du Sénat est retirée de la source
            ("nouvelle_lecture", "a_venir"), ("lecture_definitive", "a_venir"), ("cc", "a_venir"),
            ("promulgation", "a_venir"), ("jo", "a_venir")])
        self.assertEqual(self.cases("A", "cle, debut, fin, conclusion")[1:3], [
            ("commission_1_o", date(2026, 1, 6), date(2026, 1, 20), None),
            ("seance_1_o", date(2026, 2, 1), date(2026, 2, 2), "adopté")])
        # conclusions : courante, séance du Sénat programmée le 20/07, deux actes en provenance
        self.assertEqual(self.cases("A", "cle, courante, programmee_le, conclusion, cardinality(provenance)")[10],
                         ("conclusions_cmp", True, date(2026, 7, 20), "AN : adopté", 2))
        # prochaine échéance : l'acte du 20/07, heure et état lus sur la réunion qu'il cite ; le
        # point supprimé du 12/07 est ignoré ; un acte au code inconnu est compté hors modèle
        self.assertEqual(self.synthese("A", "modele, procedure, origine, etape_courante, cases_faites, cases_affichees, "
                                            "cases_inconnues, actes_hors_modele, issue, prochaine_echeance, "
                                            "prochaine_echeance_heure, prochaine_echeance_libelle, "
                                            "prochaine_echeance_etat, prochaine_echeance_cle"),
                         ("loi_ordinaire", "acceleree", "AN", "conclusions_cmp", 6, 13, 1, 1, "en_cours", date(2026, 7, 20),
                          datetime(2026, 7, 20, 13, 0, tzinfo=timezone.utc), "Vote du texte de la CMP", "Eventuel",
                          "conclusions_cmp"))

    def test_deviations_rattachees_a_leur_etape(self):
        # procédure accélérée au dépôt ; 49.3 sur la séance, motion rejetée : le parcours reprend
        self.assertEqual(self.requete("parcours_deviation", "A", "cle, etape_cle, effet, conclusion", "ORDER BY p.ordre"), [
            ("procedure_acceleree", "depot", "rejoint", None),
            ("engagement_responsabilite", "seance_1_o", "rejoint", "Motion rejetée")])

    def test_navette_normale_complete(self):
        self.assertEqual(self.cases("B"), [
            ("depot", "faite"),
            ("commission_1_o", "inconnu"), ("seance_1_o", "faite"), ("transmission_1_s", "faite"),
            ("commission_1_s", "inconnu"),      # aucune trace de commission publiée, la suite a eu lieu
            ("seance_1_s", "faite"), ("lecture_2_o", "faite"), ("lecture_2_s", "faite"),
            ("lecture_n", "sans_objet"), ("cmp", "faite"),
            ("conclusions_cmp", "sans_objet"),  # CMP en désaccord : branche vers la nouvelle lecture
            ("nouvelle_lecture", "faite"), ("lecture_definitive", "faite"), ("cc", "faite"),
            ("promulgation", "faite"), ("jo", "faite")])
        lignes = {cle: reste for cle, *reste in self.cases("B", "cle, debut, fin, conclusion, cardinality(provenance)")}
        self.assertEqual(lignes["nouvelle_lecture"], [date(2026, 1, 10), date(2026, 2, 10), "AN : adoptée · Sénat : rejetée", 2])
        # CC : saisine (acte AN) puis décision du stock CONSTIT ; loi publiée : promulguée, date de
        # signature inconnue ; JO daté
        self.assertEqual(lignes["cc"], [date(2026, 3, 12), date(2026, 4, 1), "Conformité", 2])
        self.assertEqual(lignes["promulgation"], [None, None, "Loi n° 2026-1", 1])
        self.assertEqual(lignes["jo"], [date(2026, 4, 10), date(2026, 4, 10), "JO n° 80", 1])
        self.assertEqual(self.requete("parcours_branche", "B", "de, vers"), [("cmp", "nouvelle_lecture")])
        self.assertEqual(self.synthese("B", "etape_courante, cases_faites, cases_affichees, issue, prochaine_echeance"),
                         (None, 12, 14, "promulgue", None))

    def test_texte_du_senat_adopte_conforme(self):
        self.assertEqual(self.cases("C", "cle, libelle, chambre, etat"), [
            ("depot", "Dépôt Sénat", "SENAT", "faite"),
            ("commission_1_o", "Commission Sénat", "SENAT", "inconnu"),
            ("seance_1_o", "Séance Sénat", "SENAT", "faite"),
            ("transmission_1_s", "Transmission AN", "AN", "faite"),
            ("commission_1_s", "Commission AN", "AN", "inconnu"),
            ("seance_1_s", "Séance AN", "AN", "faite"),
            # adopté sans modification : branche vers le Conseil constitutionnel, la navette est sans objet
            ("lecture_2_o", "2e lecture Sénat", "SENAT", "sans_objet"),
            ("lecture_2_s", "2e lecture AN", "AN", "sans_objet"),
            ("lecture_n", "Lectures suivantes", None, "sans_objet"),
            ("cmp", "CMP", "CMP", "sans_objet"),
            ("conclusions_cmp", "Vote du texte de la CMP", None, "sans_objet"),
            ("nouvelle_lecture", "Nouvelle lecture", None, "sans_objet"),
            ("lecture_definitive", "Lecture définitive AN", "AN", "sans_objet"),
            ("cc", "Conseil constitutionnel", "CC", "a_venir"),
            ("promulgation", "Promulgation", "PR", "a_venir"),
            ("jo", "Journal officiel", "JO", "a_venir")])
        # aucune étape en cours ni programmée : pas d'étape courante, l'étape attendue est le CC ;
        # l'échéance vient de l'agenda seul, sans étape (le point ne cite pas d'acte)
        self.assertEqual(self.synthese("C", "etape_courante, etape_attendue, cases_affichees, prochaine_echeance, "
                                            "prochaine_echeance_libelle, prochaine_echeance_etat, prochaine_echeance_cle"),
                         (None, "cc", 9, date(2026, 7, 15), "Séance publique AN · Discussion", "Confirmé", None))

    def test_engagement_de_responsabilite_enfant_du_texte(self):
        self.assertEqual(self.cases("E"), [("declaration", "faite"), ("motion", "faite"), ("debat", "faite"),
                                           ("vote", "faite")])
        parent = CX.execute("SELECT etape_cle FROM lecture.dossier_lien").fetchall()
        self.assertEqual(parent, [("seance_1_o",)])
        # racine : le dossier du texte ; issue : la motion est rejetée
        racine, issue = self.synthese("E", "racine_id, issue")
        self.assertEqual((racine, issue), (self.synthese("A", "dossier_id")[0], "rejete"))

    def test_resolution_34_1(self):
        self.assertEqual(self.cases("F"), [("depot", "faite"), ("seance", "faite")])
        self.assertEqual(self.synthese("F", "modele, issue"), ("resolution_34_1", "adopte"))

    def test_senat_caduc(self):
        # codes DOSLEG ; caducité (état publié sans date) : la suite est sans objet, jamais un échec
        etats = dict(self.cases("G"))
        self.assertEqual([etats[c] for c in ("depot", "commission_1_o", "seance_1_o", "transmission_1_s", "jo")],
                         ["faite", "faite", "faite", "sans_objet", "sans_objet"])
        self.assertEqual(self.requete("parcours_deviation", "G", "cle, etape_cle, effet"),
                         [("caducite", "seance_1_o", "termine")])
        self.assertEqual(self.synthese("G", "issue, etape_attendue"), ("caduc", None))


if __name__ == "__main__":
    unittest.main()
