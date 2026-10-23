package fr.onverra.donnees

/** Requêtes de l'application : portage de l'API de on_verra/serveur.py, sur la base embarquée. */
class Depot(private val db: Requeteur, private val geometrie: Geometrie) {

    enum class Tri(val sql: String) {
        SAILLANCE("l.saillance DESC, l.titre"),
        DATE("derniere_date DESC, l.titre"),
        TITRE("l.titre"),
    }

    fun lois(recherche: String = "", legislature: String? = null, niveau: String? = null,
             tri: Tri = Tri.SAILLANCE): List<LoiResume> {
        val filtres = mutableListOf<String>()
        val args = mutableListOf<Any?>()
        if (recherche.isNotBlank()) { filtres += "l.titre LIKE ?"; args += "%${recherche.trim()}%" }
        if (legislature != null) { filtres += "l.legislature = ?"; args += legislature }
        if (niveau != null) { filtres += "l.niveau = ?"; args += niveau }
        val where = if (filtres.isEmpty()) "" else "WHERE " + filtres.joinToString(" AND ")
        return db.lignes("$REQ_LOIS $where ORDER BY ${tri.sql} LIMIT $LIMITE_LOIS", *args.toTypedArray()).map {
            LoiResume(it.texte("id")!!, it.texte("titre")!!, it.texte("niveau")!!, it.reel("saillance") ?: 0.0,
                it.texte("legislature"), it.texte("derniere_date"), it.entier("nb_49_3") ?: 0)
        }
    }

    fun loi(id: String): DetailLoi? {
        val l = db.lignes("SELECT * FROM lois WHERE id = ?", id).firstOrNull() ?: return null
        val loi = Loi(l.texte("id")!!, l.texte("titre")!!, l.texte("niveau")!!, l.reel("saillance") ?: 0.0,
            l.texte("raisons"), l.texte("legislature"), l.texte("promulgation"), l.entier("nb_scrutins"))
        val scrutins = db.lignes("SELECT uid, numero, date, lecture, sort, pour, contre FROM scrutins " +
            "WHERE loi_id = ? ORDER BY date, numero", id).map {
            ScrutinResume(it.texte("uid")!!, it.entier("numero")!!, it.texte("date")!!, it.texte("lecture"),
                it.texte("sort")!!, it.entier("pour")!!, it.entier("contre")!!)
        }
        val engagements = db.lignes("SELECT * FROM engagements_49_3 WHERE loi_id = ? ORDER BY date", id).map {
            Engagement(it.entier("id")!!, it.texte("etape")!!, it.texte("date")!!, it.texte("issue"))
        }
        val motions = db.lignes("SELECT scrutin_uid, numero, date, pour, requis, adoptee FROM motions_censure " +
            "WHERE loi_id = ? ORDER BY date, numero", id).map {
            MotionResume(it.texte("scrutin_uid")!!, it.entier("numero")!!, it.texte("date")!!, it.entier("pour")!!,
                it.entier("requis")!!, it.entier("adoptee") == 1)
        }
        return DetailLoi(loi, scrutins, engagements, motions)
    }

    fun scrutin(uid: String): Vote? {
        val s = db.lignes("SELECT * FROM scrutins WHERE uid = ?", uid).firstOrNull() ?: return null
        val votes = db.lignes("SELECT * FROM votes WHERE scrutin_uid = ?", uid).associate {
            it.texte("acteur_ref")!! to VoteBrut(Position.de(it.texte("position")), it.texte("groupe_ref"),
                it.entier("par_delegation") == 1, it.texte("cause"), it.entier("num_place"))
        }
        val lignes = db.lignes("SELECT groupe_ref, ligne FROM positions_groupes WHERE scrutin_uid = ?", uid)
            .associate { it.texte("groupe_ref") to Position.de(it.texte("ligne")) }
        val (mode, groupes, deputes) = hemicycleDuJour(s.texte("legislature")!!, s.texte("date")!!, votes, lignes)
        return Vote(TypeVote.SCRUTIN, uid, s.entier("numero")!!, s.texte("date")!!, s.texte("titre")!!,
            s.texte("sort")!!, s.texte("type_vote"), null, null, mode, groupes, deputes)
    }

    fun motion(uid: String): Vote? {
        val m = db.lignes("SELECT * FROM motions_censure WHERE scrutin_uid = ?", uid).firstOrNull() ?: return null
        // Motion de censure : seuls les votes "pour" sont publiés.
        val votes = db.lignes("SELECT * FROM votes_censure WHERE scrutin_uid = ?", uid).associate {
            it.texte("acteur_ref")!! to VoteBrut(Position.POUR, it.texte("groupe_ref"),
                it.entier("par_delegation") == 1, null, it.entier("num_place"))
        }
        val (mode, groupes, deputes) = hemicycleDuJour(m.texte("legislature")!!, m.texte("date")!!, votes, emptyMap())
        val adoptee = m.entier("adoptee") == 1
        return Vote(TypeVote.MOTION, uid, m.entier("numero")!!, m.texte("date")!!, m.texte("titre")!!,
            if (adoptee) "adoptée" else "rejetée", null, m.texte("article"), m.entier("requis"), mode, groupes, deputes)
    }

