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

## Parcours d'un dossier (tous les types)

`lecture.dossier_modele`, `lecture.dossier_sans_modele`, `lecture.parcours_acte`,
`lecture.parcours_dossier`, `lecture.parcours_deviation`, `lecture.parcours_branche`,
`lecture.dossier_lien`, `lecture.parcours_dossier_synthese` — requêtes :
[`src/projections/45_parcours_acte.sql`](../src/projections/45_parcours_acte.sql),
[`src/projections/55_parcours_dossier.sql`](../src/projections/55_parcours_dossier.sql).

Le canon stocke les **actes réellement publiés** (`canon.etape`) : codes `codeActe` de l'AN
(« AN1-COM-FOND-RAPPORT »), codes « DOSLEG-… » composés par l'adaptateur du Sénat pour les dossiers
que l'AN ne cite pas ([dossiers.py](../src/adaptateurs/sources/senat/dossiers.py)). Le parcours
est une projection : le **modèle de parcours** du type du dossier (le droit commun), chaque étape
lue dans ces actes, la décision du Conseil constitutionnel (`canon.decision_cc`) et la loi publiée
(`canon.texte_publie`). Rien n'est supposé : une étape sans preuve reste `inconnu`, jamais
`faite` ; une donnée absente n'est jamais un échec. Chaque étape donne sa **provenance**.

### Modèles de parcours

Écrits à la main d'après le droit dans [`opendata/parcours/`](../parcours/) (un fichier par modèle,
le commit vaut décision humaine), chargés dans `canon.parcours_*` au début de chaque `projeter`
([parcours.py](../src/parcours.py)). Un modèle : type(s) de dossier publiés (AN
`procedureParlementaire`, Sénat `typloi`), version et dates de validité (une réforme = une
nouvelle version), fondement juridique, étapes (phases d'actes reçues, lecture, côté de la
navette, nature obligatoire / conditionnelle / facultative), transitions (branches du droit
commun) et déviations possibles. Un modèle peut hériter d'un autre (`herite`).

20 modèles, en cinq familles :

| Famille | Modèles |
|---|---|
| législatif | loi ordinaire, loi organique, révision constitutionnelle, loi de finances, financement de la sécurité sociale, ratification d'un traité, référendum d'initiative partagée |
| résolution | résolution, résolution européenne, modification du règlement, résolution (art. 34-1), Haute Cour, motion référendaire |
| contrôle | commission d'enquête, mission d'information, rapport d'information, pétition, prérogatives d'une commission d'enquête |
| gouvernement | responsabilité du Gouvernement (49.1, 49.2, 49.3) |
| autre | allocution |

Étapes de la loi ordinaire (`{o}` : chambre de dépôt, `{s}` : l'autre) : Dépôt {o}, Commission
{o}, Séance {o}, Transmission {s}, Commission {s}, Séance {s}, 2e lecture {o}, 2e lecture {s},
lectures suivantes, CMP, Vote du texte de la CMP, Nouvelle lecture, Lecture définitive AN,
Conseil constitutionnel, Promulgation, Journal officiel. « Vote du texte de la CMP » (clé
`conclusions_cmp`) n'est pas la lecture définitive (article 45, alinéa 4 : dernier mot de l'AN
après échec), les deux pouvant figurer dans un même dossier.

**Rangement des actes** (`lecture.parcours_acte`) : le code de chaque acte est lu par
[`correspondances.toml`](../parcours/correspondances.toml) (premier motif qui correspond) : une
phase (dépôt, commission, séance, CMP, CC…) et un rôle : `ouvre` (l'étape a commencé), `conclut`
(l'acte qui la dit faite : rapport de la commission saisie au fond, décision), `annexe` (montré,
sans effet), `deviation`. L'étape est la première du modèle qui reçoit cette phase, pour la
lecture et la chambre de l'acte. Catégorie : `case`, `annexe`, `deviation`, ou `hors_modele` (code
inconnu, phase qu'aucune étape ne reçoit, déviation que le modèle ne prévoit pas) : compté dans
`actes_hors_modele`, jamais placé de force.

**Déviations** (`lecture.parcours_deviation`) : un événement qui modifie le droit commun,
rattaché à l'étape de l'acte classé qui le précède dans l'ordre publié. Effet : `rejoint` (le
parcours reprend), `termine` (les étapes suivantes sont sans objet), `remplace`, `suspend` ;
`effet_si` quand une conclusion correspond (49.3 : « Motion adoptée » termine). Procédure
accélérée, 49.3, motion de procédure, retrait, retrait de l'ordre du jour, irrecevabilité,
caducité, fusion.

