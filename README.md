# on_verra

Qui a voté quoi sur chaque loi à l'Assemblée nationale, à partir de l'open data officiel
(data.assemblee-nationale.fr). Python 3.10+, bibliothèque standard uniquement.

```bash
python3 -m on_verra importer            # 15e, 16e et 17e législatures -> data/on_verra.db (~1 min)
python3 -m on_verra importer --legislatures 17   # une seule législature
python3 -m on_verra importer --forcer   # re-télécharge (les fichiers AN sont mis à jour chaque jour)
python3 -m on_verra lois "narcotrafic"  # lois, niveau d'importance et scrutins finaux
python3 -m on_verra lois --niveau majeure --legislature 17 --tri saillance -n 10
python3 -m on_verra 49-3 --legislature 16          # textes passés par 49.3 et motions de censure
python3 -m on_verra censure 519                    # qui a voté une motion de censure
python3 -m on_verra scrutin 1330        # pour / contre / abstention / non-votants par groupe
python3 -m on_verra scrutin 104 --legislature 15
python3 -m on_verra scrutin 1330 --tous # + liste des députés sans vote enregistré
python3 -m on_verra depute "Martinez"    # indicateurs + votes finaux d'un député (≠ groupe = dissidence)
python3 -m on_verra indicateurs                       # participation la plus haute, 17e législature
python3 -m on_verra indicateurs --croissant           # la plus basse
python3 -m on_verra indicateurs --tri dissidence --dissidence-min 20
python3 -m on_verra indicateurs --legislature 15 --groupe LAREM --tri dissidence
```

## Classement des lois

Chaque loi reçoit un niveau (`lois.niveau`) et les critères qui l'ont fixé (`lois.raisons`) :

- **majeure** : loi de finances, de financement de la sécurité sociale ou constitutionnelle,
  vote solennel, saisine du Conseil constitutionnel par des élus ou l'exécutif (la saisine
  automatique des lois organiques ne compte pas), ou recours au 49.3 ;
- **technique** : ratification de traité, ou aucun vote contre avec moins de 100 votants ;
- **standard** : le reste.

La **saillance** (0 à 100, `classement.py`) trie à l'intérieur d'un niveau : participation au
vote final le plus suivi (40 %), nombre de scrutins sur le texte en échelle log (40 %), clivage
pour/contre (20 %). Une loi sans vote final n'a que la composante débat.

## 49.3 et motions de censure

Un texte adopté par 49.3 n'a pas de vote final : il est repéré dans son dossier (acte
`*-DGVT`), avec l'étape (1re lecture, CMP, nouvelle lecture, lecture définitive) et l'issue
(table `engagements_49_3`). Les motions de censure (`motions_censure`, `votes_censure`) ne
publient que les votes **pour**. En 17e, les dossiers relient chaque motion à son engagement ;
en 15e et 16e, le rattachement se fait par la date (engagements des 7 jours précédents) et
reste vide quand deux textes sont possibles.

## Indicateurs

Calculés par député et par législature (vue `indicateurs_deputes`), sur les scrutins finaux
où le député était en fonction :

