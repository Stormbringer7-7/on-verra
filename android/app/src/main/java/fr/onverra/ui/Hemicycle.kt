package fr.onverra.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import fr.onverra.ModeCouleur
import fr.onverra.donnees.DeputeSiege
import fr.onverra.donnees.Geometrie
import fr.onverra.donnees.Position
import fr.onverra.donnees.Siege
import fr.onverra.donnees.Vote
import kotlin.math.hypot

private const val ZOOM_MAX = 8f
private const val ZOOM_NOMS = 4f            // à partir de ce zoom, le nom du député s'affiche sur son siège
private const val MARGE_BAS = 5.0           // marge sous le premier rang, en unités du plan
private const val RAYON_TAP = 2.2           // distance max (unités du plan) entre le doigt et le centre d'un siège
private const val TAILLE_NOM = 0.72f        // hauteur minimale du nom, en unités du plan
private const val TAILLE_NOM_ECRAN = 8f     // hauteur minimale du nom à l'écran (sp) : lisible sur téléphone
private const val TAILLE_MESURE = 24f       // taille de mesure des noms (sp), mis à l'échelle au dessin

/** Zoom et déplacement de l'hémicycle : contenu à l'écran = (plan × base) × zoom + decalage. */
@Stable
class EtatZoom {
    var zoom by mutableFloatStateOf(1f); private set
    var decalage by mutableStateOf(Offset.Zero); private set
    var taille by mutableStateOf(Size.Zero)
        internal set

    fun transformer(centre: Offset, facteur: Float, pan: Offset) {
        val nouveau = (zoom * facteur).coerceIn(1f, ZOOM_MAX)
        val f = nouveau / zoom
        // Le point sous les doigts reste sous les doigts, puis suit leur déplacement.
        decalage = borner((decalage - centre) * f + centre + pan, nouveau)
        zoom = nouveau
    }

    fun deplacer(pan: Offset) { decalage = borner(decalage + pan, zoom) }

    fun zoomer(facteur: Float, centre: Offset = Offset(taille.width / 2, taille.height / 2)) = transformer(centre, facteur, Offset.Zero)

    fun reinitialiser() { zoom = 1f; decalage = Offset.Zero }

    /** Zoome sur un point du plan (coordonnées en px de la vue d'ensemble). */
    fun centrerSur(point: Offset, nouveauZoom: Float) {
        zoom = nouveauZoom.coerceIn(1f, ZOOM_MAX)
        decalage = borner(Offset(taille.width / 2, taille.height / 2) - point * zoom, zoom)
    }

    private fun borner(d: Offset, z: Float) = Offset(
        d.x.coerceIn(taille.width - taille.width * z, 0f),
        d.y.coerceIn(taille.height - taille.height * z, 0f),
    )
}

/** Tracés du plan, convertis une seule fois en chemins Compose. */
class PlanCompose(val geometrie: Geometrie) {
    val hauteurVue = geometrie.sieges.maxOf { it.y } + MARGE_BAS
    val sieges: List<Pair<Siege, Path>> = geometrie.sieges.map { it to PathParser().parsePathString(it.d).toPath() }
    val decor: List<Path> = geometrie.decor.map { PathParser().parsePathString(it).toPath() }
    val parNum: Map<Int, Siege> = geometrie.sieges.associateBy { it.num }
}