**Branches** (`lecture.parcours_branche`) : une transition du modèle prise par le dossier, quand
la conclusion publiée d'une étape faite correspond à sa condition (« sans modification » : fin de
la navette ; CMP sans accord : nouvelle lecture ; texte de la CMP adopté ; rejet en lecture
définitive). Les étapes entre les deux sont sans objet. Ce n'est pas un événement.

**Hiérarchie** (`lecture.dossier_lien`) : un dossier rattaché à l'étape d'un autre, par lien
explicite seulement : un document publié dans le dossier enfant est cité par un acte du parent
(un engagement de responsabilité 49.3 : sa déclaration `DECL…` est citée par le dossier du texte).
`racine_id` (synthèse) : le dossier principal, en remontant les parents.

### États d'une étape

Jour de référence : la date du `projeter` (`date_reference`). Un acte daté **après** ce jour
(séance inscrite à l'ordre du jour, l'AN les publie à l'avance) est une échéance, pas une preuve.
Un état publié sans date (DOSLEG : caduc, retiré, fusionné) est un fait.

| État | Définition |
|---|---|
| `faite` | assez d'actes conclusifs publiés et datés (2 pour le vote du texte de la CMP et la nouvelle lecture : les deux chambres), ou un rejet ; CC : décision du stock CONSTIT ; promulgation : acte daté ou loi publiée ; JO : date de publication |
| `en_cours` | un acte de l'étape est publié, pas assez pour la conclure, et rien n'est publié après |
| `a_venir` | aucun acte, et le parcours publié ne l'a pas dépassée |
| `sans_objet` | n'aura pas lieu, d'après un fait publié : branche prise, déviation qui termine, étape non obligatoire sans acte alors qu'une suivante en a |
| `inconnu` | la donnée ne permet pas de conclure : étape obligatoire sans acte alors que la suite en a ; étape commencée, jamais conclue, alors que la suite a eu lieu (ou le parcours s'est terminé) |

**Étape courante** (`courante`) : la dernière `en_cours` ; à défaut, la première `a_venir` déjà
programmée au-delà de la dernière active. **Étape attendue** (`attendue`) : la première `a_venir`
au-delà de la dernière active, si le parcours n'est pas terminé. **Issue** (synthèse) : celle d'une
déviation qui termine (retiré, caduc, fusionné, irrecevable, rejeté), sinon celle de la dernière
étape faite qui en porte une (`rejete` si sa conclusion dit un rejet), sinon `en_cours`.

**Prochaine échéance** (`lecture.parcours_dossier_synthese`) : la plus proche, à partir du jour de
référence, parmi : les actes programmés (heure et état lus sur la réunion que l'acte cite et son
point d'ordre du jour ; un point « Supprimé » ou « Annulé » retire l'échéance), les points d'ordre
du jour de l'agenda AN liés au dossier, les événements annoncés (`canon.evenement_agenda`). À date
égale, l'acte.

Mesure sur une copie complète de `civictrace` (27/10/2026, 14 880 dossiers, dont 11 526 dossiers
du Sénat avec leurs étapes DOSLEG) : tous ont un modèle (`dossier_sans_modele` vide) ; 126 210
actes, dont 49 hors modèle hors racines de lecture (un dépôt sur une assemblée « indéterminée »,
un texte sans code d'origine, une décision du Conseil constitutionnel sur une révision
constitutionnelle) et **aucun côté AN** ; 269 étapes `inconnu` sur 212 425 ; 6 655 déviations
(5 013 caducités, 819 procédures accélérées, 291 retraits, 46 engagements de responsabilité…) ;
les 8 engagements 49.3 de la 17e rattachés à l'étape de leur texte, les 12 motions de censure
spontanées (49.2) sans parent.

Ce que la donnée **ne dit pas** : le délai du Conseil constitutionnel (calculable, non publié) ;
l'abandon d'un texte sans acte de clôture (une proposition rejetée en 1re lecture par sa chambre
d'origine reste `en_cours`) ; les étapes du Sénat que l'AN ne reprend pas pour les dossiers qu'il
cite (séances du Sénat souvent réduites à la décision : `inconnu`) ; la CMP du Sénat sans
conclusion publiée (DOSLEG ne dit ni accord ni désaccord) ; le temps législatif programmé.

### Exemples réels (copie de `civictrace`, 27/10/2026)

**DLR5L17N54085**, projet de loi d'urgence pour la protection et la souveraineté agricoles, loi
ordinaire, procédure accélérée (déviation au dépôt, `rejoint`).

| Étape | État | Début | Fin | Conclusion |
|---|---|---|---|---|
| Dépôt AN | faite | 08/04/2026 | 08/04/2026 | |
| Commission AN | faite | 08/04 | 07/05 | |
| Séance AN | faite | 19/05 | 02/06 | adopté |
| Transmission Sénat | faite | 03/06 | 03/06 | |
| Commission Sénat | faite | 03/06 | 17/06 | |
| Séance Sénat | faite | 02/07 | 02/07 | modifié |
| 2e lecture AN, 2e lecture Sénat, lectures suivantes | sans_objet | | | |
| CMP | faite | 06/07 | 17/07 | Accord |
| Vote du texte de la CMP | faite | 20/07 | 21/07 | AN : adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution · Sénat : idem |
| Nouvelle lecture, Lecture définitive AN | sans_objet (branche « Texte de la CMP adopté ») | | | |
| Conseil constitutionnel | faite | 24/07 | 14/08 | Non conformité partielle - réserve |
| Promulgation | faite | 18/08 | 18/08 | Loi n° 2026-796 |
| Journal officiel | faite | 19/08 | 19/08 | JO n° 192 |

**DLR5L17N51670**, proposition de loi relative à la fin de vie (aide à mourir), navette normale :
séance Sénat « rejetée » 28/01/2026 ; 2e lectures faites ; CMP « Désaccord » 03/06 (branche vers
la nouvelle lecture : vote du texte de la CMP sans objet) ; nouvelle lecture « AN : adoptée ·
Sénat : rejetée » ; lecture définitive « adoptée » 15/07 ; CC 14/08 « Conformité - réserve » ;
loi 2026-794 promulguée le 18/08, JO n° 192 du 19/08. 14 étapes faites, aucune `inconnu`, issue
`promulgue`.

**PLF et PLFSS de la 17e** : trois 49.3 du budget de la Sécurité sociale 2025 rattachés à la
nouvelle lecture et un à la CMP ; PLF 2025 : un à la CMP ; PLF 2026 : deux en nouvelle lecture et
un en lecture définitive (dossiers enfants, `dossier_lien`).

**ppl23-694** (Sénat), proposition de loi sur le renouvellement des parcs éoliens, déposée au
Sénat le 17/06/2024 puis caduque (état DOSLEG `05`, sans date) : dépôt fait, caducité rattachée au
dépôt (`termine`), toutes les étapes suivantes sans objet, issue `caduc`.

Tests : [test_accelere_en_cours](../tests/test_projection_parcours.py#L152),
[test_navette_normale_complete](../tests/test_projection_parcours.py#L184),
[test_texte_du_senat_adopte_conforme](../tests/test_projection_parcours.py#L205),
[test_engagement_de_responsabilite_enfant_du_texte](../tests/test_projection_parcours.py#L230),
[test_senat_caduc](../tests/test_projection_parcours.py#L243).

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
| `cle` | étape du parcours (réunion citée par un acte du dossier ; étape de l'amendement) |

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
