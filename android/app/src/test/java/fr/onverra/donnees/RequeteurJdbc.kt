package fr.onverra.donnees

import java.sql.Connection
import java.sql.DriverManager

/** Requêteur JDBC : fait tourner Depot et Placement sur la vraie base, sur la JVM. */
class RequeteurJdbc(chemin: String) : Requeteur, AutoCloseable {
    val connexion: Connection = DriverManager.getConnection("jdbc:sqlite:$chemin")

    override fun lignes(sql: String, vararg args: Any?): List<Ligne> =
        connexion.prepareStatement(sql).use { st ->
            args.forEachIndexed { i, a -> st.setObject(i + 1, a) }
            st.executeQuery().use { rs ->
                val colonnes = (1..rs.metaData.columnCount).map { rs.metaData.getColumnLabel(it) }
                buildList {
                    while (rs.next()) add(colonnes.associateWith { rs.getObject(it) })
                }
            }
        }

    override fun close() = connexion.close()
}
