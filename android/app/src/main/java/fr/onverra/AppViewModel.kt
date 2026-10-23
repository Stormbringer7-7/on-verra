package fr.onverra

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.onverra.donnees.Base
import fr.onverra.donnees.Depot
import fr.onverra.donnees.DetailLoi
import fr.onverra.donnees.Geometrie
import fr.onverra.donnees.LoiResume
import fr.onverra.donnees.MiseAJour
import fr.onverra.donnees.RequeteurAndroid
import fr.onverra.donnees.ResultatMaj
import fr.onverra.donnees.TypeVote
import fr.onverra.donnees.Vote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class Filtres(
    val recherche: String = "",
    val legislature: String? = "17",
    val niveau: String? = null,
    val tri: Depot.Tri = Depot.Tri.SAILLANCE,
)

enum class ModeCouleur { GROUPES, VOTES }

sealed interface EtatMaj {
    data object Inactive : EtatMaj
    data object EnCours : EtatMaj
    data class Termine(val resultat: ResultatMaj) : EtatMaj
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val base = Base(app)
    private val miseAJour = MiseAJour(base, BuildConfig.URL_PUBLICATION)
    private lateinit var depot: Depot

    var geometrie by mutableStateOf<Geometrie?>(null); private set
    var erreur by mutableStateOf<String?>(null); private set
    var filtres by mutableStateOf(Filtres()); private set
    var lois by mutableStateOf<List<LoiResume>?>(null); private set
    var loiOuverte by mutableStateOf<String?>(null); private set
    var detail by mutableStateOf<DetailLoi?>(null); private set
    var voteChoisi by mutableStateOf<Pair<TypeVote, String>?>(null); private set
    var vote by mutableStateOf<Vote?>(null); private set
    var couleur by mutableStateOf(ModeCouleur.GROUPES)
    var etatMaj by mutableStateOf<EtatMaj>(EtatMaj.Inactive); private set
    var versionBase by mutableStateOf<Base.Version?>(null); private set

    private var chargementLois: Job? = null

    init {
        viewModelScope.launch {
            try {
                val (g, v) = withContext(Dispatchers.IO) {
                    val g = getApplication<Application>().assets.open("hemicycle.json").bufferedReader().use { Geometrie.lire(it.readText()) }
                    depot = Depot(RequeteurAndroid(base::db), g)
                    g to base.version()
                }
                geometrie = g
                versionBase = v
                chargerLois()
                verifierMiseAJour(automatique = true)
            } catch (e: Exception) {
                erreur = "Impossible d'ouvrir la base : ${e.message}"
            }
        }
    }

    fun changerFiltres(nouveaux: Filtres) {
        val saisie = nouveaux.recherche != filtres.recherche
        filtres = nouveaux
        chargerLois(attente = if (saisie) 200 else 0)
    }

    private fun chargerLois(attente: Long = 0) {
        chargementLois?.cancel()
        chargementLois = viewModelScope.launch {
            if (attente > 0) delay(attente)
            val f = filtres
            lois = withContext(Dispatchers.IO) { depot.lois(f.recherche, f.legislature, f.niveau, f.tri) }
        }
    }

    fun ouvrirLoi(id: String) {
        loiOuverte = id
        detail = null
        vote = null
        viewModelScope.launch {
            val d = withContext(Dispatchers.IO) { depot.loi(id) } ?: return@launch
            detail = d
            // Par défaut : le dernier vote final, sinon la dernière motion de censure.
            val parDefaut = d.scrutins.lastOrNull()?.let { TypeVote.SCRUTIN to it.uid }
                ?: d.motions.lastOrNull()?.let { TypeVote.MOTION to it.uid }
            parDefaut?.let { choisirVote(it.first, it.second) }
        }
    }

    fun fermerLoi() {
        loiOuverte = null
        detail = null
        vote = null
        voteChoisi = null
    }

    fun choisirVote(type: TypeVote, uid: String) {
        voteChoisi = type to uid
        viewModelScope.launch {
            val v = withContext(Dispatchers.IO) { if (type == TypeVote.MOTION) depot.motion(uid) else depot.scrutin(uid) }
            if (voteChoisi == type to uid) vote = v
        }
    }

    fun verifierMiseAJour(automatique: Boolean = false) {
        if (etatMaj == EtatMaj.EnCours) return
        etatMaj = EtatMaj.EnCours
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { miseAJour.verifier() }
            // Au démarrage, une adresse non configurée n'est pas un événement à signaler.
            etatMaj = if (automatique && r == ResultatMaj.NonConfiguree) EtatMaj.Inactive else EtatMaj.Termine(r)
            if (r is ResultatMaj.MiseAJour) {
                versionBase = withContext(Dispatchers.IO) { base.version() }
                chargerLois()
                loiOuverte?.let { id -> ouvrirLoi(id) }
            }
        }
    }

    fun oublierEtatMaj() {
        if (etatMaj is EtatMaj.Termine) etatMaj = EtatMaj.Inactive
    }
}
