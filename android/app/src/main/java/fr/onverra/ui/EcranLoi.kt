package fr.onverra.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import fr.onverra.AppViewModel
import fr.onverra.ModeCouleur
import fr.onverra.donnees.DeputeSiege
import fr.onverra.donnees.DetailLoi
import fr.onverra.donnees.Groupe
import fr.onverra.donnees.ModePlaces
import fr.onverra.donnees.Position
import fr.onverra.donnees.TypeVote
import fr.onverra.donnees.Vote

private val ETAPES = mapOf("AN1" to "1re lecture", "CMP" to "texte de CMP", "ANNLEC" to "nouvelle lecture", "ANLDEF" to "lecture définitive")
private val CAUSES = mapOf("PAN" to "président de l'Assemblée", "PSE" to "président de séance", "MG" to "membre du gouvernement")
private val LIBELLES = mapOf(Position.POUR to "Pour", Position.CONTRE to "Contre", Position.ABSTENTION to "Abstention",
    Position.NON_VOTANT to "Non-votant")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EcranLoi(vm: AppViewModel, plan: PlanCompose) {
    val c = LocalCouleurs.current
    BackHandler { vm.fermerLoi() }
    Scaffold(
        containerColor = c.surface0,
        topBar = {
            TopAppBar(
                title = { Text("Loi", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = vm::fermerLoi) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.surface1),
            )
        },
    ) { marges ->
        val detail = vm.detail
        if (detail == null) {
            Box(Modifier.padding(marges).fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        // L'état de zoom et la sélection repartent de zéro à chaque nouveau vote.
        val etatZoom = remember(vm.vote?.uid) { EtatZoom() }
        var selection by remember(vm.vote?.uid) { mutableStateOf<DeputeSiege?>(null) }
        LazyColumn(Modifier.padding(marges).testTag("page-loi"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { EnteteLoi(detail) }
            item { ChoixVotes(detail, vm) }
            val vote = vm.vote
            if (vote == null) {
                item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            } else {
                item {
                    CarteHemicycle(vote, plan, vm.couleur, { vm.couleur = it }, etatZoom, selection) { selection = it }
                }
                item { CarteGroupes(vote, plan) }
                item { CarteNoms(vote, plan) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EnteteLoi(d: DetailLoi) {
    val c = LocalCouleurs.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Badge(d.loi.niveau, " · SAILLANCE ${d.loi.saillance.toInt()}")
        Text(d.loi.titre, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        val details = listOfNotNull(
            d.loi.raisons,
            d.loi.nbScrutins?.takeIf { it > 0 }?.let { "$it scrutins publics sur le texte" },
            d.loi.promulgation?.let { "promulguée le ${dateFr(it)}" } ?: "non promulguée",
        )
        Text(details.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = c.texte2)
        d.engagements.forEach { e ->
            val issue = if (e.issue?.contains("rejeté") == true) "considéré comme rejeté" else "considéré comme adopté"
            Text("49.3 le ${dateFr(e.date)} (${ETAPES[e.etape] ?: e.etape}) : texte $issue, sans vote",
                style = MaterialTheme.typography.bodySmall, color = c.texte2)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoixVotes(d: DetailLoi, vm: AppViewModel) {
    val c = LocalCouleurs.current
    if (d.scrutins.isEmpty() && d.motions.isEmpty()) {
        Text("Aucun vote nominatif sur ce texte.", color = c.texte3)
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        d.scrutins.forEach { s ->
            FilterChip(
                selected = vm.voteChoisi == TypeVote.SCRUTIN to s.uid,
                onClick = { vm.choisirVote(TypeVote.SCRUTIN, s.uid) },
                label = { Text("${(s.lecture ?: "vote final").replaceFirstChar { it.uppercase() }} · ${dateFr(s.date)} · ${s.sort} ${s.pour}–${s.contre}") },
            )
        }
        d.motions.forEach { m ->
            FilterChip(
                selected = vm.voteChoisi == TypeVote.MOTION to m.uid,
                onClick = { vm.choisirVote(TypeVote.MOTION, m.uid) },
                label = { Text("Censure n°${m.numero} · ${dateFr(m.date)} · ${if (m.adoptee) "adoptée" else "rejetée"} ${m.pour}/${m.requis}") },
            )
        }
    }
}

@Composable
private fun Carte(contenu: @Composable () -> Unit) {
    val c = LocalCouleurs.current
    Card(
        colors = CardDefaults.cardColors(containerColor = c.surface1),
        border = androidx.compose.foundation.BorderStroke(1.dp, c.bordure),
        modifier = Modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { contenu() } }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun CarteHemicycle(
    vote: Vote, plan: PlanCompose, couleur: ModeCouleur, onCouleur: (ModeCouleur) -> Unit,
    etatZoom: EtatZoom, selection: DeputeSiege?, onSelection: (DeputeSiege?) -> Unit,
) {
    val c = LocalCouleurs.current
    val motion = vote.type == TypeVote.MOTION
    val n = remember(vote) { vote.deputes.groupingBy { it.position }.eachCount() }
    Carte {
        Column {
            Text(
                if (motion) "Motion de censure n°${vote.numero} du ${dateFr(vote.date)} (article ${vote.article?.replace("-", ".")})"
                else "Scrutin n°${vote.numero} du ${dateFr(vote.date)} : ${vote.resultat}",
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                if (motion) (if (vote.resultat == "adoptée") "Motion adoptée : le gouvernement est renversé."
                             else "Motion rejetée. Seuls les votes favorables à la censure sont publiés.")
                else vote.titre.replaceFirstChar { it.uppercase() },
                style = MaterialTheme.typography.bodySmall, color = c.texte2,
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (motion) {
                Tuile(n[Position.POUR] ?: 0, "pour la censure", c.pour)
                Tuile(vote.requis ?: 0, "voix requises", c.bordure)
                Tuile(n[null] ?: 0, "n'ont pas voté la censure", c.bordure)
            } else {
                Tuile(n[Position.POUR] ?: 0, "pour", c.pour)
                Tuile(n[Position.CONTRE] ?: 0, "contre", c.contre)
                Tuile(n[Position.ABSTENTION] ?: 0, "abstentions", c.abstention)
                Tuile(n[Position.NON_VOTANT] ?: 0, "non-votants", c.bordure)
                Tuile(n[null] ?: 0, "sans vote enregistré", c.bordure)
            }
        }
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf(ModeCouleur.GROUPES to "Groupes politiques", ModeCouleur.VOTES to "Votes").forEachIndexed { i, (mode, texte) ->
                SegmentedButton(selected = couleur == mode, onClick = { onCouleur(mode) },
                    shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(texte) }
            }
        }
        RechercheDepute(vote, plan, etatZoom, onSelection)
        Hemicycle(plan, vote, couleur, selection?.acteur, etatZoom, onSelection, Modifier.testTag("hemicycle"))
        // Sous l'hémicycle, pour ne masquer aucun siège.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = etatZoom::reinitialiser, enabled = etatZoom.zoom > 1.01f) { Text("Vue d'ensemble") }
            BoutonZoom("−", "Dézoomer") { etatZoom.zoomer(1 / 1.6f) }
            BoutonZoom("+", "Zoomer") { etatZoom.zoomer(1.6f) }
        }
        selection?.let { FicheDepute(it, vote) }
        Text(
            if (vote.mode == ModePlaces.REEL) "Sièges réels publiés par l'Assemblée. Touchez un siège pour voir le député ; pincez pour zoomer, les noms apparaissent."
            else "Sièges reconstitués : l'Assemblée ne publie pas la place de chaque député pour cette législature. Chaque groupe occupe un secteur, dans l'ordre gauche-droite observé.",
            style = MaterialTheme.typography.bodySmall, color = c.texte3,
        )
        Legende(vote, plan, couleur, n)
    }
}

@Composable
private fun Tuile(valeur: Int, libelle: String, trait: Color) {
    val c = LocalCouleurs.current
    Row {
        Box(Modifier.size(3.dp, 40.dp).background(trait))
        Column(Modifier.padding(start = 8.dp)) {
            Text("$valeur", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(libelle, style = MaterialTheme.typography.bodySmall, color = c.texte2)
        }
    }
}

@Composable
private fun BoutonZoom(texte: String, description: String, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, contentPadding = PaddingValues(0.dp),
        modifier = Modifier.size(44.dp).semantics { contentDescription = description }) {
        Text(texte, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun RechercheDepute(vote: Vote, plan: PlanCompose, etatZoom: EtatZoom, onSelection: (DeputeSiege?) -> Unit) {
    val c = LocalCouleurs.current
    var texte by remember(vote.uid) { mutableStateOf("") }
    val propositions = remember(texte, vote) {
        if (texte.length < 2) emptyList()
        else vote.deputes.filter { "${it.prenom} ${it.nom}".contains(texte.trim(), ignoreCase = true) }.take(5)
    }
    Column {
        OutlinedTextField(value = texte, onValueChange = { texte = it }, singleLine = true,
            placeholder = { Text("Trouver un député…") }, modifier = Modifier.fillMaxWidth())
        propositions.forEach { d ->
            Text("${d.prenom} ${d.nom}", Modifier.fillMaxWidth().clickable {
                texte = ""
                onSelection(d)
                val s = d.siege?.let { plan.parNum[it] } ?: return@clickable
                val base = etatZoom.taille.width / plan.geometrie.largeur.toFloat()
                etatZoom.centrerSur(Offset(s.x.toFloat() * base, s.y.toFloat() * base), 4f)
            }.padding(vertical = 10.dp, horizontal = 4.dp), color = c.texte)
        }
    }
}

@Composable
private fun FicheDepute(d: DeputeSiege, vote: Vote) {
    val c = LocalCouleurs.current
    val g = vote.groupes.firstOrNull { it.ref == d.groupe }
    val (position, precision) = when {
        vote.type == TypeVote.MOTION -> (if (d.position == Position.POUR) "A voté la censure" else "N'a pas voté la censure") to null
        d.position == null -> "Sans vote enregistré" to "absent, ou présent sans prendre part au vote"
        d.position == Position.NON_VOTANT -> "Non-votant" to CAUSES[d.cause]
        else -> LIBELLES.getValue(d.position) to (if (d.delegation) "par délégation (absent de l'hémicycle)" else null)
    }
    Column(Modifier.fillMaxWidth().border(1.dp, c.bordure, RoundedCornerShape(8.dp)).padding(12.dp)) {
        Text("${d.prenom} ${d.nom}", fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).background(couleurHex(g?.couleur), RoundedCornerShape(2.dp)))
            Text(g?.let { " ${it.libelle} (${it.abrege})" } ?: " Groupe inconnu", style = MaterialTheme.typography.bodySmall, color = c.texte2)
        }
        Text(position, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        precision?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.texte3) }
        d.siege?.let { Text("Siège n°$it", style = MaterialTheme.typography.bodySmall, color = c.texte3) }
    }
}

/** Groupes de gauche à droite, d'après l'angle moyen des sièges de leurs membres. */
private fun groupesOrdonnes(vote: Vote, plan: PlanCompose): List<Groupe> {
    val angles = vote.deputes.filter { it.siege != null }.groupBy { it.groupe }
        .mapValues { (_, ds) -> ds.mapNotNull { plan.parNum[it.siege!!]?.angle }.average() }
    return vote.groupes.sortedBy { angles[it.ref] ?: 90.0 }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legende(vote: Vote, plan: PlanCompose, couleur: ModeCouleur, n: Map<Position?, Int>) {
    val c = LocalCouleurs.current
    val motion = vote.type == TypeVote.MOTION
    if (couleur == ModeCouleur.GROUPES) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            groupesOrdonnes(vote, plan).forEach { g ->
                Pastille(couleurHex(g.couleur), "${g.abrege} ", "${g.membres}", carree = true)
            }
        }
    }
    val positions = if (motion) listOf(Position.POUR to "A voté la censure", null to "N'a pas voté la censure")
    else listOf(Position.POUR to "Pour", Position.CONTRE to "Contre", Position.ABSTENTION to "Abstention",
        Position.NON_VOTANT to "Non-votant (fonction)", null to "Sans vote enregistré")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        positions.forEach { (p, texte) ->
            Pastille(c.vote(p) ?: c.texte3.copy(alpha = 0.35f), "$texte ", "${n[p] ?: 0}", carree = couleur == ModeCouleur.VOTES)
        }
    }
    if (couleur == ModeCouleur.GROUPES) {
        Text("Pastille sur le siège : sens du vote. Siège pâle : pas de vote enregistré.",
            style = MaterialTheme.typography.bodySmall, color = c.texte3)
    }
}

@Composable
private fun Pastille(couleur: Color, texte: String, nombre: String, carree: Boolean) {
    val c = LocalCouleurs.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).background(couleur, if (carree) RoundedCornerShape(3.dp) else CircleShape))
        Text(" $texte", style = MaterialTheme.typography.bodySmall, color = c.texte2)
        Text(nombre, style = MaterialTheme.typography.bodySmall, color = c.texte3)
    }
}

@Composable
private fun CarteGroupes(vote: Vote, plan: PlanCompose) {
    val c = LocalCouleurs.current
    val motion = vote.type == TypeVote.MOTION
    val colonnes: List<Pair<String, (Groupe) -> String>> = if (motion) listOf(
        "Membres" to { g -> "${g.membres}" }, "Pour la censure" to { g -> "${g.pour}" }, "Pas de vote" to { g -> "${g.sansVote}" },
    ) else listOf(
        "Membres" to { g -> "${g.membres}" }, "Pour" to { g -> "${g.pour}" }, "Contre" to { g -> "${g.contre}" },
        "Abst." to { g -> "${g.abstention}" }, "Non-vot." to { g -> "${g.nonVotant}" }, "Sans vote" to { g -> "${g.sansVote}" },
        "Ligne" to { g -> g.ligne?.let { LIBELLES[it] } ?: "—" },
    )
    Carte {
        Text("Par groupe (de gauche à droite)", fontWeight = FontWeight.SemiBold)
        Column(Modifier.horizontalScroll(rememberScrollState())) {
            Row {
                Text("Groupe", Modifier.width(96.dp), style = MaterialTheme.typography.labelMedium, color = c.texte2)
                colonnes.forEach { (t, _) ->
                    Text(t, Modifier.width(72.dp), style = MaterialTheme.typography.labelMedium, color = c.texte2, textAlign = TextAlign.End)
                }
            }
            groupesOrdonnes(vote, plan).forEach { g ->
                Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.width(96.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).background(couleurHex(g.couleur), RoundedCornerShape(2.dp)))
                        Text(" ${g.abrege}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                    }
                    colonnes.forEach { (_, valeur) ->
                        Text(valeur(g), Modifier.width(72.dp), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.End)
                    }
                }
            }
        }
    }
}

@Composable
private fun CarteNoms(vote: Vote, plan: PlanCompose) {
    val c = LocalCouleurs.current
    val motion = vote.type == TypeVote.MOTION
    val ordre = remember(vote) { groupesOrdonnes(vote, plan) }
    val sections = if (motion) listOf(Position.POUR to "Ont voté la censure", null to "N'ont pas voté la censure")
    else listOf(Position.POUR to "Pour", Position.CONTRE to "Contre", Position.ABSTENTION to "Abstentions",
        Position.NON_VOTANT to "Non-votants", null to "Sans vote enregistré")
    Carte {
        Text("Liste des députés", fontWeight = FontWeight.SemiBold)
        sections.forEach { (p, titre) ->
            val deputes = vote.deputes.filter { it.position == p }
            var ouvert by remember(vote.uid, p) { mutableStateOf(false) }
            Row(Modifier.fillMaxWidth().clickable { ouvert = !ouvert }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text("$titre (${deputes.size})", Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                Icon(if (ouvert) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, null)
            }
            if (ouvert) {
                ordre.forEach { g ->
                    val membres = deputes.filter { it.groupe == g.ref }.sortedBy { it.nom }
                    if (membres.isNotEmpty()) {
                        Text("${g.abrege} (${membres.size}) : " + membres.joinToString(", ") {
                            "${it.prenom} ${it.nom}" + if (it.delegation) "*" else ""
                        }, style = MaterialTheme.typography.bodySmall, color = c.texte2)
                    }
                }
            }
        }
        if (!motion) Text("* vote par délégation : le député n'était pas dans l'hémicycle.",
            style = MaterialTheme.typography.bodySmall, color = c.texte3)
    }
}
