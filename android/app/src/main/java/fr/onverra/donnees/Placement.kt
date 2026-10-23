package fr.onverra.donnees

import java.util.TreeSet
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Attribution d'un siège à chaque député en fonction le jour d'un vote.
 * Portage exact de on_verra/placement.py (mêmes règles, mêmes départages) :
 * - REEL        : au moins SEUIL_REEL des députés ont un siège connu ; les autres prennent le siège
 *                 libre le plus proche des membres de leur groupe.
 * - RECONSTITUE : chaque groupe reçoit un secteur contigu, dans l'ordre gauche-droite observé.
 */
object Placement {
    private const val SEUIL_REEL = 0.9
    private const val ANGLE_CENTRE = 90.0

    data class Depute(val acteur: String, val groupe: String?, val place: Int?, val nom: String)

    fun placer(deputes: List<Depute>, sieges: List<Siege>): Pair<Map<String, Int>, ModePlaces> {
        val parNum = sieges.associateBy { it.num }
        val connus = LinkedHashMap<String, Int>()
        val pris = HashSet<Int>()
        for (d in deputes) {
            val p = d.place
            if (p != null && p in parNum && p !in pris) {
                connus[d.acteur] = p
                pris += p
            }
        }
        return if (deputes.isNotEmpty() && connus.size.toDouble() / deputes.size >= SEUIL_REEL) {
            completer(deputes, connus, parNum) to ModePlaces.REEL
        } else {
            reconstituer(deputes, connus, sieges) to ModePlaces.RECONSTITUE
        }
    }

    private fun completer(deputes: List<Depute>, connus: Map<String, Int>, parNum: Map<Int, Siege>): Map<String, Int> {
        val places = LinkedHashMap(connus)
        val libres = TreeSet(parNum.keys - places.values.toSet())
        for (d in deputes) {
            if (d.acteur in places || libres.isEmpty()) continue
            val membres = deputes.filter { it.groupe == d.groupe && it.acteur in places }.map { parNum.getValue(places.getValue(it.acteur)) }
            // minBy garde le premier minimum : à distance égale, le plus petit numéro (comme Python).
            val choix = if (membres.isNotEmpty()) {
                val cx = membres.sumOf { it.x } / membres.size
                val cy = membres.sumOf { it.y } / membres.size
                libres.minBy { hypot(parNum.getValue(it).x - cx, parNum.getValue(it).y - cy) }
            } else {
                libres.minBy { abs(parNum.getValue(it).angle - ANGLE_CENTRE) }
            }
            places[d.acteur] = choix
            libres -= choix
        }
        return places
    }

    private fun reconstituer(deputes: List<Depute>, connus: Map<String, Int>, sieges: List<Siege>): Map<String, Int> {
        val angle = sieges.associate { it.num to it.angle }
        val groupes = LinkedHashMap<String?, MutableList<Depute>>()
        for (d in deputes) groupes.getOrPut(d.groupe) { mutableListOf() } += d

        fun position(groupe: String?): Double {
            val angles = groupes.getValue(groupe).mapNotNull { m -> connus[m.acteur]?.let { angle.getValue(it) } }
            return if (angles.isNotEmpty()) angles.sum() / angles.size else ANGLE_CENTRE
        }

        val ordreSieges = sieges.sortedBy { it.angle }
        val places = LinkedHashMap<String, Int>()
        var i = 0
        for (groupe in groupes.keys.sortedBy { position(it) }) {
            val membres = groupes.getValue(groupe).sortedBy { it.nom }
            val secteur = ordreSieges.subList(minOf(i, ordreSieges.size), minOf(i + membres.size, ordreSieges.size))
                .sortedWith(compareBy({ it.rayon }, { it.angle }))
            membres.zip(secteur).forEach { (m, s) -> places[m.acteur] = s.num }
            i += membres.size
        }
        return places
    }
}
