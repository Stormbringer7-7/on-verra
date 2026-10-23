# opendata

Qui a voté quoi sur chaque loi à l'Assemblée nationale, à partir de l'open data officiel
(data.assemblee-nationale.fr). Python 3.10+, bibliothèque standard uniquement.

```bash
python3 -m src importer            # 14e à 17e législatures -> data/on_verra.db (~1 min)
python3 -m src importer --legislatures 17   # une seule législature
python3 -m src importer --forcer   # re-télécharge (les fichiers AN sont mis à jour chaque jour)
python3 -m src lois "narcotrafic"  # lois, niveau d'importance et votes finaux
python3 -m src lois --niveau majeure --legislature 17 --tri saillance -n 10
python3 -m src 49-3 --legislature 16          # textes passés par 49.3 et motions de censure
python3 -m src censure 519                    # qui a voté une motion de censure
python3 -m src scrutin 1330        # pour / contre / abstention / non-votants par groupe
python3 -m src scrutin 104 --legislature 15
python3 -m src scrutin 1330 --tous # + liste des députés sans vote enregistré
python3 -m src depute "Martinez"    # indicateurs + votes finaux d'un député (≠ groupe = dissidence)
python3 -m src indicateurs                       # participation la plus haute, 17e législature
python3 -m src indicateurs --croissant           # la plus basse
python3 -m src indicateurs --tri dissidence --dissidence-min 20
python3 -m src indicateurs --legislature 15 --groupe LAREM --tri dissidence
```

## Architecture : compilation de la base (ETL)

```
src/
  etl/               socle générique, sans connaissance des sources
    sources.py         Fichier : téléchargement et cache des fichiers bruts (data/brut)
    chargeur.py        Ligne(table, {colonne: valeur}) et Chargeur : INSERT par noms de colonnes, vérifiés
    pipeline.py        Etape, Contexte, ordonner(), construire()
  schema/            schéma SQL découpé par domaine, exécuté dans l'ordre des noms (10_…, 90_vues.sql)
  adaptateurs/an/    Assemblée nationale : un module par flux (acteurs, dossiers, scrutins, lois)
  transformations/   calculs communs à toutes les sources (classement des lois, indicateurs)
  compilation.py     assemble le pipeline : SOURCES + TRANSFORMATIONS
  partition.py       découpe la base complète en une base par législature
  publication.py     une publication par législature : versions, correctifs, manifeste, index.json
```

```bash
python3 -m src etapes               # étapes du pipeline dans l'ordre d'exécution
python3 -m unittest discover tests       # socle ETL et empreinte du schéma publié
```

Déroulement de `importer` : toutes les sources sont téléchargées d'abord, puis les étapes
s'exécutent dans l'ordre de leurs dépendances (`apres`), dans une seule transaction, sur une base
temporaire qui ne remplace `data/on_verra.db` qu'une fois complète. Les étapes échangent leurs
résultats intermédiaires par `ctx.artefacts` (ex. `an.dossiers` -> index des dossiers par législature).

**Ajouter une source** (ex. Sénat, HATVP) : créer `adaptateurs/<source>/`, un module par flux,
chacun avec une fonction `lignes(chemin) -> Iterator[Ligne]` (pure, testable sans base) et son
`ETAPE = Etape("<source>.<flux>", executer, sources=..., apres=...)` ; exposer `ETAPES` dans le
`__init__.py` et l'ajouter à `SOURCES` dans `compilation.py`. Les identifiants partagés (députés :
`acteur_ref` de l'AN) sont la clé de jointure entre sources.

**Ajouter une donnée** : nouvelle table dans un fichier de `schema/` (ou nouveau fichier `NN_domaine.sql`),
puis une étape qui écrit des `Ligne` vers cette table. Une donnée calculée à partir des tables
chargées va dans `transformations/` et dans `TRANSFORMATIONS`.

**Modifier le schéma** : toute modification change son empreinte ; la publication suivante
n'aura pas de correctif et les applications retéléchargeront la base complète. Le test
`test_empreinte_inchangee` échoue tant que `EMPREINTE_PUBLIEE` n'a pas été mise à jour : c'est voulu.
Préférer l'ajout de tables à la modification de tables existantes, que les applications lisent.

## Classement des lois

