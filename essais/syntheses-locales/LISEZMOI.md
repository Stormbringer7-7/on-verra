# Essai : résumés « en clair » avec une IA locale (PC Windows)

Rédige les résumés du dossier **« Protéger l'eau potable »** (le dossier + ses 16 amendements
adoptés, 17 textes) avec un modèle qui tourne sur la carte graphique, sans abonnement ni clé d'API.

À copier sur le PC Windows, dans un même dossier (clé USB, partage réseau…) :

| Fichier | Rôle |
|---|---|
| `lancer.bat` | à double-cliquer : lance la rédaction |
| `rediger.py` | le script : envoie chaque texte au modèle local, écrit les résumés |
| `lot-eau-potable.jsonl` | les 17 textes officiels à résumer (extraits de la base) |

`exporter.py` reste sur le PC serveur : il prépare d'autres lots.

## 1. Installer (une seule fois)

1. **Ollama** : https://ollama.com/download → installer `OllamaSetup.exe`. Il démarre tout seul
   (icône de lama près de l'horloge) et utilise la carte NVIDIA automatiquement.
2. **Python** : https://www.python.org/downloads/ → à l'installation, cocher
   **« Add python.exe to PATH »**. Aucune bibliothèque à ajouter.
3. **Le modèle** (environ 5 Go, tient dans les 8 Go de la RTX 3060 Ti) : ouvrir le menu
   Démarrer, taper « Terminal », puis :

   ```
   ollama pull qwen2.5:7b
   ```

## 2. Lancer

Double-cliquer sur **`lancer.bat`**. Une fenêtre affiche chaque résumé terminé et son temps ; le
premier est plus lent (le modèle se charge dans la carte). À la fin : « Appuyez sur une touche ».

Interrompu (fenêtre fermée, erreur) : double-cliquer à nouveau, il reprend où il s'était arrêté.
Le résultat est le fichier **`resultats-qwen.jsonl`**, à côté du script.

## 3. Comparer avec un autre modèle (facultatif)

Dans le Terminal, depuis le dossier des fichiers (clic droit dans le dossier → « Ouvrir dans le
Terminal ») :

```
ollama pull mistral:7b
py rediger.py lot-eau-potable.jsonl resultats-mistral.jsonl --modele mistral:7b
```

## 4. Rapporter

Ramener le ou les fichiers `resultats-….jsonl` sur le PC serveur. Chaque ligne contient le résumé
(ou `null` si le modèle a jugé les textes insuffisants), le modèle, la machine, le temps et le
nombre de jetons. Rien n'est envoyé sur Internet ; la base n'est pas touchée.

## En cas de problème

| Message | Que faire |
|---|---|
| « Ollama ne répond pas » | lancer Ollama depuis le menu Démarrer, puis relancer |
| « Modèle absent » | `ollama pull qwen2.5:7b` dans le Terminal |
| « 'py' n'est pas reconnu » et « 'python' n'est pas reconnu » | réinstaller Python en cochant « Add python.exe to PATH » |
| Très lent (plus d'une minute par résumé) | vérifier que le pilote NVIDIA est à jour ; Ollama tourne alors sur le processeur |

## Partager le travail avec un autre PC

Même script, même modèle (nom exact, ex. `qwen2.5:7b`) sur chaque machine : chacune reçoit son
propre lot (préparé par `exporter.py` sur le PC serveur), puis on rassemble les fichiers de résultats.
