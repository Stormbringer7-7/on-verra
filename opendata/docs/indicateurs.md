# Indicateurs contextualisés (schéma `lecture`)

Construits par `python -m src projeter` depuis `canon` seul, c'est-à-dire des données 100 % fiables.
Les requêtes sont versionnées dans `src/projections/NN_*.sql`. Règle commune : **jamais un chiffre sans
« par rapport à quoi »**, sans dénominateur, ni sans ce que la donnée ne dit pas
(règles de fond du [wiki](../../docs/README.md)).

## Participation aux scrutins publics

`lecture.participation_scrutin`, `lecture.participation_groupe_scrutin`, `lecture.indicateur_participation`

| Terme | Définition |
|---|---|
| en mandat | un mandat de député ou de sénateur couvre la date du scrutin (prise de fonction, fin) ; chaque chambre fait foi pour ses mandats (député : AMO ; sénateur : Sénat), l'AMO publiant aussi des mandats de sénateur |
| groupe | le groupe de la personne **à la date du scrutin** (appartenances datées) |
| a participé | un vote nominatif est publié pour elle : pour, contre, abstention ou non-votant, délégation comprise |
| attendu | part des membres du **même groupe**, en mandat ce jour-là, qui ont participé au **même scrutin** |
| écart (points) | 100 × (taux de participation − moyenne des attendus), sur les mêmes scrutins |

Exemple : un groupe de 4. Au scrutin 1, les 4 votent. Au scrutin 2, de nuit, un seul vote. Une
députée qui a voté une fois sur deux a un taux de 50 % pour un attendu de 62,5 % (moyenne de 100 %
et 25 %), soit −12,5 points. Le seul votant de nuit est à +37,5 points.

