# Ce qui a changé, article par article

Pour chaque article suivi (`canon.article_suivi`, identité
`CIVICTRACE:article_suivi:<dossier>#<numéro>`), entre deux versions successives de la navette,
l'étape `textes.modifications` écrit une ligne `canon.modification_article` :

| Colonne | Contenu |
|---|---|
| `version_article_id`, `version_precedente_id` | la version et celle à laquelle elle est comparée (vide : article inséré) |
| `diff` (JSONB) | diff **mot à mot** : `{"format": "mots", "operations": [["=", …], ["-", …], ["+", …]], "mots_supprimes", "mots_ajoutes", "nouveau", "motif"}` ; les « = » et « + » recomposent la nouvelle version |
| `origine` | `amendement`, `compromis_cmp` ou `inconnue` |
| `amendement_id`, `statut` | l'amendement, **seulement** si `VERIFIED` ; sinon vide et `NEEDS_REVIEW` avec un cas de revue |

Un article inchangé (typographie comprise), le premier texte d'un dossier, un article
« (Conforme) » ou « (Non modifié) » : aucune ligne. Tout est calculé depuis les **sources
brutes** en cache, comme les autres étapes : les textes relus avec les lecteurs de `an.textes` et
`senat.textes` (mêmes identités de versions), les amendements depuis leurs fichiers bruts. Rien
n'est lu dans `canon`.

Code : [`src/diffs.py`](../src/diffs.py) (diff, désignation, attribution : fonctions pures),
[`src/adaptateurs/sources/modifications.py`](../src/adaptateurs/sources/modifications.py)
(navette, amendements bruts, écriture). Relire en base :
`python -m src canon --relire --etapes textes.modifications`.

## 1. L'ordre des versions : la navette

On ne compare que deux versions dont l'ordre est **publié**, jamais deviné :

- **Dossier suivi par le Sénat** (clé `SENAT:dossier:<signet>`) : la navette DOSLEG. Lecture
  (`typlec.typlecord` : 1re, 2e lecture… puis CMP 100, nouvelle lecture 200, lecture définitive
  300), assemblée dans la lecture (`lecass.ordreass`), place du texte dans l'assemblée
  (`oritxt.oriordre` : 0 déposé ou transmis, puis 2 commission, puis 1 séance). Les textes de l'AN y
  sont cités par leur URL (`…/textes/l17b2632_projet-loi`, `l17t0295`, et `l17b2765` d'origine 30
  « de la commission (AN) ») : lettre et numéro donnent l'uid AN du même dossier (`B2632`,
  `BTA0295`, `BTC2765`).
- **Dossier de l'AN seul** : déposé, commission, adopté — s'il n'y a qu'un texte de chaque nature.

Une version n'est **pas comparée** (cas `navette_incertaine`, une fois par version) quand :

| Situation | Exemple réel | Volume (cache du 24/10/2026) |
|---|---|---|
| texte **adopté définitivement** : il est renuméroté (1, 2, 3… sans « bis ») | `tas25-166` (pjl25-689) : 61 articles numérotés 1 à 60 ; `PIONANR5L17BTA0332` (19 articles, la navette en avait 21 dont « 19 bis ») | 180 |
| un texte de la navette entre les deux n'est pas chargé | `l17b3059` (ppl24-661, lecture définitive) : pas d'HTML AN | 176 |
| la version n'est pas dans la navette DOSLEG | `PRJLANR5L17B3017`, `PRJLANR5L17BTC3067` (impressions AN du texte du Sénat et du texte de CMP) | 73 |
| un texte **rejeté** (ou sans texte adopté) entre les deux | `tas25-043` « rejeté par le Sénat », `ppl25-681` « résultat des travaux » d'une CMP en désaccord | 67 |
| deux textes à la même place sans dates distinctes, des dates contraires à l'ordre, deux lectures du même type | | 13 |

En remontant la navette, un article « (Conforme) » sans texte est explicitement inchangé : on
compare au texte d'avant. Un article absent d'une version intermédiaire (navette restreinte) : on
compare aussi au texte d'avant, mais l'attribution reste `NEEDS_REVIEW`.

