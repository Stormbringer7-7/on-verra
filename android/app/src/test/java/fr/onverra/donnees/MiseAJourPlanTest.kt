package fr.onverra.donnees

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.sql.DriverManager

class MiseAJourPlanTest {
    private fun fichier(nom: String) = FichierPublie(nom, 10, "00")
    private fun manifeste(version: Int, schema: String = "s1", vararg correctifs: Pair<Int, Int>) = Manifeste(
        version, schema, fichier("on_verra-$version.db.gz"),
        correctifs.map { (de, vers) -> Correctif(de, vers, fichier("maj-$de-$vers.sql.gz")) }, emptyList())

    @Test
    fun `a jour quand la version locale est la plus recente`() {
        assertEquals(Plan.AJour, MiseAJourPlan.planifier(5, "s1", manifeste(5, "s1", 4 to 5)))
        assertEquals(Plan.AJour, MiseAJourPlan.planifier(6, "s1", manifeste(5)))
    }

    @Test
    fun `chaine de correctifs depuis la version locale`() {
        val plan = MiseAJourPlan.planifier(3, "s1", manifeste(6, "s1", 2 to 3, 3 to 4, 4 to 5, 5 to 6))
        assertEquals(listOf(3, 4, 5), (plan as Plan.Correctifs).liste.map { it.de })
    }

    @Test
    fun `base complete si un maillon manque ou si le schema change`() {
        assertEquals(Plan.Complete, MiseAJourPlan.planifier(3, "s1", manifeste(6, "s1", 4 to 5, 5 to 6)))
        assertEquals(Plan.Complete, MiseAJourPlan.planifier(5, "ancien", manifeste(6, "s1", 5 to 6)))
    }

    @Test
    fun `le correctif s'execute ligne par ligne et refuse une mauvaise version`() {
        // Même forme que les correctifs de publication.py, avec une valeur sur plusieurs lignes.
        val script = """
            BEGIN;
            CREATE TEMP TABLE verification_version (ok INTEGER CHECK (ok = 1));
            INSERT INTO verification_version SELECT COALESCE((SELECT valeur FROM meta WHERE cle = 'version') = '1', 0);
            INSERT OR REPLACE INTO lois (id, titre) VALUES ('a', 'ligne 1' || char(10) || 'ligne 2');
            UPDATE meta SET valeur = '2' WHERE cle = 'version';
            DROP TABLE verification_version;
            COMMIT;
        """.trimIndent()
        val instructions = MiseAJourPlan.instructions(script)
        assertEquals(5, instructions.size)
        DriverManager.getConnection("jdbc:sqlite::memory:").use { c ->
            c.createStatement().use {
                it.execute("CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT)")
                it.execute("CREATE TABLE lois (id TEXT PRIMARY KEY, titre TEXT)")
                it.execute("INSERT INTO meta VALUES ('version', '1')")
            }
            fun appliquer() {
                c.autoCommit = false
                try {
                    c.createStatement().use { st -> instructions.forEach(st::execute) }
                    c.commit()
                } catch (e: Exception) {
                    c.rollback()
                    throw e
                } finally {
                    c.autoCommit = true
                }
            }
            appliquer()
            c.createStatement().use {
                it.executeQuery("SELECT titre FROM lois").use { rs -> rs.next(); assertEquals("ligne 1\nligne 2", rs.getString(1)) }
            }
            // Réappliqué sur la version 2, le correctif échoue et ne change rien.
            assertTrue(runCatching { appliquer() }.isFailure)
            c.createStatement().use {
                it.executeQuery("SELECT valeur FROM meta").use { rs -> rs.next(); assertEquals("2", rs.getString(1)) }
            }
        }
    }

    @Test
    fun `lecture du manifeste publie`() {
        val m = Manifeste.lire("""{"format":1,"version":2,"date":"2026-10-23T00:00:00Z","schema":"abc",
            "base":{"fichier":"on_verra-2.db.gz","taille":4,"sha256":"ff"},
            "correctifs":[{"de":1,"vers":2,"fichier":"maj-1-2.sql.gz","taille":3,"sha256":"ee","lignes":5}],
            "nouveautes":[{"loi":"DLR","titre":"T","niveau":"majeure","date":"2026-10-12","evenement":"vote","detail":"adopté"}]}""")
        assertEquals(2, m.version)
        assertEquals("maj-1-2.sql.gz", m.correctifs.single().contenu.fichier)
        assertEquals("vote", m.nouveautes.single().evenement)
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            MiseAJourPlan.sha256("abc".toByteArray()))
    }
}