    /** Version et date de la base embarquée (table meta ajoutée à la publication). */
    fun meta(): Map<String, String> = runCatching {
        db.lignes("SELECT cle, valeur FROM meta").associate { it.texte("cle")!! to it.texte("valeur")!! }
    }.getOrDefault(emptyMap())

    private data class VoteBrut(val position: Position?, val groupe: String?, val delegation: Boolean,
                                val cause: String?, val numPlace: Int?)

    /** Sièges, groupes et positions de tous les députés en fonction ce jour-là. */
    private fun hemicycleDuJour(legislature: String, date: String, votes: Map<String, VoteBrut>,
                                lignes: Map<String?, Position?>): Triple<ModePlaces, List<Groupe>, List<DeputeSiege>> {
        val enFonction = db.lignes(REQ_EN_FONCTION, date, legislature).map {
            val acteur = it.texte("acteur")!!
            val v = votes[acteur]
            EnFonction(acteur, it.texte("prenom")!!, it.texte("nom")!!,
                v?.groupe ?: it.texte("groupe"), v?.numPlace ?: it.entier("place"))
        }
        val (places, mode) = Placement.placer(enFonction.map { Placement.Depute(it.acteur, it.groupe, it.place, it.nom) },
            geometrie.sieges)

        val refs = enFonction.mapNotNull { it.groupe }.toSet()
        val infos = if (refs.isEmpty()) emptyMap() else db.lignes(
            "SELECT organe_ref, abrege, libelle, couleur FROM groupes WHERE organe_ref IN (${refs.joinToString(",") { "?" }})",
            *refs.toTypedArray()).associateBy { it.texte("organe_ref") }

        val deputes = enFonction.map {
            val v = votes[it.acteur]
            DeputeSiege(it.acteur, it.prenom, it.nom, it.groupe, places[it.acteur], v?.position,
                v?.delegation ?: false, v?.cause)
        }
        val groupes = refs.map { ref ->
            val membres = deputes.filter { it.groupe == ref }
            val g = infos[ref]
            Groupe(ref, g?.texte("abrege") ?: "?", g?.texte("libelle") ?: "Groupe inconnu", g?.texte("couleur"),
                membres = membres.size,
                pour = membres.count { it.position == Position.POUR },
                contre = membres.count { it.position == Position.CONTRE },
                abstention = membres.count { it.position == Position.ABSTENTION },
                nonVotant = membres.count { it.position == Position.NON_VOTANT },
                sansVote = membres.count { it.position == null },
                ligne = lignes[ref])
        }
        return Triple(mode, groupes, deputes)
    }

    private data class EnFonction(val acteur: String, val prenom: String, val nom: String, val groupe: String?, val place: Int?)

    private companion object {
        const val LIMITE_LOIS = 1000

        const val REQ_LOIS = """
            SELECT l.id, l.titre, l.niveau, l.saillance, l.legislature,
                   COALESCE((SELECT MAX(date) FROM scrutins WHERE loi_id = l.id),
                            (SELECT MAX(date) FROM engagements_49_3 WHERE loi_id = l.id)) AS derniere_date,
                   (SELECT COUNT(*) FROM engagements_49_3 WHERE loi_id = l.id) AS nb_49_3
            FROM lois l"""

        // Même requête que serveur.py ; paramètres positionnels car Android ne nomme pas les paramètres.
        const val REQ_EN_FONCTION = """
            SELECT m.acteur_ref AS acteur, d.prenom, d.nom,
                   COALESCE((SELECT v.num_place FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid
                              WHERE v.acteur_ref = m.acteur_ref AND s.legislature = ?2
                                AND v.num_place IS NOT NULL
                              ORDER BY ABS(julianday(s.date) - julianday(?1)) LIMIT 1), m.place) AS place,
                   (SELECT a.groupe_ref FROM appartenances a
                     WHERE a.acteur_ref = m.acteur_ref AND a.date_debut <= ?1
                       AND (a.date_fin IS NULL OR a.date_fin >= ?1)
                     ORDER BY a.date_debut DESC LIMIT 1) AS groupe
            FROM mandats m JOIN deputes d USING (acteur_ref)
            WHERE m.legislature = ?2 AND m.date_debut <= ?1
              AND (m.date_fin IS NULL OR m.date_fin >= ?1)
            ORDER BY m.acteur_ref"""
    }
}
