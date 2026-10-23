# big-brother

Stack de services autour des votes de l'Assemblée nationale.

| dossier | rôle |
|---|---|
| [`on-verra/`](on-verra) | sous-module : import de l'open data AN (tous les scrutins) → une base SQLite par législature, publication versionnée (index, manifestes, correctifs) |
| [`augure/`](augure) | app « Nos administrés ont du talent » : Expo (iOS, Android, web) qui lit les bases publiées |

Pas d'API : on-verra publie des fichiers statiques et les apps les téléchargent.

```bash
git clone --recurse-submodules <repo>          # ou : git submodule update --init
```

## Déploiement (Docker)

```bash
docker compose up -d --build          # app : http://localhost:8080 · publication : http://localhost:8081
docker compose logs -f extraction     # premier import : ~4 min (téléchargement AN + compilation)
docker compose down                   # arrêter (les volumes sont gardés)
```

| service | image | rôle |
|---|---|---|
| `extraction` | `on-verra/Dockerfile` (Python, bibliothèque standard) | télécharge l'open data, compile et publie une base par législature dans le volume `publication`, puis recommence toutes les `INTERVALLE_MAJ` secondes (1 jour) ; seules les législatures qui ont changé reçoivent une nouvelle version |
| `publication` | `on-verra/Dockerfile.nginx` (nginx) | sert le volume `publication` aux applications : `index.json`, `<leg>/manifest.json`, bases, correctifs ; CORS ouvert, `courante.db` jamais servie |
| `web` | `augure/Dockerfile` (export Expo → nginx) | sert l'app web ; `/donnees` relaie le service `publication` (même origine pour l'app) |

Volumes : `cache` (fichiers bruts de l'AN et bases compilées, ~600 Mo, privé) et `publication`
(~33 Mo compressés, ce qui est servi). Tant que la première publication n'existe pas, l'app web
affiche une erreur avec un bouton « Réessayer ».

Les apps mobiles lisent directement le service `publication` : construire l'app avec
`EXPO_PUBLIC_PUBLICATION_URL=https://<hôte de publication>`. Derrière un proxy HTTPS, exposer
les ports 8080 (app) et 8081 (publication).