- **participation** = votes exprimés (pour, contre, abstention) / scrutins en fonction, hors
  non-votes statutaires (président de l'AN, président de séance, membre du gouvernement) ;
- **délégation** = part des votes exprimés faits par procuration ;
- **dissidence** = votes exprimés différents de la ligne du groupe / votes exprimés en groupe.
  La ligne est la position la plus fréquente du groupe sur ce scrutin, calculée à partir des
  décomptes (le champ officiel `positionMajoritaire` est faux sur 58 scrutins de la 17e).
  Non-inscrits et égalités exclus. Le groupe pris en compte est celui du député au moment du vote.

## Interface web

```bash
python3 -m on_verra serveur              # http://127.0.0.1:8000 (--port, --hote)
python3 -m on_verra hemicycle            # re-télécharge le plan des sièges (web/hemicycle.json)
```

Pour chaque loi et chaque vote (final ou motion de censure), l'hémicycle affiche chaque député à
son siège : couleur officielle du groupe et pastille du vote (mode Groupes), ou couleur du vote
(mode Votes). Survol ou tap : nom, groupe, vote, délégation. Zoom (boutons, double-clic,
Ctrl + molette ; sur mobile, pincement et double-tap) : les noms apparaissent sur les sièges. Recherche d'un député : zoom sur son siège.

Sièges réels en 17e (numéro publié avec chaque vote) ; reconstitués en 15e et 16e, où l'AN ne
publie pas la place de la plupart des députés : chaque groupe y occupe un secteur, dans l'ordre
gauche-droite observé (`placement.py`). Le serveur écoute en local et ouvre la base en lecture seule.

## Publication pour l'application mobile

L'application embarque la base. `mettre-a-jour` retélécharge les données de l'AN, reconstruit la
base et publie une nouvelle version dans `publication/` **seulement si un vote final, une motion
de censure ou un 49.3 est apparu** (une version par loi) :

```bash
python3 -m on_verra mettre-a-jour       # à lancer chaque jour (cron, CI)
python3 -m on_verra publier --forcer    # publie même sans nouveau vote
```

| fichier | rôle |
|---|---|
| `manifest.json` | version, empreinte du schéma, base complète et correctifs (taille, SHA-256), nouveautés |
| `on_verra-<v>.db.gz` | base complète avec sa table `meta` (version, date, schéma) |
| `maj-<v-1>-<v>.sql.gz` | correctif SQL incrémental, exécuté dans une transaction |
| `courante.db` | dernière base publiée, référence du prochain correctif (à ne pas héberger) |

Côté application : lire le manifeste ; si la version est plus récente, appliquer dans l'ordre les
correctifs depuis sa version (chaque correctif vérifie la version de départ et échoue sinon,
sans rien modifier) ; si un correctif manque ou si le schéma a changé, télécharger la base complète.
Toujours vérifier le SHA-256 avant d'utiliser un fichier.

## Application Android

Dossier `android/` : Kotlin + Jetpack Compose, base embarquée (hors connexion), mêmes données et
même placement des sièges que le serveur Python (vérifié par test, siège par siège).

```bash
python3 -m on_verra publier              # l'APK embarque la dernière base de publication/
cd android
./gradlew assembleDebug                  # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest              # tests JVM, comparés au Python sur data/on_verra.db
./gradlew connectedDebugAndroidTest      # tests de gestes sur émulateur ou téléphone branché
```

Installation sur un téléphone sans débogage USB : le brancher en « Transfert de fichiers », copier
l'APK dans son dossier Download (`gio copy app-debug.apk "mtp://<téléphone>/…/Download/on_verra.apk"`),
puis l'ouvrir depuis le gestionnaire de fichiers. Testé sur un OPPO CPH2211 (ColorOS).

Le JDK est téléchargé automatiquement par Gradle (toolchain 17). Mises à jour en ligne :
renseigner `onverra.publication.url` (HTTPS) dans `android/gradle.properties` ; vide, l'application
utilise sa base embarquée.

## Périmètre

Seuls les **scrutins publics sur l'ensemble d'un texte de loi** (ou sur son article unique)
sont importés : un par lecture (première lecture, CMP, lecture définitive…), pour les
15e (2017-2022), 16e (2022-2024) et 17e (depuis 2024) législatures. La 14e n'est publiée
que partiellement (jusqu'à novembre 2016) et dans un autre format : non importée.

## Tables

| table | contenu |
|---|---|
| `lois` | un dossier législatif (ou, à défaut, un titre de texte), parcours, niveau, saillance |
| `scrutins` | vote final : date, lecture, résultat, décomptes |
| `votes` | position de chaque député, son groupe au moment du vote, vote par délégation |
| `deputes`, `mandats`, `groupes`, `appartenances` | référentiel des députés, sièges, couleurs et groupes par période |
| `positions_groupes` | ligne de chaque groupe sur chaque scrutin, décomptes du groupe |
| vue `indicateurs_deputes` | participation, délégations, dissidences par député et législature |
| `engagements_49_3` | recours au 49.3 : texte, étape, date, issue |
| `motions_censure`, `votes_censure` | motions (49.2 et 49.3), texte visé, votes pour |
| `mises_au_point` | rectifications déclarées après coup (n'altèrent pas le résultat) |
| vue `sans_vote` | députés en fonction ce jour-là mais absents de la liste des votants |
| vue `votes_detail` | votes avec noms, groupes et titre de la loi |

## Limites des données

- **La présence n'est pas publiée.** « Sans vote » = absent *ou* présent sans voter.
- `par_delegation = 1` : vote par procuration, le député n'était pas en séance.
- Les votes à main levée ne sont pas nominatifs et n'apparaissent pas.
- Le rattachement scrutin → loi passe par les références des dossiers, puis par le titre ;
  42 lois sur 596 restent rattachées à leur seul titre (id `titre:<législature>:…`).
- 4 scrutins ont des listes nominatives incomplètes à la source (48 votes manquants au total,
  dont 46 sur le scrutin VTANR5L15V2816).
