package fr.onverra.donnees

import org.json.JSONObject

/** Un siège du plan de l'hémicycle ; x, y en unités du plan, angle 0 = gauche, 180 = droite. */
data class Siege(val num: Int, val d: String, val x: Double, val y: Double, val angle: Double, val rayon: Double)

/** Plan de l'hémicycle publié par l'Assemblée (voir on_verra/hemicycle.py). */
class Geometrie(
    val largeur: Double,
    val hauteur: Double,
    val echelle: Double,          // les tracés "d" sont à multiplier par cette échelle
    val decor: List<String>,
    val sieges: List<Siege>,
) {
    companion object {
        fun lire(json: String): Geometrie {
            val o = JSONObject(json)
            val vb = o.getJSONArray("viewBox")
            val decor = o.getJSONArray("decor")
            val sieges = o.getJSONArray("sieges")
            return Geometrie(
                largeur = vb.getDouble(2),
                hauteur = vb.getDouble(3),
                echelle = o.getDouble("echelle"),
                decor = (0 until decor.length()).map { decor.getString(it) },
                sieges = (0 until sieges.length()).map {
                    val s = sieges.getJSONObject(it)
                    Siege(s.getInt("num"), s.getString("d"), s.getDouble("x"), s.getDouble("y"),
                        s.getDouble("angle"), s.getDouble("rayon"))
                },
            )
        }
    }
}
