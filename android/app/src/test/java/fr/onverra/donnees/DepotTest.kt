package fr.onverra.donnees

import org.json.JSONObject
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * Le portage Kotlin doit donner exactement les résultats du serveur Python : mêmes sièges, mêmes
 * positions, mêmes décomptes par groupe (attendu.json, produit par on_verra/serveur.py).
 */
class DepotTest {
    companion object {
        private var requeteur: RequeteurJdbc? = null
        private lateinit var depot: Depot
        private lateinit var attendu: JSONObject

        @BeforeClass @JvmStatic
        fun ouvrir() {
            val base = File(System.getProperty("onverra.base") ?: "")
            assumeTrue("Base absente : lancez `python3 -m on_verra importer`", base.exists())
            requeteur = RequeteurJdbc(base.path)
            depot = Depot(requeteur!!, Geometrie.lire(File(System.getProperty("onverra.hemicycle")!!).readText()))
            attendu = JSONObject(DepotTest::class.java.getResource("/attendu.json")!!.readText())
        }

        @AfterClass @JvmStatic
        fun fermer() { requeteur?.close() }
    }

    @Test
    fun `chaque vote place les deputes comme le serveur Python`() {
        for (uid in attendu.keys()) {
            val a = attendu.getJSONObject(uid)
            val vote = if (a.getString("type") == "motion") depot.motion(uid) else depot.scrutin(uid)
            checkNotNull(vote) { "$uid introuvable" }
            assertEquals("$uid : mode", a.getString("mode"), vote.mode.name.lowercase())
            val sieges = a.getJSONObject("sieges")
            val positions = a.getJSONObject("positions")
            assertEquals("$uid : nombre de députés", sieges.length(), vote.deputes.size)
            for (d in vote.deputes) {
                assertEquals("$uid ${d.acteur} : siège", sieges.optInt(d.acteur, -1), d.siege ?: -1)
                assertEquals("$uid ${d.acteur} : position",
                    positions.opt(d.acteur).takeUnless { it == JSONObject.NULL }, d.position?.cle)
            }
            val groupes = a.getJSONObject("groupes")
            assertEquals("$uid : groupes", groupes.length(), vote.groupes.size)
            for (g in vote.groupes) {
                val ga = groupes.getJSONArray(g.ref)
                val obtenu = listOf(g.membres, g.pour, g.contre, g.abstention, g.nonVotant, g.sansVote)
                assertEquals("$uid ${g.abrege}", (0..5).map { ga.getInt(it) }, obtenu)
                assertEquals("$uid ${g.abrege} : ligne", ga.opt(6).takeUnless { it == JSONObject.NULL }, g.ligne?.cle)
            }
        }
    }

    @Test
    fun `lois filtrees et triees`() {
        val majeures = depot.lois(legislature = "17", niveau = "majeure")
        assertTrue(majeures.isNotEmpty())
        assertTrue(majeures.all { it.niveau == "majeure" && it.legislature == "17" })
        assertEquals(majeures.map { it.saillance }.sortedDescending(), majeures.map { it.saillance })
        assertTrue(depot.lois(recherche = "narcotrafic").any { it.titre.contains("narcotrafic") })
    }

    @Test
    fun `detail d'une loi passee par 49-3`() {
        val budget = depot.lois(recherche = "finances pour 2025", legislature = "17").first { it.nb493 > 0 }
        val detail = depot.loi(budget.id)!!
        assertTrue(detail.engagements.isNotEmpty())
        assertTrue(detail.motions.isNotEmpty())
    }
}
