package fr.onverra

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import fr.onverra.ui.EcranLoi
import fr.onverra.ui.EcranLois
import fr.onverra.ui.OnVerraTheme
import fr.onverra.ui.PlanCompose

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OnVerraTheme {
                val geometrie = vm.geometrie
                when {
                    vm.erreur != null && geometrie == null ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(vm.erreur!!) }
                    geometrie == null ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    else -> {
                        val plan = remember(geometrie) { PlanCompose(geometrie) }
                        if (vm.loiOuverte != null) EcranLoi(vm, plan) else EcranLois(vm)
                    }
                }
            }
        }
    }
}
