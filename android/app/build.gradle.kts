import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

/**
 * Embarque dans l'APK la dernière base publiée (../publication) et le plan de l'hémicycle
 * (../on_verra/web/hemicycle.json). Lancer `python3 -m on_verra publier` avant de construire.
 */
abstract class PreparerDonnees : DefaultTask() {
    @get:InputDirectory @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val publication: DirectoryProperty

    @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
    abstract val hemicycle: RegularFileProperty

    @get:OutputDirectory
    abstract val sortie: DirectoryProperty

    @TaskAction
    fun copier() {
        val dossier = publication.get().asFile
        val manifeste = dossier.resolve("manifest.json")
        check(manifeste.exists()) { "Aucune base publiée : lancez `python3 -m on_verra publier`." }
        val base = dossier.listFiles { f -> f.name.matches(Regex("""on_verra-\d+\.db\.gz""")) }
            ?.maxByOrNull { it.name.substringAfter('-').substringBefore('.').toInt() }
            ?: error("Base compressée introuvable dans $dossier")
        val cible = sortie.get().asFile.apply { deleteRecursively(); mkdirs() }
        base.copyTo(cible.resolve("on_verra.db.gz"))
        manifeste.copyTo(cible.resolve("manifest.json"))
        hemicycle.get().asFile.copyTo(cible.resolve("hemicycle.json"))
    }
}

val preparerDonnees = tasks.register<PreparerDonnees>("preparerDonnees") {
    publication.set(rootProject.layout.projectDirectory.dir("../publication"))
    hemicycle.set(rootProject.layout.projectDirectory.file("../on_verra/web/hemicycle.json"))
}

android {
    namespace = "fr.onverra"
    compileSdk = 37

    defaultConfig {
        applicationId = "fr.onverra"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        val url = providers.gradleProperty("onverra.publication.url").getOrElse("")
        buildConfigField("String", "URL_PUBLICATION", "\"$url\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.all {
            // Les tests comparent le code Kotlin aux résultats Python sur la vraie base.
            it.systemProperty("onverra.base", rootProject.file("../data/on_verra.db").absolutePath)
            it.systemProperty("onverra.hemicycle", rootProject.file("../on_verra/web/hemicycle.json").absolutePath)
        }
    }
}

kotlin {
    jvmToolchain(17)
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(preparerDonnees, PreparerDonnees::sortie)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.sqlite.jdbc)
    testImplementation(libs.org.json)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
