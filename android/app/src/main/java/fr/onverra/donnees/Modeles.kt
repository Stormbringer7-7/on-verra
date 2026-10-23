package fr.onverra.donnees

data class LoiResume(
    val id: String,
    val titre: String,
    val niveau: String,
    val saillance: Double,
    val legislature: String?,
    val derniereDate: String?,
    val nb493: Int,
)

data class Loi(
    val id: String,
    val titre: String,
    val niveau: String,
    val saillance: Double,
    val raisons: String?,
    val legislature: String?,
    val promulgation: String?,
    val nbScrutins: Int?,
)

data class ScrutinResume(
    val uid: String,
    val numero: Int,
    val date: String,
    val lecture: String?,
    val sort: String,
    val pour: Int,
    val contre: Int,
)

data class Engagement(val id: Int, val etape: String, val date: String, val issue: String?)

data class MotionResume(
    val uid: String,
    val numero: Int,
    val date: String,
    val pour: Int,
    val requis: Int,
    val adoptee: Boolean,
)

data class DetailLoi(
    val loi: Loi,
    val scrutins: List<ScrutinResume>,
    val engagements: List<Engagement>,
    val motions: List<MotionResume>,
)

enum class TypeVote { SCRUTIN, MOTION }

enum class ModePlaces { REEL, RECONSTITUE }

/** Position d'un député sur un vote ; null = aucun vote enregistré. */
enum class Position(val cle: String) {
    POUR("pour"), CONTRE("contre"), ABSTENTION("abstention"), NON_VOTANT("non_votant");

    companion object {
        fun de(cle: String?): Position? = entries.firstOrNull { it.cle == cle }
    }
}

data class Groupe(
    val ref: String,
    val abrege: String,
    val libelle: String,
    val couleur: String?,
    val membres: Int,
    val pour: Int,
    val contre: Int,
    val abstention: Int,
    val nonVotant: Int,
    val sansVote: Int,
    val ligne: Position?,
)

data class DeputeSiege(
    val acteur: String,
    val prenom: String,
    val nom: String,
    val groupe: String?,
    val siege: Int?,
    val position: Position?,
    val delegation: Boolean,
    val cause: String?,
)

/** Un vote affiché dans l'hémicycle : scrutin final ou motion de censure. */
data class Vote(
    val type: TypeVote,
    val uid: String,
    val numero: Int,
    val date: String,
    val titre: String,
    val resultat: String,          // scrutin : "adopté" / "rejeté" ; motion : "adoptée" / "rejetée"
    val typeScrutin: String?,      // scrutin public ordinaire / solennel
    val article: String?,          // motion : "49-2" / "49-3"
    val requis: Int?,              // motion : voix requises
    val mode: ModePlaces,
    val groupes: List<Groupe>,
    val deputes: List<DeputeSiege>,
)
