package fr.onverra.donnees

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.util.zip.GZIPInputStream

/**
 * La base SQLite embarquée : installée depuis les assets au premier lancement (ou quand une nouvelle
 * version de l'application apporte une base plus récente ou un autre schéma), puis tenue à jour en ligne.
 */
class Base(private val contexte: Context) {
    private val fichier: File = contexte.getDatabasePath(NOM)
    @Volatile private var db: SQLiteDatabase? = null

    data class Version(val version: Int, val schema: String?, val date: String?)

    fun db(): SQLiteDatabase = db ?: synchronized(this) { db ?: ouvrir().also { db = it } }

    fun version(): Version = lireMeta(db())

    private fun ouvrir(): SQLiteDatabase {
        val embarquee = contexte.assets.open("manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        val installee = if (fichier.exists()) runCatching { ouvrirLecture(fichier).use(::lireMeta) }.getOrNull() else null
        // Le code attend le schéma de la base embarquée : un autre schéma impose de la réinstaller.
        if (installee == null || installee.schema != embarquee.getString("schema")
            || installee.version < embarquee.getInt("version")) {
            // L'empaquetage Android décompresse les assets .gz : la base est embarquée en clair.
            contexte.assets.open("on_verra.db").use { remplacerFichier(it, gzip = false) }
        }
        return SQLiteDatabase.openDatabase(fichier.path, null, SQLiteDatabase.OPEN_READWRITE)
    }

    /** Remplace la base par une base complète (flux gzip), après l'avoir vérifiée. */
    fun remplacer(gzip: InputStream): Version = synchronized(this) {
        db?.close()
        db = null
        remplacerFichier(gzip, gzip = true)
        version()
    }

    private fun remplacerFichier(flux: InputStream, gzip: Boolean) {
        fichier.parentFile?.mkdirs()
        val temporaire = File(fichier.path + ".nouvelle")
        (if (gzip) GZIPInputStream(flux) else flux).use { entree -> temporaire.outputStream().use { entree.copyTo(it) } }
        // Une base illisible ou sans version n'écrase jamais la base en place.
        ouvrirLecture(temporaire).use { check(lireMeta(it).version > 0) { "Base téléchargée invalide" } }
        listOf("-journal", "-wal", "-shm").forEach { File(fichier.path + it).delete() }
        check(temporaire.renameTo(fichier)) { "Remplacement de la base impossible" }
    }

    private fun ouvrirLecture(f: File) = SQLiteDatabase.openDatabase(f.path, null, SQLiteDatabase.OPEN_READONLY)

    private fun lireMeta(db: SQLiteDatabase): Version {
        val meta = db.rawQuery("SELECT cle, valeur FROM meta", null).use { c ->
            buildMap { while (c.moveToNext()) put(c.getString(0), c.getString(1)) }
        }
        return Version(meta["version"]?.toIntOrNull() ?: 0, meta["schema"], meta["date"])
    }

    private companion object {
        const val NOM = "on_verra.db"
    }
}