@Composable
fun Hemicycle(
    plan: PlanCompose,
    vote: Vote,
    couleur: ModeCouleur,
    selection: String?,
    etat: EtatZoom,
    onSelection: (DeputeSiege?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = LocalCouleurs.current
    val g = plan.geometrie
    val parSiege = remember(vote) { vote.deputes.filter { it.siege != null }.associateBy { it.siege!! } }
    val couleursGroupes = remember(vote) { vote.groupes.associate { it.ref to couleurHex(it.couleur) } }
    val mesureur = rememberTextMeasurer(cacheSize = 0)
    // Les noms ne sont mesurés qu'au premier zoom suffisant, une fois par vote.
    val noms = remember(vote, c) {
        lazy {
            vote.deputes.associate { d ->
                d.acteur to mesureur.measure(d.nom, TextStyle(fontSize = TAILLE_MESURE.sp, color = c.texte),
                    overflow = TextOverflow.Clip, maxLines = 1)
            }
        }
    }
    val pente = LocalViewConfiguration.current.touchSlop

    fun versPlan(p: Offset): Offset {
        val base = etat.taille.width / g.largeur.toFloat()
        return (p - etat.decalage) / (etat.zoom * base)
    }

    Canvas(
        modifier
            .fillMaxWidth()
            .aspectRatio((g.largeur / plan.hauteurVue).toFloat())
            // Le plan (tribune comprise) et le contenu zoomé ne débordent jamais sur le reste de la page.
            .clipToBounds()
            .onSizeChanged { etat.taille = Size(it.width.toFloat(), it.height.toFloat()) }
            .semantics {
                contentDescription = "Hémicycle : chaque siège est un député, coloré selon son groupe ou son vote"
                stateDescription = "zoom ×%.1f".format(java.util.Locale.ROOT, etat.zoom)
            }
            // Deux doigts : zoom. Un doigt : déplacement seulement une fois zoomé, sinon la page défile.
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var deplace = false
                    var cumul = Offset.Zero
                    do {
                        val evt = awaitPointerEvent()
                        val doigts = evt.changes.count { it.pressed }
                        if (doigts >= 2) {
                            etat.transformer(evt.calculateCentroid(useCurrent = true), evt.calculateZoom(), evt.calculatePan())
                            evt.changes.forEach { it.consume() }
                            deplace = true
                        } else if (doigts == 1 && etat.zoom > 1.01f) {
                            val pan = evt.calculatePan()
                            cumul += pan
                            if (deplace || cumul.getDistance() > pente) {
                                etat.deplacer(if (deplace) pan else cumul)
                                evt.changes.forEach { it.consume() }
                                deplace = true
                            }
                        }
                    } while (evt.changes.any { it.pressed })
                }
            }
            .pointerInput(vote) {
                detectTapGestures(
                    onDoubleTap = { etat.zoomer(2f, it) },
                    onTap = { p ->
                        val u = versPlan(p)
                        val proche = parSiege.keys.mapNotNull { plan.parNum[it] }
                            .minByOrNull { hypot(it.x - u.x, it.y - u.y) }
                            ?.takeIf { hypot(it.x - u.x, it.y - u.y) <= RAYON_TAP }
                        onSelection(proche?.let { parSiege[it.num] })
                    },
                )
            },
    ) {
        val base = size.width / g.largeur.toFloat()
        val echelle = g.echelle.toFloat()
        val trait = Stroke(width = 1.2f)
        withTransform({
            translate(etat.decalage.x, etat.decalage.y)
            scale(etat.zoom * base, etat.zoom * base, Offset.Zero)
        }) {
            withTransform({ scale(echelle, echelle, Offset.Zero) }) {
                plan.decor.forEach { drawPath(it, c.decor) }
                for ((siege, chemin) in plan.sieges) {
                    val d = parSiege[siege.num]
                    if (d == null) {
                        drawPath(chemin, c.siegeVide)
                        continue
                    }
                    val creux = d.position == null || d.position == Position.NON_VOTANT
                    when {
                        couleur == ModeCouleur.GROUPES ->
                            drawPath(chemin, couleursGroupes[d.groupe] ?: Color.Gray, alpha = if (creux) 0.22f else 1f)
                        creux -> {
                            drawPath(chemin, c.surface1)
                            drawPath(chemin, c.texte3, style = Stroke(width = 1.4f,
                                pathEffect = if (d.position == Position.NON_VOTANT)
                                    androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(3f, 2f)) else null))
                        }
                        else -> drawPath(chemin, c.vote(d.position)!!)
                    }
                    if (!creux || couleur == ModeCouleur.GROUPES) drawPath(chemin, c.surface1, style = trait)
                    if (d.acteur == selection) drawPath(chemin, c.texte, style = Stroke(width = 4f))
                }
            }
            // Pastille du vote (mode Groupes), en unités du plan.
            if (couleur == ModeCouleur.GROUPES) {
                for ((num, d) in parSiege) {
                    val couleurVote = c.vote(d.position) ?: continue
                    val s = plan.parNum[num] ?: continue
                    val centre = Offset(s.x.toFloat(), s.y.toFloat() - 0.3f)
                    drawCircle(c.surface1, radius = 0.75f + 0.18f, center = centre)
                    drawCircle(couleurVote, radius = 0.75f, center = centre)
                }
            }
            if (etat.zoom >= ZOOM_NOMS) {
                val unites = maxOf(TAILLE_NOM, TAILLE_NOM_ECRAN.sp.toPx() / (etat.zoom * base))
                dessinerNoms(parSiege, plan, noms.value, c, unites)
            }
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.dessinerNoms(
    parSiege: Map<Int, DeputeSiege>, plan: PlanCompose, noms: Map<String, TextLayoutResult>, c: Couleurs,
    hauteur: Float,
) {
    for ((num, d) in parSiege) {
        val s = plan.parNum[num] ?: continue
        val texte = noms[d.acteur] ?: continue
        // Échelle tirée de la hauteur mesurée : indépendante de la densité de l'écran.
        val k = hauteur * 1.25f / texte.size.height
        // Le nom passe sous la pastille, centré sur le siège.
        translate(s.x.toFloat(), s.y.toFloat() + 0.95f) {
            withTransform({ scale(k, k, Offset.Zero) }) {
                val coin = Offset(-texte.size.width / 2f, -texte.size.height / 2f)
                drawText(texte, color = c.surface1, topLeft = coin + Offset(1.5f, 0f))
                drawText(texte, color = c.surface1, topLeft = coin - Offset(1.5f, 0f))
                drawText(texte, color = c.texte, topLeft = coin)
            }
        }
    }
}
