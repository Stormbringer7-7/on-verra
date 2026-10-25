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
