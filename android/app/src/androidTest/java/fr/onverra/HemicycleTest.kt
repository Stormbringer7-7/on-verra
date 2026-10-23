package fr.onverra

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipeUp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import fr.onverra.donnees.Geometrie
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Gestes sur l'hémicycle, sur un vrai appareil ou un émulateur, avec la base embarquée. */
@OptIn(ExperimentalTestApi::class)
@RunWith(AndroidJUnit4::class)
class HemicycleTest {
    @get:Rule val regle = createAndroidComposeRule<MainActivity>()

    private fun SemanticsNodeInteraction.zoom(): Float =
        fetchSemanticsNode().config[SemanticsProperties.StateDescription].removePrefix("zoom ×").toFloat()

    private fun ouvrirHemicycle(): SemanticsNodeInteraction {
        regle.waitUntil(30_000) { regle.onAllNodes(hasText("Fin de vie")).fetchSemanticsNodes().isNotEmpty() }
        regle.onNodeWithText("Fin de vie").performClick()
        regle.waitUntil(30_000) {
            regle.onAllNodes(hasTestTag("page-loi")).fetchSemanticsNodes().isNotEmpty() &&
                regle.onAllNodes(hasText("Scrutin n°", substring = true)).fetchSemanticsNodes().isNotEmpty()
        }
        regle.onNodeWithTag("page-loi").performScrollToNode(hasTestTag("hemicycle"))
        return regle.onNodeWithTag("hemicycle")
    }

    @Test
    fun pincement_double_tap_et_reinitialisation() {
        val h = ouvrirHemicycle()
        assertEquals(1f, h.zoom(), 0.01f)

        h.performTouchInput {
            pinch(center - Offset(40f, 0f), center - Offset(300f, 0f),
                center + Offset(40f, 0f), center + Offset(300f, 0f), durationMillis = 500)
        }
        regle.waitForIdle()
        // Écart des doigts de 80 à 600 px : zoom ×7,5.
        val z1 = h.zoom()
        assertEquals("le pincement doit zoomer de l'écart des doigts", 7.5f, z1, 0.3f)

        h.performTouchInput {
            pinch(center - Offset(300f, 0f), center - Offset(100f, 0f),
                center + Offset(300f, 0f), center + Offset(100f, 0f), durationMillis = 500)
        }
        regle.waitForIdle()
        // Écart de 600 à 200 px : zoom divisé par 3.
        assertEquals("le pincement inverse doit dézoomer d'autant", z1 / 3f, h.zoom(), 0.2f)

        regle.onNodeWithTag("page-loi").performScrollToNode(hasText("Vue d'ensemble"))
        regle.onNodeWithText("Vue d'ensemble").performClick()
        regle.waitForIdle()
        assertEquals(1f, h.zoom(), 0.01f)

        regle.onNodeWithTag("page-loi").performScrollToNode(hasTestTag("hemicycle"))

        h.performTouchInput { doubleClick(center) }
        regle.waitForIdle()
        assertEquals(2f, h.zoom(), 0.01f)
    }

    @Test
    fun tap_sur_un_siege_affiche_la_fiche_du_depute() {
        val h = ouvrirHemicycle()
        // Siège n°1 : premier rang, à droite, toujours occupé.
        val g = InstrumentationRegistry.getInstrumentation().targetContext.assets.open("hemicycle.json")
            .bufferedReader().use { Geometrie.lire(it.readText()) }
        val s = g.sieges.first { it.num == 1 }
        h.performTouchInput {
            val k = width / g.largeur.toFloat()
            click(Offset(s.x.toFloat() * k, s.y.toFloat() * k))
        }
        regle.waitUntil(5_000) { regle.onAllNodes(hasText("Siège n°1")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun sans_zoom_un_doigt_fait_defiler_la_page() {
        val h = ouvrirHemicycle()
        val avant = h.fetchSemanticsNode().boundsInRoot.top
        h.performTouchInput { swipeUp(durationMillis = 300) }
        regle.waitForIdle()
        val apres = h.fetchSemanticsNode().boundsInRoot.top
        assertTrue("la page doit défiler ($avant -> $apres)", apres < avant - 50)
        assertEquals(1f, h.zoom(), 0.01f)
    }
}
