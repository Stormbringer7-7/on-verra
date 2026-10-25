# big-brother — Nos politiques ont du talent

Suivre une loi du dépôt au Journal officiel, et les personnes et institutions qui la font, à
partir de l'open data officiel (Assemblée nationale, Sénat, DILA, HATVP, RNE, INSEE). Seul ce qui
est 100 % fiable est affiché comme un fait ; le reste passe en revue humaine.

| Dossier | Rôle |
|---|---|
| [`opendata/`](opendata) | ETL Python : charge chaque jour la base Postgres `civictrace` |
| [`api/`](api) | API Node : une route par commande de l'app, lecture seule |
| [`augure/`](augure) | app Expo (iOS, Android, web) |
| [`debatron/`](debatron) | plan du debatron, pas encore de code |

```bash
cp .env.example .env && docker compose up -d --build    # app : http://127.0.0.1:8080
```

Documentation (architecture, développement, déploiement, revue) : **[docs/README.md](docs/README.md)**.
En cours, à faire, idées : [docs/TODO.md](docs/TODO.md).

Ce dépôt reprend [fxst1/big-brother](https://github.com/fxst1/big-brother) depuis le 25/10/2026 ;
il contenait avant `on_verra` (Python + SQLite, interface web, app Android Kotlin), conservé au
tag `on_verra-v1` : voir [Historique du dépôt](docs/README.md#historique-du-dépôt).
