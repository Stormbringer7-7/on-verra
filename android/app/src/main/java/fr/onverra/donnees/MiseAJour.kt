package fr.onverra.donnees

import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

data class FichierPublie(val fichier: String, val taille: Long, val sha256: String)

data class Correctif(val de: Int, val vers: Int, val contenu: FichierPublie)

data class Nouveaute(val loi: String?, val titre: String?, val date: String, val evenement: String, val detail: String?)

/** manifest.json publié par `python3 -m on_verra publier` (voir on_verra/publication.py). */
data class Manifeste(
    val version: Int,
    val schema: String,
    val base: FichierPublie,
    val correctifs: List<Correctif>,
    val nouveautes: List<Nouveaute>,
) {
    companion object {
        fun lire(json: String): Manifeste {
            val o = JSONObject(json)
            fun fichier(f: JSONObject) = FichierPublie(f.getString("fichier"), f.getLong("taille"), f.getString("sha256"))
            val correctifs = o.getJSONArray("correctifs")
            val nouveautes = o.getJSONArray("nouveautes")
            return Manifeste(
                version = o.getInt("version"),
                schema = o.getString("schema"),
                base = fichier(o.getJSONObject("base")),
                correctifs = (0 until correctifs.length()).map {
                    val c = correctifs.getJSONObject(it)
                    Correctif(c.getInt("de"), c.getInt("vers"), fichier(c))
                },
                nouveautes = (0 until nouveautes.length()).map {
                    val n = nouveautes.getJSONObject(it)
                    Nouveaute(n.optString("loi").ifEmpty { null }, n.optString("titre").ifEmpty { null },
                        n.getString("date"), n.getString("evenement"), n.optString("detail").ifEmpty { null })
                },
            )
        }
    }
}

/** Ce qu'il faut télécharger pour passer de la version locale à celle du manifeste. */
sealed interface Plan {
    data object AJour : Plan
    data class Correctifs(val liste: List<Correctif>) : Plan
    data object Complete : Plan
}

object MiseAJourPlan {
    fun planifier(versionLocale: Int, schemaLocal: String?, m: Manifeste): Plan {
        if (m.version <= versionLocale) return Plan.AJour
        if (schemaLocal != m.schema) return Plan.Complete
        val chaine = mutableListOf<Correctif>()
        var v = versionLocale
        while (v < m.version) {
            // Un maillon manquant (correctif retiré, version trop ancienne) : base complète.
            val c = m.correctifs.firstOrNull { it.de == v } ?: return Plan.Complete
            chaine += c
            v = c.vers
        }
        return Plan.Correctifs(chaine)
    }

    /** Instructions d'un correctif : une par ligne ; la transaction est gérée par l'application. */
    fun instructions(script: String): List<String> =
        script.lineSequence().map { it.trim() }
            .filter { it.isNotEmpty() && it != "BEGIN;" && it != "COMMIT;" }
            .toList()

    fun sha256(octets: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(octets).joinToString("") { "%02x".format(it) }
}

sealed interface ResultatMaj {
    data object NonConfiguree : ResultatMaj
    data class AJour(val version: Int) : ResultatMaj
    data class MiseAJour(val de: Int, val vers: Int, val nouveautes: List<Nouveaute>) : ResultatMaj
    data class Erreur(val message: String) : ResultatMaj
}

/** Met la base à jour depuis le dossier de publication hébergé (HTTPS uniquement). */
class MiseAJour(private val base: Base, urlPublication: String) {
    private val racine = urlPublication.trimEnd('/')

    fun verifier(): ResultatMaj {
        if (racine.isEmpty()) return ResultatMaj.NonConfiguree
        if (!racine.startsWith("https://")) return ResultatMaj.Erreur("L'adresse de publication doit être en HTTPS")
        return try {
            val avant = base.version()
            val manifeste = Manifeste.lire(String(telecharger("manifest.json", TAILLE_MAX_MANIFESTE), Charsets.UTF_8))
            when (val plan = MiseAJourPlan.planifier(avant.version, avant.schema, manifeste)) {
                Plan.AJour -> ResultatMaj.AJour(avant.version)
                is Plan.Correctifs -> {
                    plan.liste.forEach { appliquer(verifie(it.contenu)) }
                    ResultatMaj.MiseAJour(avant.version, base.version().version, manifeste.nouveautes)
                }
                Plan.Complete -> {
                    base.remplacer(ByteArrayInputStream(verifie(manifeste.base)))
                    ResultatMaj.MiseAJour(avant.version, base.version().version, manifeste.nouveautes)
                }
            }
        } catch (e: Exception) {
            ResultatMaj.Erreur(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun verifie(f: FichierPublie): ByteArray {
        val octets = telecharger(f.fichier, f.taille)
        check(octets.size.toLong() == f.taille && MiseAJourPlan.sha256(octets) == f.sha256) {
            "Fichier ${f.fichier} corrompu (empreinte SHA-256 différente)"
        }
        return octets
    }

    /** Chaque correctif dans sa transaction : s'il échoue (mauvaise version de départ), rien ne change. */
    private fun appliquer(gzip: ByteArray) {
        val script = GZIPInputStream(ByteArrayInputStream(gzip)).bufferedReader().use { it.readText() }
        val db = base.db()
        db.beginTransaction()
        try {
            MiseAJourPlan.instructions(script).forEach(db::execSQL)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun telecharger(nom: String, tailleMax: Long): ByteArray {
        val connexion = URL("$racine/$nom").openConnection() as HttpURLConnection
        connexion.connectTimeout = 15_000
        connexion.readTimeout = 60_000
        try {
            check(connexion.responseCode == 200) { "$nom : HTTP ${connexion.responseCode}" }
            // Lecture bornée : un serveur ne peut pas faire télécharger plus que la taille annoncée.
            return connexion.inputStream.use { entree ->
                val sortie = java.io.ByteArrayOutputStream()
                val tampon = ByteArray(64 * 1024)
                while (true) {
                    val n = entree.read(tampon)
                    if (n < 0) break
                    sortie.write(tampon, 0, n)
                    check(sortie.size() <= tailleMax) { "$nom : taille inattendue" }
                }
                sortie.toByteArray()
            }
        } finally {
            connexion.disconnect()
        }
    }

    private companion object {
        const val TAILLE_MAX_MANIFESTE = 1_000_000L
    }
}
