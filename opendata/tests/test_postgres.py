"""Le contrat de l'Entrepot rejoué sur Postgres, et les migrations du schéma canonique.

Base jetable : DATABASE_URL_ESSAIS (défaut : civictrace_essais sur le Postgres du compose, port
5433). Son nom doit finir par « _essais » : ses schémas sont effacés à chaque test. Tests ignorés
si psycopg ou la base sont indisponibles.

.venv/bin/python -m unittest discover tests
"""

import os
import unittest

from tests.test_identites import ContratEntrepot, ContratIdentites

URL = os.environ.get("DATABASE_URL_ESSAIS",
                     "postgres://big-brother:big-brother@127.0.0.1:5433/civictrace_essais")


def base_essais():
    """Connexion à la base d'essais, créée si besoin ; None si indisponible."""
    try:
        import psycopg
        from psycopg import conninfo, sql
    except ImportError:
        return None
    nom = conninfo.conninfo_to_dict(URL)["dbname"]
    if not nom.endswith("_essais"):
        raise RuntimeError(f"refus d'effacer {nom} : la base d'essais doit finir par _essais")
    try:
        return psycopg.connect(URL, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError:
        pass
    try:
        with psycopg.connect(conninfo.make_conninfo(URL, dbname="postgres"), autocommit=True,
                             connect_timeout=3) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(nom)))
        return psycopg.connect(URL, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError:
        return None


CX = base_essais()


def remettre_a_zero(cx):
    cx.execute("DROP SCHEMA IF EXISTS brut, canon, analytique, lecture CASCADE")
    cx.execute("DROP TABLE IF EXISTS public.civictrace_migration")
    from src.adaptateurs.stockage.postgres import migrer
    return migrer(cx)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class Migrations(unittest.TestCase):
    def test_toutes_appliquees_puis_rien(self):
        from src.adaptateurs.stockage.postgres import migrer
        from src.adaptateurs.stockage.postgres.migrations import fichiers
        appliquees = remettre_a_zero(CX)
        self.assertEqual(len(appliquees), len(fichiers()))
        self.assertEqual(migrer(CX), [])


class _Postgres:
    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation CASCADE")
        return EntrepotPostgres(CX)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class IdentitesPostgres(_Postgres, ContratIdentites, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class EntrepotPostgresContrat(_Postgres, ContratEntrepot, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def historique(self, entite_id):
        return [v for (v,) in CX.execute("SELECT valeurs FROM canon.historique WHERE entite_id = %s "
                                         "ORDER BY remplace_le", (entite_id,))]


if __name__ == "__main__":
    unittest.main()


from tests.test_revue import ContratRevue  # noqa: E402


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class RevuePostgres(_Postgres, ContratRevue, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation, analytique.cas_revue CASCADE")
        return EntrepotPostgres(CX)


from tests.test_sources_rne import ContratRevueRne  # noqa: E402


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class RevueRnePostgres(_Postgres, ContratRevueRne, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def fabrique(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite, analytique.affirmation, analytique.cas_revue CASCADE")
        return EntrepotPostgres(CX)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class RelectureCompteRendu(unittest.TestCase):
    """Compte rendu AN republié (provisoire puis définitif) : des interventions insérées décalent
    l'ordre des suivantes (CRSANR5L17S2027O1N039 : 45 insérées, 440 décalées, 1 retirée)."""

    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def test_interventions_inserees_decalees_et_retirees(self):
        from src.adaptateurs.sources.an import seances
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, Systeme
        from src.identites import RegistreIdentites
        from tests.test_sources_an import NS, compte_rendu, doc, par, point
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})

        def charger(version, *paragraphes):
            with ctx.registre.transaction():
                src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "cr", "CRS1", version))
                for element in seances.seance(doc(seances.SEANCES, compte_rendu(point("X", "", *paragraphes))), NS, {}):
                    ecrire(ctx, element, src, None)

        # v1 : #1, #2, #3 ; v2 : #1, #9 et #4 insérés, #3 décalé du rang 2 au rang 3, #2 n'est plus publié
        # (retiré, il garde son rang 1, que #9 occupe désormais)
        charger("v1", par(1, "PA1", "A", "a"), par(2, "PA2", "B", "b"), par(3, "PA3", "C", "c"))
        charger("v2", par(1, "PA1", "A", "a"), par(9, "PA4", "N", "n"), par(4, "PA5", "D", "d"), par(3, "PA3", "C", "c"))
        lignes = CX.execute(
            "SELECT c.id_source, i.ordre, e.retiree_de_la_source_le IS NOT NULL FROM canon.intervention i "
            "JOIN canon.entite e ON e.entite_id = i.entite_id "
            "JOIN canon.correspondance c ON c.entite_id = i.entite_id ORDER BY 1").fetchall()
        self.assertEqual(lignes, [("CRS1#1", 0, False), ("CRS1#2", 1, True), ("CRS1#3", 3, False),
                                  ("CRS1#4", 2, False), ("CRS1#9", 1, False)])
        doubles = {c["nom"]: c["nombre"] for c in e.controles()}["intervention_ordre_en_double"]
        self.assertEqual(doubles, 0)


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class Projections(unittest.TestCase):
    """Un groupe de 4 députés, 2 scrutins : la participation se lit par rapport au groupe."""

    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def test_participation_attendue_et_ecarts(self):
        from datetime import date
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, ProjecteurPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Dependants, Objet
        from src.identites import RegistreIdentites
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            ecrire(ctx, Objet("organisation", AN("organe", "GA"), {"type": "groupe_politique", "nom": "A", "chambre": "AN"}), src, None)
            for pa in ("P1", "P2", "P3", "P4"):
                ecrire(ctx, Objet("personne", AN("acteur", pa), {"nom": pa, "nom_affiche": pa}), src, None)
                ecrire(ctx, Objet("fonction", AN("mandat", f"M{pa}"), {"personne_id": AN("acteur", pa), "type": "depute",
                                                                         "titre": "Député", "debut": date(2024, 7, 1)}), src, None)
                ecrire(ctx, Objet("fonction", AN("mandat", f"G{pa}"), {"personne_id": AN("acteur", pa),
                                                                         "organisation_id": AN("organe", "GA"), "type": "membre_groupe",
                                                                         "titre": "Membre", "debut": date(2024, 7, 1)}), src, None)
            # scrutin 1 : tout le monde vote, P4 à l'inverse ; scrutin 2 (de nuit) : seul P1 vote
            for uid, jour, votants in (("S1", date(2025, 3, 1), {"P1": "pour", "P2": "pour", "P3": "pour", "P4": "contre"}),
                                       ("S2", date(2025, 3, 2), {"P1": "pour"})):
                ecrire(ctx, Objet("scrutin", AN("scrutin", uid), {"chambre": "AN", "numero": uid, "date": jour, "titre": uid}), src, None)
                ecrire(ctx, Dependants("vote", {"scrutin_id": AN("scrutin", uid)}, [
                    {"personne_id": AN("acteur", p), "position": pos, "groupe_id": AN("organe", "GA"), "par_delegation": False,
                     "cause": None} for p, pos in votants.items()]), src, None)
                ecrire(ctx, Dependants("position_groupe", {"scrutin_id": AN("scrutin", uid)}, [
                    {"groupe_id": AN("organe", "GA"), "position_majoritaire": "pour", "membres": 4, "pour": 3, "contre": 1,
                     "abstentions": 0, "non_votants": 0}]), src, None)
        ProjecteurPostgres(CX).projeter()
        ligne = lambda pa, table, cols: CX.execute(
            f"SELECT {cols} FROM lecture.{table} i JOIN canon.correspondance c ON c.entite_id = i.personne_id "
            f"WHERE c.id_source = %s", (pa,)).fetchone()
        # P2 : 1 participation sur 2 (50 %), attendu = moyenne(100 %, 25 %) = 62,5 % -> -12,5 points
        self.assertEqual(tuple(map(float, ligne("P2", "indicateur_participation", "taux, taux_attendu, ecart_points"))),
                         (50.0, 62.5, -12.5))
        # P1 : 100 % contre 62,5 % attendus
        self.assertEqual(float(ligne("P1", "indicateur_participation", "ecart_points")[0]), 37.5)
        # P4 : un écart (contre) sur un vote en groupe ; P1 : aucun sur deux
        self.assertEqual(ligne("P4", "indicateur_ecarts", "votes_en_groupe, ecarts, ecarts_contre"), (1, 1, 1))
        self.assertEqual(ligne("P1", "indicateur_ecarts", "votes_en_groupe, ecarts"), (2, 0))

    def test_couleur_de_chaque_groupe(self):
        """Officielle si publiée ; sinon celle du groupe AN de la même famille ; sinon de secours, stable."""
        from datetime import date
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, ProjecteurPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Objet
        from src.identites import RegistreIdentites
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        groupes = (
            (Systeme.AN, "DR", {"abrege": "DR", "couleur": "#8CB0DC", "chambre": "AN"}),
            (Systeme.SENAT, "UMPPO", {"abrege": "UMPPO", "chambre": "SENAT"}),
            (Systeme.SENAT, "NOUVEAU", {"abrege": "NOUVEAU", "chambre": "SENAT"}),
        )
        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            ecrire(ctx, Objet("personne", IdentiteNative(Systeme.AN, "acteur", "P1"), {"nom": "P1", "nom_affiche": "P1"}), src, None)
            for systeme, code, champs in groupes:
                ecrire(ctx, Objet("organisation", IdentiteNative(systeme, "organe", code),
                                  {"type": "groupe_politique", "nom": code, **champs}), src, None)
            # le groupe AN a un membre aujourd'hui
            ecrire(ctx, Objet("fonction", IdentiteNative(Systeme.AN, "mandat", "G1"),
                              {"personne_id": IdentiteNative(Systeme.AN, "acteur", "P1"), "type": "membre_groupe", "titre": "Membre",
                               "organisation_id": IdentiteNative(Systeme.AN, "organe", "DR"), "debut": date(2024, 7, 1)}), src, None)
        couleurs = lambda: dict(CX.execute(
            "SELECT o.abrege, (c.couleur, c.source) FROM lecture.couleur_groupe c "
            "JOIN canon.organisation o ON o.entite_id = c.groupe_id").fetchall())
        ProjecteurPostgres(CX).projeter()
        premiere = couleurs()
        self.assertEqual(premiere["DR"], ("#8CB0DC", "officielle"))
        self.assertEqual(premiere["UMPPO"], ("#8CB0DC", "famille"))
        self.assertEqual(premiere["NOUVEAU"][1], "arbitraire")
        self.assertRegex(premiere["NOUVEAU"][0], r"^#[0-9A-F]{6}$")
        ProjecteurPostgres(CX).projeter()
        self.assertEqual(couleurs(), premiere)  # on retombe sur les mêmes couleurs

    def test_position_gauche_droite_et_couleur_par_les_sieges(self):
        """Sièges AN (numPlace) : l'AN numérote de la droite vers la gauche ; un groupe sans couleur
        connue prend celle de sa position sur le dégradé rouge (gauche) → bleu (droite)."""
        from datetime import date
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, ProjecteurPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Dependants, Objet
        from src.identites import RegistreIdentites
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
        # GD siège à droite (sièges 1 et 3), GG à gauche (600 et 650), GM au milieu (300) ; aucun n'a de couleur
        membres = {"P1": ("GD", 1), "P2": ("GD", 3), "P3": ("GM", 300), "P4": ("GG", 600), "P5": ("GG", 650)}
        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            for g in ("GD", "GM", "GG"):
                ecrire(ctx, Objet("organisation", AN("organe", g), {"type": "groupe_politique", "nom": g, "abrege": g,
                                                                   "chambre": "AN"}), src, None)
            for pa in membres:
                ecrire(ctx, Objet("personne", AN("acteur", pa), {"nom": pa, "nom_affiche": pa}), src, None)
            ecrire(ctx, Objet("scrutin", AN("scrutin", "S1"), {"chambre": "AN", "numero": "1", "date": date(2025, 3, 1),
                                                              "titre": "S1"}), src, None)
            ecrire(ctx, Dependants("vote", {"scrutin_id": AN("scrutin", "S1")}, [
                {"personne_id": AN("acteur", pa), "position": "pour", "groupe_id": AN("organe", g), "par_delegation": False,
                 "cause": None, "siege": siege} for pa, (g, siege) in membres.items()]), src, None)
        ProjecteurPostgres(CX).projeter()
        lus = {abrege: (float(position), couleur, source) for abrege, position, couleur, source in CX.execute(
            "SELECT o.abrege, p.position, c.couleur, c.source FROM lecture.position_groupe p "
            "JOIN lecture.couleur_groupe c USING (groupe_id) JOIN canon.organisation o ON o.entite_id = p.groupe_id")}
        self.assertEqual(lus["GD"][0], round(1 - (2 - 1) / 649, 4))  # siège médian 2, bornes 1 et 650 : à droite
        self.assertEqual(lus["GG"][0], round(1 - (625 - 1) / 649, 4))
        self.assertLess(lus["GG"][0], lus["GM"][0])
        self.assertEqual(lus["GD"][1:], ("#4A7FE0", "gauche_droite"))
        self.assertEqual(lus["GG"][2], "gauche_droite")

    def test_territoires_des_elus(self):
        """Département publié par la chambre (lien `territoire`) : carte d'un scrutin, présence par
        département (année en cours, comparée au groupe), Français de l'étranger hors carte."""
        from datetime import date
        from src.adaptateurs.stockage.postgres import EntrepotPostgres, ProjecteurPostgres
        from src.chargement import ContexteCanon, ecrire
        from src.domaine import EnregistrementSource, IdentiteNative, Systeme
        from src.domaine.objets import Dependants, Objet
        from src.identites import RegistreIdentites
        CX.execute("TRUNCATE brut.enregistrement_source, canon.entite CASCADE")
        e = EntrepotPostgres(CX)
        ctx = ContexteCanon(e, RegistreIdentites(e), {}, {})
        AN = lambda t, i: IdentiteNative(Systeme.AN, t, i)
        GIRONDE = IdentiteNative(Systeme.INSEE, "departement", "33")
        # P1 et P2 : Gironde ; P3 : Français de l'étranger (aucun lien de territoire)
        with ctx.registre.transaction():
            src, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "x", "y", "z"))
            ecrire(ctx, Objet("organisation", GIRONDE, {"type": "departement", "nom": "Gironde"}), src, None)
            ecrire(ctx, Objet("organisation", AN("organe", "GA"), {"type": "groupe_politique", "nom": "A", "chambre": "AN"}),
                   src, None)
            for pa, circo in (("P1", "2"), ("P2", "5"), ("P3", None)):
                ecrire(ctx, Objet("personne", AN("acteur", pa), {"nom": pa, "nom_affiche": pa}), src, None)
                ecrire(ctx, Objet("fonction", AN("mandat", f"M{pa}"), {"personne_id": AN("acteur", pa), "type": "depute",
                                                                         "titre": "Député", "debut": date(2024, 7, 1)}), src, None)
                ecrire(ctx, Objet("fonction", AN("mandat", f"G{pa}"), {"personne_id": AN("acteur", pa),
                                                                         "organisation_id": AN("organe", "GA"),
                                                                         "type": "membre_groupe", "titre": "Membre",
                                                                         "debut": date(2024, 7, 1)}), src, None)
                if circo:
                    ecrire(ctx, Dependants("lien", {"de_id": AN("mandat", f"M{pa}"), "nature": "territoire"},
                                           [{"vers_id": GIRONDE, "ordre": 0, "attributs": {"circonscription": circo}}]),
                           src, None)
            jour = date(date.today().year, 1, 15)
            ecrire(ctx, Objet("scrutin", AN("scrutin", "S1"), {"chambre": "AN", "numero": "1", "date": jour, "titre": "S1",
                                                              "legislature": "17"}), src, None)
            ecrire(ctx, Dependants("vote", {"scrutin_id": AN("scrutin", "S1")}, [
                {"personne_id": AN("acteur", p), "position": pos, "groupe_id": AN("organe", "GA"), "par_delegation": False,
                 "cause": None} for p, pos in (("P1", "pour"), ("P3", "contre"))]), src, None)
            ecrire(ctx, Dependants("position_groupe", {"scrutin_id": AN("scrutin", "S1")}, [
                {"groupe_id": AN("organe", "GA"), "position_majoritaire": "pour", "membres": 3, "pour": 1, "contre": 1,
                 "abstentions": 0, "non_votants": 0}]), src, None)
        ProjecteurPostgres(CX).projeter()
        self.assertEqual(CX.execute("SELECT chambre, code, circonscription FROM lecture.elu_departement "
                                    "ORDER BY circonscription").fetchall(), [("AN", "33", "2"), ("AN", "33", "5")])
        self.assertEqual(CX.execute("SELECT code, membres, pour, contre, absents FROM lecture.carte_scrutin").fetchall(),
                         [("33", 2, 1, 0, 1)])
        # Gironde : 1 participation sur 2 possibles ; attendu = participation du groupe (2 sur 3)
        code, elus, occasions, taux, attendu = CX.execute(
            "SELECT code, elus, occasions, taux, taux_attendu FROM lecture.presence_departement").fetchone()
        self.assertEqual((code, elus, occasions, float(taux), float(attendu)), ("33", 2, 2, 50.0, 66.7))
