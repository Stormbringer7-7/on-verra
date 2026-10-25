# Nos politiques ont du talent — wiki

Suivre une loi du dépôt au Journal officiel, et les personnes et institutions qui la font, à
partir de l'open data officiel. Ce fichier est la documentation principale du dépôt ; les docs
propres à un service sont listées en fin de page ([Où trouver quoi](#où-trouver-quoi)).

**En cours, à faire, idées** : [TODO.md](TODO.md) (un seul TODO pour tout le dépôt).

## Règles de fond

Elles valent pour les données, l'API et l'app.

- **Seul ce qui est 100 % fiable est un fait** : identifiant officiel, référence explicite dans la
  source, ou décision humaine tracée. Tout le reste devient un **cas de revue humaine**, jamais
  tranché par le code ([rapprochements.md](../opendata/docs/rapprochements.md)).
- **Chaque fait porte sa source** (système, identifiant natif, URL officielle ou rien, jamais une
  URL inventée).
- **Chaque rapprochement porte son statut** (vérifié ou à vérifier) ; l'app ne peut pas montrer un
  candidat comme un fait (le type l'en empêche).
- **Jamais un chiffre sans « par rapport à quoi »** : référence, dénominateur, période, « ce que la
  donnée ne dit pas ».
- **Aucun LLM branché** : le port `Synthetiseur` n'a qu'un adaptateur, `SansSynthese`, et l'app
  affiche « Pas de synthèse disponible ».
- **Ports et adaptateurs partout** : la source des données n'est jamais figée (Postgres derrière un
  port, mémoire ou fixtures pour les essais).
- Français partout : code, tables, docs.

## Architecture

```
open data (AN, Sénat, DILA, HATVP, RNE, INSEE)
        │  téléchargé, mis en cache (opendata/data/brut), seuls les fichiers changés sont relus
        ▼
  donnees (Python, opendata/)  ── migrer → canon → projeter → controles, chaque jour
        │
        ▼
  postgres, base « civictrace » : brut · canon · analytique · lecture
        │  lecture seule (sauf analytique.signalement)
        ▼
  api (Node, api/)  ── une route POST par commande du contrat
        │
        ▼
  web (export Expo de augure/, nginx)  ◀── caddy (HTTPS, seule entrée publique) : / = app, /api = api
```

| Service (compose) | Code | Rôle |
|---|---|---|
| `donnees` | `opendata/` (`docker/canon.sh`) | charge la base depuis l'open data, puis projections et contrôles, toutes les `INTERVALLE_MAJ` secondes (1 jour) |
| `postgres` | `postgres/initdb/` | Postgres 17 ; crée la base `civictrace` au premier démarrage |
| `api` | `api/` | lit `canon` et `lecture` ; `SOURCE_DONNEES=postgres\|memoire` |
| `web` | `augure/` (`docker/nginx.conf`) | app web ; `/api` relaie le service `api` |
| `caddy` | `caddy/Caddyfile` | HTTPS automatique (Let's Encrypt) sur `$DOMAINE` |
| `pgadmin` (profil `admin`) | `pgadmin/servers.json` | administration de Postgres, `http://127.0.0.1:8083`, jamais exposé |

Schémas de la base :

| Schéma | Contenu |
|---|---|
| `brut` | une empreinte (sha256) par document source lu : sert à sauter l'inchangé et à remonter à la source |
| `canon` | les entités et leurs liens, seulement ce qui est 100 % fiable, avec provenance par colonne |
| `analytique` | cas de revue, décisions, affirmations (vide tant qu'aucun LLM), signalements des utilisateurs |
| `lecture` | projections pour l'API (barre de parcours, participation, écarts…), reconstruites par `projeter` |

**Le contrat app ↔ API** vit dans `augure/src/core` (alias `@contrat` côté API) : une query par
écran, une seule command (`SignalerErreur`), des DTO où chaque fait a sa provenance. Détail :
[contrat.md](contrat.md).

## Développer en local

Prérequis : Docker, Python 3.10+, Node 22.

```bash
cp .env.example .env                        # DOMAINE=localhost, POSTGRES_PASSWORD
docker compose up -d postgres               # Postgres sur 127.0.0.1:5433
```

**Données** (`opendata/`, détail dans son [README](../opendata/README.md)) :

```bash
cd opendata
python3 -m venv .venv && .venv/bin/pip install "psycopg[binary]"
export DATABASE_URL=postgres://big-brother:big-brother@127.0.0.1:5433/civictrace
.venv/bin/python -m src migrer              # schéma, idempotent
.venv/bin/python -m src canon               # complet ≈ 40 min, incrémental ≈ 6 min
.venv/bin/python -m src projeter            # schéma lecture
.venv/bin/python -m src controles           # invariants « 100 % fiable » ; échoue sinon
.venv/bin/python -m unittest discover tests
```

**API** (`api/`) :

```bash
cd api && npm ci
npm run dev                                 # http://localhost:3000, base locale (civictrace sur :5433)
npm run dev:memoire                         # sans base : fixtures du contrat
npm test && npm run typecheck               # npm run test:pg : tests sur la vraie base
```

**App** (`augure/`, détail dans son [README](../augure/README.md)) :

```bash
cd augure && npm ci
EXPO_PUBLIC_SOURCE=fixtures npx expo start --web     # maquette, sans API
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
npm test && npm run typecheck && npm run lint
```

**Tout en Docker** : `docker compose up -d --build`, puis app sur `http://127.0.0.1:8080`, API sur
`:8082`. Sur une base vide, le premier chargement prend environ 40 min (`docker compose logs -f donnees`).

## Déployer

Le serveur tourne sur cette version depuis le 25/10/2026 (base `civictrace`, service `donnees`).

### Mettre à jour le serveur

```bash
git pull
docker compose up -d --build                # ou seulement le service changé : web, api, donnees
docker compose logs -f donnees              # le cycle suivant applique les nouvelles migrations
```

Une migration de données peut s'appliquer tout de suite, sans attendre le cycle :
`docker compose run --rm donnees python -m src migrer`.

### Installer un nouveau serveur sans attendre le premier chargement

On part d'un **dump de la base** et du **cache des fichiers bruts** préparés ailleurs ; `donnees`
reprend ensuite en incrémental.

```bash
# Sur la machine qui a la base à jour (contrôles OK) :
docker exec big-brother-postgres-1 pg_dump -U big-brother -d civictrace -Fc -Z zstd:5 \
  > opendata/data/dumps/civictrace-$(date +%F).dump
rsync -a --info=progress2 opendata/data/dumps/civictrace-AAAA-MM-JJ.dump "$SERVEUR:$DOSSIER/opendata/data/dumps/"
rsync -a --info=progress2 opendata/data/brut/ "$SERVEUR:$DOSSIER/opendata/data/brut/"   # ≈ 2,3 Go

# Sur le serveur, dépôt cloné, .env rempli :
docker compose up -d postgres                                    # crée la base civictrace (vide)
docker compose cp opendata/data/dumps/civictrace-AAAA-MM-JJ.dump postgres:/tmp/civictrace.dump
docker compose exec postgres pg_restore -U big-brother -d civictrace --no-owner -j 4 /tmp/civictrace.dump
docker compose exec postgres sh -c 'rm /tmp/civictrace.dump && psql -U big-brother -d civictrace -c "ANALYZE"'
docker compose up -d --build
```

La restauration passe l'essentiel de son temps à reconstruire les index (30 min et plus selon la
machine) : ne pas l'interrompre ; `pg_stat_activity` montre la requête en cours.

### Vérifier

```bash
curl -s https://$DOMAINE/api/sante                                       # {"ok":true}
curl -s -XPOST https://$DOMAINE/api/dossiers/lister -H 'content-type: application/json' -d '{}' | head -c 300
docker compose logs --tail 50 api
```

Dans l'app : Accueil, un dossier (barre de parcours), un scrutin (hémicycle), l'annuaire.

### Revenir en arrière

`git checkout <commit précédent> && docker compose up -d --build`. Une migration appliquée n'est
pas annulée : restaurer le dump précédent si le schéma a changé.

## Revue humaine

Tout rapprochement incertain devient un cas de revue (127 666 au 25/10/2026). Une décision est
tracée (qui, quand, motif) et rejouée à chaque chargement.

```bash
.venv/bin/python -m src revue rapport       # docs/revue/rapport.md + un CSV par type (non versionnés)
.venv/bin/python -m src revue lister <type>
.venv/bin/python -m src revue decider <cle> --choix <n|aucun> --par <nom> [--motif …]
```

Procédure et types de cas : [rapprochements.md](../opendata/docs/rapprochements.md).

## Historique du dépôt

Jusqu'au 25/10/2026, ce dépôt contenait `on_verra` : qui a voté quoi sur chaque loi de l'AN
(15e à 17e législatures), import Python vers SQLite, interface web locale avec hémicycle, app
Android Kotlin embarquant la base, et une Action GitHub qui publiait la base chaque jour sur
GitHub Pages (branche `gh-pages`). Il a été remplacé par le code de
[fxst1/big-brother](https://github.com/fxst1/big-brother), dont l'historique est fusionné ici
(remote `ami` en local).

L'ancienne version reste disponible :

| Où | Quoi |
|---|---|
| tag `on_verra-v1`, branche `sauvegarde/on_verra-v1` | tout le code et la doc d'`on_verra`, dont `.github/workflows/publication.yml` |
| branche `gh-pages` | dernière base SQLite publiée (version 1), plus mise à jour : l'Action a été retirée |

```bash
git checkout on_verra-v1                    # consulter ; revenir : git checkout main
git fetch ami && git merge ami/main         # reprendre les nouveautés de big-brother
```

## Où trouver quoi

| Document | Contenu |
|---|---|
| [TODO.md](TODO.md) | en cours, à faire (données, API, intégration du design v3, app, déploiement), idées |
| [contrat.md](contrat.md) | contrat app ↔ API : écran → commande → DTO → ports → tables, écarts au design |
| [opendata/README.md](../opendata/README.md) | ETL : commandes, architecture, ajouter une source, tests |
| [modele.md](../opendata/docs/modele.md) | modèle canonique, ce qui est chargé, règles de rattachement |
| [uml.md](../opendata/docs/uml.md) | diagrammes du fichier source à la colonne (régénéré par `python -m src uml`) |
| [rapprochements.md](../opendata/docs/rapprochements.md) | ce qui est relié automatiquement, ce qui ne l'est jamais, revue |
| [modifications.md](../opendata/docs/modifications.md) | ce qui a changé article par article, amendement à l'origine |
| [indicateurs.md](../opendata/docs/indicateurs.md) | projections `lecture` : barre de parcours, participation, écarts, limites |
| [sources/](../opendata/docs/sources/README.md) | une fiche par source avec des exemples réels reliés au code (liens vérifiés par `opendata/tests/test_docs.py`) : [AN](../opendata/docs/sources/an.md), [Sénat](../opendata/docs/sources/senat.md), [Légifrance et CC](../opendata/docs/sources/legifrance.md), [HATVP](../opendata/docs/sources/hatvp.md), [RNE](../opendata/docs/sources/rne.md), [INSEE](../opendata/docs/sources/insee.md) |
| [augure/README.md](../augure/README.md) | app : design, sources de données, navigation, règles d'affichage |
| [augure/AGENTS.md](../augure/AGENTS.md) | consignes Expo / React Native pour les agents de code |
| [debatron/PLAN.md](../debatron/PLAN.md) | plan du debatron (débats autour des textes), en attente de l'app |