Chaque loi reçoit un niveau (`lois.niveau`) et les critères qui l'ont fixé (`lois.raisons`) :

- **majeure** : loi de finances, de financement de la sécurité sociale ou constitutionnelle,
  vote solennel, saisine du Conseil constitutionnel par des élus ou l'exécutif (la saisine
  automatique des lois organiques ne compte pas), ou recours au 49.3 ;
- **technique** : ratification de traité, ou aucun vote contre avec moins de 100 votants ;
- **standard** : le reste.

La **saillance** (0 à 100, `transformations/classement.py`) trie à l'intérieur d'un niveau : participation au
vote final le plus suivi (40 %), nombre de scrutins sur le texte en échelle log (40 %), clivage
pour/contre (20 %). Une loi sans vote final n'a que la composante débat.

## 49.3 et motions de censure

Un texte adopté par 49.3 n'a pas de vote final : il est repéré dans son dossier (acte
`*-DGVT`), avec l'étape (1re lecture, CMP, nouvelle lecture, lecture définitive) et l'issue
(table `engagements_49_3`). Les motions de censure (`motions_censure`, `votes_censure`) ne
publient que les votes **pour**. En 17e, les dossiers relient chaque motion à son engagement ;
en 14e, 15e et 16e, le rattachement se fait par la date (engagements des 7 jours précédents) et
reste vide quand deux textes sont possibles.

## Indicateurs

Calculés à la compilation par député et par législature (table `indicateurs_deputes`), sur
**tous les scrutins publics** où le député était en fonction (votes finaux, articles,
amendements, motions de procédure ; hors motions de censure, où seuls les « pour » sont publiés) :

