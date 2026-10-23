package fr.onverra.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import fr.onverra.AppViewModel
import fr.onverra.EtatMaj
import fr.onverra.donnees.Depot
import fr.onverra.donnees.LoiResume
import fr.onverra.donnees.ResultatMaj

val NIVEAUX = mapOf("majeure" to "Majeure", "standard" to "Standard", "technique" to "Technique")
private val LEGISLATURES = listOf(null to "Toutes", "17" to "17e (depuis 2024)", "16" to "16e (2022-2024)", "15" to "15e (2017-2022)")
private val TRIS = listOf(Depot.Tri.SAILLANCE to "Saillance", Depot.Tri.DATE to "Date", Depot.Tri.TITRE to "Titre")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EcranLois(vm: AppViewModel) {
    val c = LocalCouleurs.current
    var infos by rememberSaveable { mutableStateOf(false) }
    val messages = remember { SnackbarHostState() }

    // Une mise à jour faite au démarrage est signalée une fois.
    val maj = vm.etatMaj
    LaunchedEffect(maj) {
        if (maj is EtatMaj.Termine && !infos) {
            val r = maj.resultat
            if (r is ResultatMaj.MiseAJour) {
                messages.showSnackbar("Base mise à jour : version ${r.vers}, ${r.nouveautes.size} nouveauté(s)")
                vm.oublierEtatMaj()
            }
        }
    }

    Scaffold(
        containerColor = c.surface0,
        snackbarHost = { SnackbarHost(messages) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("On verra", fontWeight = FontWeight.SemiBold)
                        Text("Qui a voté quoi sur chaque loi", style = MaterialTheme.typography.bodySmall, color = c.texte2)
                    }
                },
                actions = {
                    IconButton(onClick = { infos = true }) { Icon(Icons.Filled.Info, "À propos des données") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.surface1),
            )
        },
    ) { marges ->
        Column(Modifier.padding(marges).fillMaxSize()) {
            Filtres(vm)
            val lois = vm.lois
            when {
                vm.erreur != null -> Text(vm.erreur!!, Modifier.padding(16.dp), color = c.contre)
                lois == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                else -> {
                    Text("${lois.size} loi${if (lois.size > 1) "s" else ""}", Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.bodySmall, color = c.texte3)
                    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                        items(lois, key = { it.id }) { loi ->
                            CarteLoi(loi) { vm.ouvrirLoi(loi.id) }
                            HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = c.bordure)
                        }
                    }
                }
            }
        }
    }

    if (infos) DialogueInfos(vm) { infos = false; vm.oublierEtatMaj() }
}

@Composable
private fun Filtres(vm: AppViewModel) {
    val f = vm.filtres
    OutlinedTextField(
        value = f.recherche,
        onValueChange = { vm.changerFiltres(f.copy(recherche = it)) },
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp),
        placeholder = { Text("Rechercher une loi…") },
        leadingIcon = { Icon(Icons.Filled.Search, null) },
        trailingIcon = {
            if (f.recherche.isNotEmpty()) IconButton(onClick = { vm.changerFiltres(f.copy(recherche = "")) }) {
                Icon(Icons.Filled.Clear, "Effacer")
            }
        },
        singleLine = true,
    )
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Choix("Législature", LEGISLATURES, f.legislature) { vm.changerFiltres(f.copy(legislature = it)) }
        Choix("Importance", listOf<Pair<String?, String>>(null to "Tous niveaux") + NIVEAUX.toList(), f.niveau) {
            vm.changerFiltres(f.copy(niveau = it))
        }
        Choix("Tri", TRIS, f.tri) { vm.changerFiltres(f.copy(tri = it)) }
    }
}

@Composable
private fun <T> Choix(nom: String, options: List<Pair<T, String>>, valeur: T, onChoix: (T) -> Unit) {
    var ouvert by remember { mutableStateOf(false) }
    Box {
        FilterChip(
            selected = valeur != options.first().first,
            onClick = { ouvert = true },
            label = { Text(options.firstOrNull { it.first == valeur }?.second ?: nom) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, null) },
        )
        DropdownMenu(expanded = ouvert, onDismissRequest = { ouvert = false }) {
            options.forEach { (v, libelle) ->
                DropdownMenuItem(text = { Text(libelle) }, onClick = { ouvert = false; onChoix(v) })
            }
        }
    }
}

@Composable
private fun CarteLoi(loi: LoiResume, onClick: () -> Unit) {
    val c = LocalCouleurs.current
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Badge(loi.niveau)
        Text(loi.titre, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
            maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val meta = listOfNotNull(
                loi.legislature?.let { "${it}e" },
                loi.derniereDate?.let(::dateFr),
                "saillance ${loi.saillance.toInt()}",
                loi.nb493.takeIf { it > 0 }?.let { "49.3 ×$it" },
            )
            meta.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = c.texte3) }
        }
    }
}

@Composable
private fun DialogueInfos(vm: AppViewModel, onFermer: () -> Unit) {
    val c = LocalCouleurs.current
    val v = vm.versionBase
    AlertDialog(
        onDismissRequest = onFermer,
        confirmButton = { TextButton(onClick = onFermer) { Text("Fermer") } },
        dismissButton = {
            TextButton(onClick = { vm.verifierMiseAJour() }, enabled = vm.etatMaj != EtatMaj.EnCours) {
                Text("Vérifier les mises à jour")
            }
        },
        title = { Text("À propos des données") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Base : version ${v?.version ?: "?"}" + (v?.date?.let { ", publiée le ${dateFr(it.take(10))}" } ?: ""))
                Text(
                    when (val e = vm.etatMaj) {
                        EtatMaj.Inactive -> "Mise à jour automatique au démarrage."
                        EtatMaj.EnCours -> "Vérification en cours…"
                        is EtatMaj.Termine -> when (val r = e.resultat) {
                            ResultatMaj.NonConfiguree -> "Mise à jour en ligne non configurée : la base embarquée est utilisée."
                            is ResultatMaj.AJour -> "La base est à jour."
                            is ResultatMaj.MiseAJour -> "Mise à jour de la version ${r.de} à ${r.vers}."
                            is ResultatMaj.Erreur -> "Échec de la mise à jour : ${r.message}"
                        }
                    },
                    color = c.texte2,
                )
                Spacer(Modifier.height(4.dp))
                Text("Sources : open data de l'Assemblée nationale (data.assemblee-nationale.fr) ; plan de l'hémicycle : Assemblée nationale.",
                    style = MaterialTheme.typography.bodySmall, color = c.texte3)
            }
        },
    )
}

@Composable
fun Badge(niveau: String, suffixe: String = "") {
    val c = LocalCouleurs.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("● ", color = c.niveau(niveau), style = MaterialTheme.typography.labelSmall)
        Text((NIVEAUX[niveau] ?: niveau).uppercase() + suffixe, color = c.niveau(niveau),
            style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
    }
}

fun dateFr(iso: String): String = iso.split("-").takeIf { it.size == 3 }?.let { "${it[2]}/${it[1]}/${it[0]}" } ?: iso
