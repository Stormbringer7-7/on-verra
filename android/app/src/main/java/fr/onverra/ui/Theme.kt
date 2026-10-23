package fr.onverra.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import fr.onverra.donnees.Position

/**
 * Couleurs de l'application, alignées sur l'interface web (on_verra/web/style.css).
 * Votes : paire divergente bleu / rouge et gris neutre, validée pour le daltonisme dans les deux thèmes.
 */
@Immutable
data class Couleurs(
    val surface0: Color,
    val surface1: Color,
    val surface2: Color,
    val bordure: Color,
    val texte: Color,
    val texte2: Color,
    val texte3: Color,
    val accent: Color,
    val siegeVide: Color,
    val decor: Color,
    val pour: Color,
    val contre: Color,
    val abstention: Color,
    val majeure: Color,
    val standard: Color,
    val technique: Color,
) {
    fun vote(p: Position?): Color? = when (p) {
        Position.POUR -> pour
        Position.CONTRE -> contre
        Position.ABSTENTION -> abstention
        else -> null
    }

    fun niveau(n: String): Color = when (n) {
        "majeure" -> majeure
        "technique" -> technique
        else -> standard
    }
}

private val Clair = Couleurs(
    surface0 = Color(0xFFF4F3F0), surface1 = Color(0xFFFCFCFB), surface2 = Color(0xFFECEAE5),
    bordure = Color(0xFFDCDAD4), texte = Color(0xFF0B0B0B), texte2 = Color(0xFF52514E), texte3 = Color(0xFF75746F),
    accent = Color(0xFF2A78D6), siegeVide = Color(0xFFE4E2DC), decor = Color(0xFFECEAE5),
    pour = Color(0xFF2A78D6), contre = Color(0xFFE34948), abstention = Color(0xFF8A8984),
    majeure = Color(0xFFB23A3A), standard = Color(0xFF52514E), technique = Color(0xFF75746F),
)

private val Sombre = Couleurs(
    surface0 = Color(0xFF121211), surface1 = Color(0xFF1A1A19), surface2 = Color(0xFF262624),
    bordure = Color(0xFF34342F), texte = Color(0xFFF0EFEC), texte2 = Color(0xFFC3C2B7), texte3 = Color(0xFF9A998F),
    accent = Color(0xFF3987E5), siegeVide = Color(0xFF2C2C29), decor = Color(0xFF262624),
    pour = Color(0xFF3987E5), contre = Color(0xFFE66767), abstention = Color(0xFFACABA5),
    majeure = Color(0xFFE66767), standard = Color(0xFFC3C2B7), technique = Color(0xFF9A998F),
)

val LocalCouleurs = staticCompositionLocalOf { Clair }

@Composable
fun OnVerraTheme(content: @Composable () -> Unit) {
    val sombre = isSystemInDarkTheme()
    val c = if (sombre) Sombre else Clair
    val schema = if (sombre) {
        darkColorScheme(primary = c.accent, background = c.surface0, surface = c.surface1,
            secondaryContainer = c.surface2, onSecondaryContainer = c.texte,
            surfaceVariant = c.surface2, onSurface = c.texte, onSurfaceVariant = c.texte2, outline = c.bordure,
            outlineVariant = c.bordure, surfaceContainer = c.surface1, surfaceContainerHigh = c.surface2)
    } else {
        lightColorScheme(primary = c.accent, background = c.surface0, surface = c.surface1,
            secondaryContainer = c.surface2, onSecondaryContainer = c.texte,
            surfaceVariant = c.surface2, onSurface = c.texte, onSurfaceVariant = c.texte2, outline = c.bordure,
            outlineVariant = c.bordure, surfaceContainer = c.surface1, surfaceContainerHigh = c.surface2)
    }
    CompositionLocalProvider(LocalCouleurs provides c) {
        MaterialTheme(colorScheme = schema, content = content)
    }
}

/** "#RRGGBB" -> Color ; gris neutre si la couleur du groupe est inconnue. */
fun couleurHex(hex: String?): Color =
    hex?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }
        ?: Color(0xFF9A998F)
