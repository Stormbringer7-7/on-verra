package fr.onverra.donnees

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase

typealias Ligne = Map<String, Any?>

/** Accès en lecture à la base : une implémentation Android, une JDBC pour les tests sur la JVM. */
interface Requeteur {
    fun lignes(sql: String, vararg args: Any?): List<Ligne>
}

fun Ligne.texte(cle: String): String? = this[cle] as String?
fun Ligne.entier(cle: String): Int? = (this[cle] as Number?)?.toInt()
fun Ligne.reel(cle: String): Double? = (this[cle] as Number?)?.toDouble()

class RequeteurAndroid(private val db: () -> SQLiteDatabase) : Requeteur {
    override fun lignes(sql: String, vararg args: Any?): List<Ligne> =
        db().rawQuery(sql, args.map { it?.toString() }.toTypedArray()).use { c ->
            buildList {
                while (c.moveToNext()) {
                    add((0 until c.columnCount).associate { i -> c.getColumnName(i) to valeur(c, i) })
                }
            }
        }

    private fun valeur(c: Cursor, i: Int): Any? = when (c.getType(i)) {
        Cursor.FIELD_TYPE_INTEGER -> c.getLong(i)
        Cursor.FIELD_TYPE_FLOAT -> c.getDouble(i)
        Cursor.FIELD_TYPE_STRING -> c.getString(i)
        else -> null
    }
}
