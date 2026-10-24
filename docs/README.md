# Documentation — Nos politiques ont du talent (CivicTrace)

Point d'entrée de toute la documentation du dépôt. Trois parties : `opendata/` (ETL Python qui
construit la base Postgres), `api/` (serveur Node qui la lit) et `augure/` (app Expo : iOS,
Android, web). Règle commune : seul ce qui est **100 % fiable** est affiché comme un fait ; le
reste part en revue humaine.

## Commencer

| Document | Contenu |
|---|---|
| [README du dépôt](../README.md) | Présentation, services Docker, lancement |
| [opendata/README.md](../opendata/README.md) | ETL : démarrage, commandes (`migrer`, `canon`, `projeter`, `controles`, `revue`), architecture, tests, chaîne historique SQLite |
| [deploiement.md](deploiement.md) | Passer le serveur à la nouvelle version : dump, cache brut, bascule, retour arrière |
| [augure/README.md](../augure/README.md) | App : design, sources de données (`EXPO_PUBLIC_SOURCE=api\|fixtures`), lancement |

## Produit et contrat

| Document | Contenu |
|---|---|
| [contrat.md](contrat.md) | Contrat app ↔ API : commandes, DTO, règles (provenance, statut des liens), écarts et « À faire » |
| [propositions.md](propositions.md) | Propositions produit à discuter (contexte, comparaison, « pourquoi », debatron) |
| [debatron/PLAN.md](../debatron/PLAN.md) | Plan du debatron (débats simulés ou réels autour des textes), en pause |

## Données (opendata)

| Document | Contenu |
|---|---|
| [modele.md](../opendata/docs/modele.md) | Modèle canonique et commandes de la chaîne (`python -m src migrer`, `canon`, `projeter`, `controles`…) : schémas, identités, correspondances |
| [uml.md](../opendata/docs/uml.md) | Diagrammes : d'où vient chaque donnée affichée, du fichier source à la colonne |
| [rapprochements.md](../opendata/docs/rapprochements.md) | Comment les données sont reliées, ce qui n'est jamais automatique, revue humaine |
| [modifications.md](../opendata/docs/modifications.md) | Ce qui a changé article par article, amendement à l'origine |
| [indicateurs.md](../opendata/docs/indicateurs.md) | Projections `lecture` : barre de parcours, indicateurs, ce que la donnée ne dit pas |
| [TODO.md](../opendata/TODO.md) | Reste à faire côté données (intégrité, sources manquantes, corrections) |

### Sources

Chaque fiche donne l'URL, la licence, le format, les identifiants et des **exemples réels** reliés
au code qui les lit (liens vérifiés par `opendata/tests/test_docs.py`).

| Document | Source |
|---|---|
| [sources/README.md](../opendata/docs/sources/README.md) | Synthèse de l'inventaire |
| [an.md](../opendata/docs/sources/an.md) | Assemblée nationale (AMO, dossiers, amendements, scrutins, comptes rendus, agenda, questions) |
| [senat.md](../opendata/docs/sources/senat.md) | Sénat (DOSLEG, AMELI, sénateurs, scrutins, comptes rendus, textes) |
| [legifrance.md](../opendata/docs/sources/legifrance.md) | Légifrance, JO, Conseil constitutionnel |
| [hatvp.md](../opendata/docs/sources/hatvp.md) | HATVP (déclarations, représentants d'intérêts) |
| [rne.md](../opendata/docs/sources/rne.md) | Répertoire national des élus |
| [insee.md](../opendata/docs/sources/insee.md) | INSEE |

### Revue humaine

[revue/rapport.md](../opendata/docs/revue/rapport.md) : rapport du dernier chargement, cas à
trancher par type, avec un CSV par type dans [opendata/docs/revue/](../opendata/docs/revue/).

## Pour les agents de code

| Document | Contenu |
|---|---|
| [augure/AGENTS.md](../augure/AGENTS.md) | Consignes Expo / React Native pour les agents |