Code : [navettes_dosleg()](../src/adaptateurs/sources/modifications.py#L134),
[ordonner()](../src/adaptateurs/sources/modifications.py#L112), [an_uid()](../src/adaptateurs/sources/modifications.py#L125),
[precedent()](../src/adaptateurs/sources/modifications.py#L270) ·
Tests : [test_ordre_dosleg_exemple_reel](../tests/test_modifications.py#L94),
[test_meme_place_sans_dates_distinctes_incertain](../tests/test_modifications.py#L115),
[test_remonte_conforme_et_s_arrete_sur_l_incertain](../tests/test_modifications.py#L129)

## 2. Le diff mot à mot

Deux niveaux (`difflib`) : les alinéas d'abord, puis mot à mot dans chaque bloc d'alinéas
remplacé (un bloc de plus de 250 000 paires de mots est donné supprimé puis ajouté). Ne sont **pas**
des changements : espaces insécables, apostrophes et tirets typographiques, accents décomposés,
« œ », et les mentions éditoriales de la navette (« (nouveau) », « (Supprimé) », « (Non
modifié) »…). Un article supprimé se compare comme un texte vide.

Texte du Sénat : un `alinea` Akoma Ntoso contient ses sous-alinéas (« 1° » puis « a) », « b) »)
et publie son propre `content` *après* eux. Le diff lit les seuls `content`, le parent avant ses
enfants ([corps_akn()](../src/adaptateurs/sources/modifications.py#L375)) — le corps stocké par
`senat.textes` répète le texte des enfants (cf. limites).

Code : [diff_mots()](../src/diffs.py#L83), [jetons()](../src/diffs.py#L40) ·
Tests : [test_diff_mot_a_mot_exemple_reel](../tests/test_diffs.py#L31),
[test_typographie_et_mentions_ne_sont_pas_des_changements](../tests/test_diffs.py#L39),
[test_corps_akn_sans_doublon_dans_l_ordre](../tests/test_modifications.py#L121)

## 3. L'amendement à l'origine

**Amendements de l'étape qui produit la version** (références explicites) :

| Version produite | Amendements retenus |
|---|---|
| Sénat, commission ou séance | `txt_ameli` du dossier (`doslegsignet`) dont `numado` (texte issu de l'examen) est le numéro de la version ; un examen sans texte issu (`numado` = `num`) est ignoré |
| AN, texte de la commission (`BTC`) | amendements dont `texteLegislatifRef` est la version précédente, examinés par la commission **saisie au fond** : organe de l'uid = `organeRef` de l'acte `DepotRapport` qui cite ce texte adopté (les amendements adoptés en commission saisie pour avis n'entrent pas dans le texte) |
| AN, texte adopté (`BTA`) | amendements de séance (organe des actes `…-DEBATS`) sur la version précédente, ou sur l'impression AN du texte de CMP (`CMP-COM-RAPPORT-AN`) |
| déposé, transmis | aucun (aucune étape d'amendement) |

**Article visé**, lu dans la désignation brute : AN `pointeurFragmentTexte/division/titre`
(« Article 3 bis », « Article PREMIER ») et `avant_A_Apres` (« A », « Après », « Avant ») ; Sénat
`sub.lib` (« Article 4 (précédemment examiné) », « Article additionnel après l'article 2 ») et
`amd.subpos` (0 sur l'article, 20 après, -10 avant ; 10 et -20 insèrent une division). Un article
inséré (« 9 bis ») a pour candidats les articles additionnels « après » ou « avant » un article de
même racine (« 9 »), simple indice.

**Règle d'attribution** (« pas fiable = revue ») :

| Situation | Origine, statut | Cas |
|---|---|---|
| version = texte de la CMP (lecture CMP de DOSLEG, texte « de la commission » adopté) | `compromis_cmp`, `VERIFIED` | — |
| **un seul** amendement adopté vise l'article, et son dispositif se retrouve dans le changement (ci-dessous) | `amendement`, `VERIFIED`, `amendement_id` renseigné | — |
| un seul candidat, dispositif non retrouvé ou changement pas entièrement expliqué ; « adopté avec modification » (AMELI) | `amendement`, `NEEDS_REVIEW` | `modification_a_attribuer` (le candidat, sa preuve lue ou non) |
| plusieurs amendements adoptés visent l'article | `amendement`, `NEEDS_REVIEW` | `modification_a_attribuer` (tous les candidats) |
| aucun amendement adopté ne le vise, ou pas d'étape d'amendement connue | `inconnue`, `NEEDS_REVIEW` | `modification_sans_amendement` |

**Dispositif retrouvé** : un passage du dispositif d'au moins 3 mots — entre guillemets, ou un
alinéa entier (un article additionnel ou « Rédiger ainsi cet article : » donne le texte sans
guillemets) — est dans la nouvelle version et pas dans la précédente, **et** chaque mot ajouté par
le diff figure dans le dispositif ; un passage cité comme texte existant (« substituer aux mots :
« … » », « après le mot : « … » ») doit être dans la version précédente. Une suppression : « Supprimer
cet article. » et l'article est supprimé, ou « Supprimer les mots : « … » », le passage était là et
n'y est plus, rien d'ajouté. Un mot, une ressemblance de texte ne suffisent jamais seuls : la preuve
ne vaut que pour l'**unique** amendement adopté de l'étape visant cet article.

Code : [attribuer()](../src/diffs.py#L275), [preuve()](../src/diffs.py#L220), [vise()](../src/diffs.py#L130),
[amendements_an()](../src/adaptateurs/sources/modifications.py#L214), [amendements_senat()](../src/adaptateurs/sources/modifications.py#L229) ·
Tests : [test_seul_amendement_adopte_dispositif_retrouve](../tests/test_diffs.py#L110),
[test_plusieurs_candidats_en_revue](../tests/test_diffs.py#L114),
[test_changement_non_explique_en_revue](../tests/test_diffs.py#L119),
[test_preuves](../tests/test_diffs.py#L87), [test_vise_senat](../tests/test_diffs.py#L66)

## 4. Exemple réel : article 13 de la proposition de loi sur l'aide à mourir

Dossier `DLR5L17N51670` (suivi `SENAT:dossier:ppl24-661`), de `PIONANR5L17B1100` (déposé) à
`PIONANR5L17BTC1364` (texte de la commission des affaires sociales, `PO420120`).

Brut, version précédente (`data/brut/an/textes/PIONANR5L17B1100.html`, condensé) :

```html
<p class="assnat9ArticleNum">Article 13</p>
<p class="assnatLoiTexte">[pastille]«&#xa0;<span style="font-style:italic">Art.</span>…<span style="font-style:italic">11.</span>&#xa0;–&#xa0;Un décret en Conseil d’État précise&#xa0;les conditions d’application du présent chapitre, notamment&#xa0;: </p>
```

Brut, nouvelle version (`PIONANR5L17BTC1364.html`) :

```html
<p class="assnatLoiTexte">[pastille]<span style="letter-spacing:-0.1pt">«</span>…<span style="letter-spacing:-0.1pt">Un décret en Conseil d’État précise les conditions</span> d’application de la présente sous-section, notamment&#xa0;: </p>
```

Brut, amendement (`amendements.json.zip`, `json/DLR5L17N51670/PIONANR5L17B1100/AMANR5L17PO420120B1100P0D1N001162.json`) :

```json
{"uid": "AMANR5L17PO420120B1100P0D1N001162", "texteLegislatifRef": "PIONANR5L17B1100",
 "pointeurFragmentTexte": {"division": {"titre": "Article 13", "articleDesignation": "ARTICLE 13", "avant_A_Apres": "A"}},
 "cycleDeVie": {"sort": "Adopté"},
 "corps": {"contenuAuteur": {"dispositif": "<p …>&#x00C0; l&#x2019;alin&#x00E9;a&nbsp;2, substituer aux mots&nbsp;:</p><p …>&#x00AB;&nbsp;du pr&#x00E9;sent chapitre&nbsp;&#x00BB;</p><p …>les mots&nbsp;:</p><p …>&#x00AB;&nbsp;de la pr&#x00E9;sente sous-section&nbsp;&#x00BB;.</p>"}}}
```

L'organe de l'uid (`PO420120`) est celui de l'acte `AN1-COM-FOND-RAPPORT` qui cite
`PIONANR5L17BTC1364` ; c'est le seul amendement adopté sur l'article 13 à cette étape ; « de la
présente sous-section » est dans la nouvelle version et pas dans l'ancienne, « du présent
chapitre » était dans l'ancienne, et les 4 mots ajoutés sont dans le dispositif. « précise&#xa0;les »
/ « précise les » n'est pas un changement. Canon :

```json
{"version_article_id": "AN:article:PIONANR5L17BTC1364#13", "version_precedente_id": "AN:article:PIONANR5L17B1100#13",
 "origine": "amendement", "amendement_id": "AN:amendement:AMANR5L17PO420120B1100P0D1N001162", "statut": "VERIFIED",
 "diff": {"format": "mots", "operations": [
   ["=", "La sous‑section 3 de la section 2 bis … Un décret en Conseil d’État précise les conditions d’application "],
   ["-", "du présent chapitre"], ["+", "de la présente sous-section"],
   ["=", ", notamment :\n« 1° Les modalités d’information … »"]],
  "mots_supprimes": 3, "mots_ajoutes": 4, "nouveau": false, "motif": "seul amendement adopté, dispositif retrouvé"}}
```

(Identités natives montrées à la place des UUID.) Contre-exemple réel, en revue : article 3 de
`PRJLANR5L17BTC2765` (pjl25-689) — un seul amendement adopté (CE1065, `AMANR5L17PO419610B2632P0D1N001065`,
« substituer aux mots : « édictées dans le cadre de l'habilitation prévue aux points » les mots :
« prises en application des » »), mais l'article change aussi ailleurs (« de douze mois » → « d'un
an », « publication » → « promulgation ») : `NEEDS_REVIEW`, cas `modification_a_attribuer` avec
CE1065 pour candidat.

Tests : [test_diff_mot_a_mot_exemple_reel](../tests/test_diffs.py#L31),
[test_lignes_et_cas](../tests/test_modifications.py#L157), [test_ecrit_saute_puis_classe_les_caducs](../tests/test_modifications.py#L210),
[test_ligne_ecrite](../tests/test_modifications.py#L235)

## 5. Volumes mesurés (cache du 24/10/2026, sans écriture en base)

1 089 dossiers suivis, 26 101 versions d'articles, 9 137 modifications :

| | `VERIFIED` amendement | `VERIFIED` CMP | `NEEDS_REVIEW` amendement | `NEEDS_REVIEW` inconnue | versions non comparées |
|---|---|---|---|---|---|
| pjl25-689 (`DLR5L17N54085`, souveraineté agricole) | 18 | 58 | 167 | 70 | 3 |
| ppl24-661 (`DLR5L17N51670`, aide à mourir) | 9 | 0 | 88 | 8 | 6 |
| tous les dossiers | 434 | 1 129 | 4 378 | 3 196 | 509 |

Pourquoi `NEEDS_REVIEW` : plusieurs amendements adoptés sur l'article (2 715), dispositif non
retrouvé ou changement pas entièrement expliqué (1 659), absence intermédiaire (4), aucun
amendement adopté ne le vise (2 159 : par exemple écarts d'édition entre impressions AN et Sénat,
texte adopté sans amendement adopté publié — `PRJLANR5L17BTA0049`, PLFSS 2025 —, amendements absents de
l'archive — aucun pour `PIONANR5L17B2515`), pas d'étape d'amendement connue (1 037).
Détail par version pour pjl25-689 : commission AN 5 / 32 / 8 (VERIFIED / à attribuer / inconnue),
séance AN 7 / 44 / 6, transmission au Sénat 0 / 0 / 3, commission Sénat 3 / 45 / 2, séance Sénat 3 / 45 / 19, CMP 58 `compromis_cmp`,
lecture des conclusions à l'AN 0 / 1 / 32 (comparée à l'impression Sénat du texte de CMP).

## 6. Limites

- **Décision de revue** : les cas sont des constats (avec candidats). Choisir un candidat devra
  mettre à jour la ligne `modification_article` (table de faits dépendants, sans entité) : à brancher
  dans `revue.appliquer` et dans l'étape (relecture de la décision), à faire à l'intégration.
- **Article visé** : calculé ici depuis la désignation brute (`diffs.vise`), en attendant le
  rattachement amendement → `article_suivi` des adaptateurs d'amendements : à factoriser.
- **Corps Sénat** : `senat.textes.version` stocke un corps où le texte des sous-alinéas est répété
  (et le `content` d'un parent après ses enfants). Le diff lit le texte corrigé (`corps_akn`) : il
  ne recompose donc pas exactement `version_article.texte` côté Sénat tant que `senat.textes`
  n'utilise pas la même lecture.
- **Textes définitifs renumérotés** : `an.textes` et `senat.textes` rattachent les articles d'un
  texte adopté définitivement à `article_suivi` par leur numéro, qui n'est plus celui de la navette.
  Ces suivis sont faux ; ici ces versions ne sont jamais comparées.
- Impressions parallèles d'un même texte (AN `B3017`, `BTC3067` du texte de CMP) : non placées.