Ce que la donnée **ne dit pas** : les déports, la présence en commission au même moment (l'heure
des scrutins n'est pas publiée), les votes à main levée (pas de liste nominative). Les mises au
point (« voulait voter pour… ») sont chargées (`canon.lien`, nature `mise_au_point` : 3 452 sur
1 664 scrutins AN) mais **n'entrent pas** dans la participation, qui ne compte que le vote
enregistré : une mise au point est ce que le député a fait savoir après coup, pas un vote (1 013
viennent de députés absents du décompte). À afficher à côté du vote, « selon la mise au point
publiée » (pas encore dans le schéma `lecture`). Un ministre ne vote pas : il n'est pas en mandat
parlementaire.

## Écarts au groupe

`lecture.vote_et_groupe`, `lecture.indicateur_ecarts`

| Terme | Définition |
|---|---|
| vote en groupe | vote exprimé (pour, contre, abstention) sur un scrutin où son groupe a une **majorité nette** |
| écart | vote en groupe différent de la position majoritaire du groupe |
| position majoritaire | recalculée depuis le décompte du groupe ; la valeur publiée par l'AN est parfois fausse ; aucune en cas d'égalité |

On affiche toujours le nombre (« 5 écarts sur 21 votes en groupe ») et la nature de l'écart
(contre, abstention, pour). Un écart n'est ni bien ni mal : c'est là que se lisent les choix
personnels.

## Présence en commission (AN)

`lecture.indicateur_commission`

Présences publiées par l'agenda pour chaque réunion : présent, excusé, absent. Par personne,
commission et année : réunions, présences, excusés, absences, taux, et **taux moyen de la même
commission la même année**, comme point de comparaison. « Excusé » n'est pas « absent ».

## Parcours d'un dossier de loi (barre de l'écran Dossier)

`lecture.parcours_gabarit`, `lecture.parcours_acte`, `lecture.parcours_dossier`,
`lecture.parcours_dossier_synthese` — requêtes : `src/projections/45_parcours_gabarit.sql`,
`src/projections/55_parcours_dossier.sql`.

Le modèle stocke les **étapes réellement publiées** (`canon.etape`, une ligne par acte AN, typée
d'après `@xsi:type` par [type_etape()](../src/adaptateurs/sources/an/dossiers.py#L48)). La barre est
une projection : un **gabarit** selon la procédure, chaque case lue dans ces étapes, la décision du
Conseil constitutionnel (`canon.decision_cc`) et la loi publiée (`canon.texte_publie`). Rien n'est
supposé : une case sans preuve reste `inconnu`, jamais `faite`. Chaque case donne sa **provenance**
(`provenance` : les `entite_id` canon qui l'établissent : étapes, décision, loi). Les entités
retirées de la source sont ignorées.

Périmètre : dossiers dont `type_procedure` commence par « Projet » ou « Proposition », hors loi
constitutionnelle et article 11 (autre parcours : Congrès, référendum), avec une première lecture
publiée (chambre de dépôt = celle de la première lecture). Sur la base réelle : 2 489 dossiers
(198 accélérés, 2 291 en navette normale).

### Gabarits

Les deux formes du design (canevas « Panoptique v2 », écran Dossier), complétées des cases que la
procédure **peut** connaître ; le front n'affiche pas les cases `sans_objet`. `{o}` = chambre de
dépôt, `{s}` = l'autre.

| Accélérée (`procedure_acceleree`) | Normale | Facultative | Conclue par (acte daté publié) |
|---|---|---|---|
| Dépôt | Dépôt | non | dépôt dans la chambre d'origine (`AN1-DEPOT`, `SN1-DEPOT`, accord `-ACIN`) |
| Commission {o}, Séance {o} | 1re lecture {o} | non | commission : rapport de la commission saisie au fond (`…-COM-FOND-RAPPORT`) ; séance ou lecture : décision (`…-DEBATS-DEC`) |
| Commission {s}, Séance {s} | 1re lecture {s} | non | idem dans l'autre chambre |
| 2e lecture {o}, 2e lecture {s} | idem | oui | décision `AN2-`/`SN2-DEBATS-DEC` |
| CMP | CMP | oui | décision de la CMP (`CMP-DEC` : « Accord », « Désaccord ») |
| Vote du texte de la CMP | Vote du texte de la CMP | oui | décision de **chaque** chambre sur le texte de la CMP (`CMP-DEBATS-AN-DEC` et `-SN-DEC`), ou un rejet |
| Nouvelle lecture | Nouvelle lecture | oui | décision de **chaque** chambre (`ANNLEC-`, `SNNLEC-DEBATS-DEC`) |
| Lecture définitive AN | Lecture définitive AN | oui | décision `ANLDEF-DEBATS-DEC` |
| Conseil constit. | Conseil constit. | oui | acte `CC-CONCLUSION`, ou décision du stock CONSTIT liée au dossier |
| Promulgation, Journal officiel | Promulgation et JO | non | promulgation : acte `PROM-PUB` daté (ou date de signature Légifrance) ; JO : date de publication de la loi |

Le design nomme « Lecture définitive » la lecture des conclusions de la CMP en procédure
accélérée ; ce n'est pas une lecture définitive (article 45, alinéa 4 : dernier mot de l'AN après
échec), d'où « Vote du texte de la CMP » (clé `conclusions_cmp`), décidé le 25/10/2026 : la case « Lecture définitive AN »
reste réservée au dernier mot de l'AN, les deux pouvant figurer dans un même dossier (conclusions
rejetées, puis nouvelle lecture). Il sépare Promulgation et JO en procédure accélérée et les réunit
en navette : repris tel quel.

Rangement des actes (`lecture.parcours_acte`) : par chambre et lecture de l'acte (`AN1`, `SN2`,
`ANNLEC`…, cf. `LECTURES` de l'adaptateur), et en procédure accélérée `…1-DEBATS…` pour la séance,
le reste pour la commission (le dépôt de l'autre chambre y compris : le texte lui est transmis).
Les actes `CMP-DEBATS`, `CMP-DGVT`, `CMP-MOTION` (49.3 sur le texte de la CMP) vont aux conclusions.
Annexes non comptées : procédure accélérée, étude d'impact, avis du Conseil d'État, lettre
rectificative. Hors gabarit (comptés dans `actes_hors_gabarit`) : lectures `unique`, `an20`…

### États d'une case

Jour de référence : la date du `projeter` (`date_reference`). Un acte daté **après** ce jour
(séance inscrite à l'ordre du jour, l'AN les publie à l'avance) est une échéance, pas une preuve.

| État | Définition |
|---|---|
| `faite` | l'acte qui conclut la case est publié et daté (au plus tard le jour de référence) |
| `en_cours` | un acte daté de la case est publié, pas celui qui la conclut, et rien n'est publié après |
| `a_venir` | aucun acte, et le parcours publié ne l'a pas dépassée |
| `sans_objet` | n'aura pas lieu, d'après un fait publié : CMP sans accord (pas de conclusions) ; conclusions adoptées (ni nouvelle lecture ni lecture définitive) ; texte adopté « sans modification » par une chambre saisie du texte de l'autre (fin de la navette) ; retrait ; rejet en lecture définitive ; case facultative sans acte alors qu'une case suivante en a (2e lecture quand la CMP est réunie, CC non saisi avant la promulgation) |
| `inconnu` | la donnée ne permet pas de conclure : case obligatoire sans acte alors que la suite en a ; case commencée, jamais conclue, alors que la suite a eu lieu (ou le texte a été retiré) |

**Étape courante** (`courante`, `etape_courante`) : la dernière case `en_cours` ; à défaut, la
première case `a_venir` déjà programmée (acte daté après le jour de référence) au-delà de la
dernière case active. Sinon aucune : le dossier n'est pas « entre deux étapes » par supposition.

**Prochaine échéance** (`lecture.parcours_dossier_synthese`) : la plus proche, à partir du jour de
référence, parmi : les actes programmés (ils disent quelle case ; heure et état lus sur la réunion
que l'acte cite, lien explicite, et son point d'ordre du jour ; un point « Supprimé » ou « Annulé »
retire l'échéance), les points d'ordre du jour de l'agenda AN liés au dossier (ni supprimés ni
annulés ; « Eventuel » est exposé tel quel), les événements annoncés (`canon.evenement_agenda`). À
date égale, l'acte. Sur la base réelle au 24/10/2026 : 20 dossiers ont une échéance (12 points
« Confirmé », 6 « Eventuel », 2 actes programmés sans point d'ordre du jour), 2 262 une étape courante (toutes `en_cours`).

Ce que la donnée **ne dit pas** : le délai du Conseil constitutionnel (un mois, huit jours en cas
d'urgence : calculable, non publié, donc non affiché) ; l'abandon d'un texte sans acte de clôture
(une proposition rejetée en 1re lecture par sa chambre d'origine reste `a_venir` pour la suite) ; la
caducité en fin de législature ; les étapes du Sénat que l'AN ne reprend pas (séances du Sénat
souvent réduites à la décision, rapports parfois absents : `inconnu`) ; une 3e lecture. Les lois de
finances (CMP après une lecture, sans `procedure_acceleree` dans la source) prennent le gabarit
normal : leurs 2es lectures restent `a_venir` jusqu'à la CMP. Quand l'AN ne publie pas la date du
JO, l'adaptateur reprend la date de l'acte : la case JO est alors datée de la promulgation (1 loi
sur 150 a les deux dates égales). Mesure au 24/10/2026 : 63 cases `inconnu` sur 27 973, dont 51
« 1re lecture » commencées et jamais conclues (textes retirés, ou PLF dont l'AN ne publie pas la
décision de 1re lecture).

### Exemples réels (base `civictrace`, 24/10/2026)

**DLR5L17N54085**, projet de loi d'urgence pour la protection et la souveraineté agricoles,
procédure accélérée. Étapes canon (extrait, 73 actes) : `AN1-DEPOT` 08/04/2026 ;
`AN1-COM-FOND-RAPPORT` 07/05 ; `AN1-DEBATS-DEC` 02/06 « adopté » ; `SN1-DEPOT` 03/06 ;
`SN1-COM-FOND-RAPPORT` 17/06 ; `SN1-DEBATS-DEC` 02/07 « modifié » ; `CMP-SAISIE` 06/07 ; `CMP-DEC`
17/07 « Accord » ; `CMP-DEBATS-AN-DEC` 20/07 et `CMP-DEBATS-SN-DEC` 21/07 « adopté, dans les
conditions prévues à l'article 45, alinéa 3 » ; `CC-SAISIE-AN` 24/07 ; `CC-CONCLUSION` 14/08 ;
`PROM-PUB` 18/08 ; loi 2026-796 au JO n° 192 du 19/08 ; décision 2026-914 DC.

| Case | État | Début | Fin | Conclusion |
|---|---|---|---|---|
| Dépôt | faite | 08/04/2026 | 08/04/2026 | |
| Commission AN | faite | 08/04 | 07/05 | |
| Séance AN | faite | 19/05 | 02/06 | adopté |
| Commission Sénat | faite | 03/06 | 17/06 | |
| Séance Sénat | faite | 02/07 | 02/07 | modifié |
| 2e lecture AN, 2e lecture Sénat | sans_objet | | | |
| CMP | faite | 06/07 | 17/07 | Accord |
| Vote du texte de la CMP | faite | 20/07 | 21/07 | AN : adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution · Sénat : idem |
| Nouvelle lecture, Lecture définitive AN | sans_objet | | | |
| Conseil constit. | faite | 24/07 | 14/08 | Non conformité partielle - réserve |
| Promulgation | faite | 18/08 | 18/08 | Loi n° 2026-796 |
| Journal officiel | faite | 19/08 | 19/08 | JO n° 192 |

Les dix cases affichées sont celles du design. Rejouée au 01/08/2026 (même données) : CC
`en_cours`, étape courante, prochaine échéance le 14/08 ; promulgation et JO `a_venir`.

**DLR5L17N51670**, proposition de loi relative à la fin de vie (aide à mourir), navette normale.
Étapes canon : `AN1-DEPOT` 11/03/2025 ; `AN1-DEBATS-DEC` 27/05/2025 « adoptée » ;
`SN1-DEBATS-DEC` 28/01/2026 « rejetée » ; `AN2-DEBATS-DEC` 25/02 « adoptée » ; `SN2-DEBATS-DEC`
12/05 « rejetée » ; `CMP-DEC` 03/06 « Désaccord » ; `ANNLEC-DEBATS-DEC` 30/06 « adoptée » ;
`SNNLEC-DEBATS-DEC` 07/07 « rejetée » ; `ANLDEF-DEBATS-DEC` 15/07 « adoptée » ; cinq saisines du
Conseil du 16 au 20/07 ; `CC-CONCLUSION` 14/08 ; `PROM-PUB` 18/08 ; loi 2026-794 au JO du 19/08.

| Case | État | Début | Fin | Conclusion |
|---|---|---|---|---|
| Dépôt | faite | 11/03/2025 | 11/03/2025 | |
| 1re lecture AN | faite | 11/03/2025 | 27/05/2025 | adoptée |
| 1re lecture Sénat | faite | 27/05/2025 | 28/01/2026 | rejetée |
| 2e lecture AN | faite | 28/01/2026 | 25/02 | adoptée |
| 2e lecture Sénat | faite | 25/02 | 12/05 | rejetée |
| CMP | faite | 19/05 | 03/06 | Désaccord |
| Vote du texte de la CMP | sans_objet | | | |
| Nouvelle lecture | faite | 12/05 | 07/07 | AN : adoptée · Sénat : rejetée |
| Lecture définitive AN | faite | 09/07 | 15/07 | adoptée |
| Conseil constit. | faite | 16/07 | 14/08 | Conformité - réserve |
| Promulgation et JO | faite | 18/08 | 19/08 | Loi n° 2026-794 · JO n° 192 |

La nouvelle lecture commence le 12/05, avant la décision de la CMP : l'AN date ainsi le dépôt
`ANNLEC-DEPOT`. Rejouée au 10/07/2026 : lecture définitive `en_cours` (dépôt du 09/07), étape
courante, échéance le 15/07 ; CC et promulgation `a_venir`. Les dossiers, déjà promulgués au
24/10/2026, n'ont plus d'étape courante ni d'échéance.

Tests : [test_accelere_en_cours](../tests/test_projection_parcours.py#L115),
[test_navette_normale_complete](../tests/test_projection_parcours.py#L140),
[test_texte_du_senat_adopte_conforme](../tests/test_projection_parcours.py#L155).

## Ce qui a été dit, ce qui a été voté

`lecture.dit_et_vote` — requête : `src/projections/50_dit_et_vote.sql`.

Pour une personne et un scrutin : ses interventions sur l'objet mis aux voix, à côté de son vote.
Aucun jugement : la projection ne dit ni « cohérent » ni « contradiction », elle met côte à côte.

| Terme | Définition |
|---|---|
| niveau `amendement` | intervention reliée (référence explicite) à l'amendement que le scrutin met aux voix |
| niveau `ensemble` | intervention reliée au dossier dont le scrutin vote l'ensemble ou l'article unique |
| interventions, avant le vote | nombre de prises de parole, dont celles tenues le jour du scrutin ou avant |
| `intervention_ids` | les interventions elles-mêmes, pour afficher les passages et leur ancre |

La présidence de séance (« La parole est à… ») n'est pas une prise de position : exclue. Seuls
comptent les orateurs identifiés (`orateur_id`) ; les autres attendent la revue humaine.

## Faits de l'Explorer (interventions et amendements)

`lecture.fait_intervention`, `lecture.fait_amendement` — requêtes :
[`src/projections/60_fait_intervention.sql`](../src/projections/60_fait_intervention.sql),
[`src/projections/61_fait_amendement.sql`](../src/projections/61_fait_amendement.sql).

Pas d'indicateur : les faits que filtre l'Explorer de l'app (API `ExplorerFaits`), une ligne par
fait retenu, sans texte, ses dimensions déjà calculées. Mêmes règles que les lectures de `canon` :

| Colonne | Définition |
|---|---|
| retenus | entité vivante ; interventions : hors présidence de séance, avec un orateur (personne ou nom publié) |
| `jour` | date de la réunion, à Paris |
| `groupe_id` | intervention : appartenance publiée de l'orateur le jour de la réunion, dans la chambre (la plus récente si deux se chevauchent) ; amendement : son groupe auteur publié |
| `auteur_id` | premier auteur personne de l'amendement, par ordre publié |
| `article_suivi_id` | intervention : l'article de l'amendement discuté, jamais rapproché du texte |
| `cle` | case du parcours (réunion citée par un acte du dossier ; étape de l'amendement) |

Au 25/10/2026 sur `civictrace` : 444 456 interventions retenues (dont 242 488 avec un groupe du jour)
et 171 770 amendements, les mêmes nombres que l'Explorer sans filtre. Sans ces projections, chaque
lecture large relisait `canon.intervention` (661 Mo avec le texte) : 28 s sans filtre au premier
appel ; avec elles, 0,6 s au premier appel (jusqu'à 2,6 s quand le cache de Postgres est froid) et
0,15 s ensuite, mesuré sur une copie des projections. Vérifié par
[`api/tests/pg/faits.test.ts`](../../api/tests/pg/faits.test.ts) (mêmes faits, mêmes dimensions).

## À venir

- Comparaison à la distribution de la chambre (médiane, quartiles) plutôt qu'un rang.
- Petits échantillons : en dessous d'un seuil, afficher le nombre et non le taux.
- Indicateurs par thème, une fois les thèmes attribués aux dossiers.