- **participation** = votes exprimés (pour, contre, abstention) / scrutins en fonction, hors
  non-votes statutaires (président de l'AN, président de séance, membre du gouvernement) ;
- **délégation** = part des votes exprimés faits par procuration ;
- **dissidence** = votes exprimés différents de la ligne du groupe / votes exprimés en groupe.
  La ligne est la position la plus fréquente du groupe sur ce scrutin, calculée à partir des
  décomptes (le champ officiel `positionMajoritaire` est faux sur 58 scrutins de la 17e).
  Non-inscrits et égalités exclus. Le groupe pris en compte est celui du député au moment du vote.

## Publication pour les applications

La publication est **découpée par législature** (`partition.py`) : même schéma dans chaque base,
avec seulement les lignes de sa législature. Les applications ne téléchargent que les législatures
consultées, et une mise à jour ne republie que celle qui a changé (en pratique, la législature en
cours). `mettre-a-jour` retélécharge les données de l'AN, reconstruit la base complète et publie
une nouvelle version d'une législature **seulement si un scrutin, une motion de censure ou un 49.3
y est apparu** :

```bash
python3 -m src mettre-a-jour                  # à lancer chaque jour (cron, CI)
python3 -m src publier --forcer               # publie même sans nouveau scrutin
python3 -m src publier --legislatures 17      # une seule législature
```

| fichier | rôle |
|---|---|
| `index.json` | législatures publiées : période, nombre de scrutins, version, manifeste, taille |
| `<leg>/manifest.json` | version, empreinte du schéma, base complète et correctifs (taille, SHA-256), nouveautés |
| `<leg>/on_verra-<v>.db.gz` | base de la législature avec sa table `meta` (version, date, schéma) |
| `<leg>/maj-<v-1>-<v>.sql.gz` | correctif SQL incrémental, exécuté dans une transaction |
| `<leg>/courante.db` | dernière base publiée, référence du prochain correctif (à ne pas héberger) |

Côté application : lire `index.json`, puis pour chaque législature voulue son manifeste ; si la
version est plus récente, appliquer dans l'ordre les
correctifs depuis sa version (chaque correctif vérifie la version de départ et échoue sinon,
sans rien modifier) ; si un correctif manque ou si le schéma a changé, télécharger la base complète.
Toujours vérifier le SHA-256 avant d'utiliser un fichier.

### En service (Docker)

Deux images : **`Dockerfile`** (Python, bibliothèque standard) extrait — `mettre-a-jour` en boucle,
toutes les `INTERVALLE_MAJ` secondes (1 jour par défaut), vers le volume `/srv/publication`, avec
`/app/data` pour le cache de l'open data et les bases compilées (privé) ; un échec laisse la
publication précédente en place. **`Dockerfile.nginx`** publie — sert `/srv/publication` en
statique (CORS ouvert, manifestes revalidés, `courante.db` jamais servie).

```bash
docker build -t opendata-extraction . && docker build -t opendata-publication -f Dockerfile.nginx .
docker run -d -v opendata-cache:/app/data -v opendata-publication:/srv/publication opendata-extraction
docker run -d -p 8081:80 -v opendata-publication:/srv/publication:ro opendata-publication
```

Dans big-brother, le `docker-compose.yml` racine assemble ces deux services et l'app web.

## Périmètre

**Tous les scrutins publics** sont importés, avec leur nature (`scrutins.nature`) :

- `ensemble` / `article_unique` : vote final sur un texte de loi, un par lecture (première lecture,
  CMP, lecture définitive…) ; vue `scrutins_finaux`, seule utilisée par le classement des lois ;
- `article`, `amendement` (et sous-amendement), `motion` (rejet préalable, renvoi en commission…) ;
- `autre` : première partie d'un budget, résolution, déclaration du gouvernement…

Un scrutin est rattaché à son texte (`loi_id`) quand son dossier législatif est retrouvé, sinon
`loi_id` est vide. Législatures : 14e (2012-2017), 15e (2017-2022), 16e (2022-2024) et 17e (depuis 2024).
Le contenu des amendements (dispositif, exposé sommaire) n'est pas importé : seul l'intitulé du scrutin
l'est (« l'amendement n° 15 de M. X à l'article premier… »).

**La 14e est partielle** : l'AN a figé son archive au 24 novembre 2016 (scrutin n°1354) ; les votes
de décembre 2016 à juin 2017 n'existent pas en open data. Son archive est un export unique au lieu
d'un fichier par objet, avec quelques clés au singulier (`pour`, `contre`, `abstention`) : l'adaptateur
AN lit les deux formats (`adaptateurs/an/commun.py`, `objets()`). Elle ne publie ni la délégation
(`par_delegation` vaut toujours 0) ni le siège au moment du vote, et ses groupes n'ont pas de couleur
officielle : celle du groupe de la même famille dans une législature suivante est reprise
(`COULEURS_EMPRUNTEES`). Les législatures antérieures (13e et avant) ne sont pas en open data.

## Tables

| table | contenu |
|---|---|
| `lois` | un dossier législatif (ou, à défaut, un titre de texte), parcours, niveau, saillance |
| `scrutins` | tous les scrutins publics : nature, date, lecture, résultat, décomptes, texte visé |
| vue `scrutins_finaux` | votes finaux sur un texte de loi (`nature` = ensemble ou article unique) |
| `votes` | position de chaque député, son groupe au moment du vote, vote par délégation |
| `deputes`, `mandats`, `groupes`, `appartenances` | référentiel des députés, sièges, couleurs et groupes par période |
| `positions_groupes` | ligne de chaque groupe sur chaque scrutin, décomptes du groupe |
| `indicateurs_deputes` | participation, délégations, dissidences par député et législature (calculés à la compilation) |
| `engagements_49_3` | recours au 49.3 : texte, étape, date, issue |
| `motions_censure`, `votes_censure` | motions (49.2 et 49.3), texte visé, votes pour |
| `mises_au_point` | rectifications déclarées après coup (n'altèrent pas le résultat) |
| vue `sans_vote` | députés en fonction ce jour-là mais absents de la liste des votants |
| vue `votes_detail` | votes avec noms, groupes et titre de la loi |

## Limites des données

- **La présence n'est pas publiée.** « Sans vote » = absent *ou* présent sans voter.
- `par_delegation = 1` : vote par procuration, le député n'était pas en séance. Non publié en 14e :
  le taux de délégation de cette législature n'a pas de sens.
- Les votes à main levée ne sont pas nominatifs et n'apparaissent pas.
- Le rattachement scrutin → loi passe par les références des dossiers, puis par le titre ;
  42 lois sur 596 restent rattachées à leur seul titre (id `titre:<législature>:…`).
- 4 scrutins ont des listes nominatives incomplètes à la source (48 votes manquants au total,
  dont 46 sur le scrutin VTANR5L15V2816).
