# Modèle canonique CivicTrace — état au 24/10/2026

Base lue par l'API (schémas `canon` et `lecture`) ; chargée chaque jour par le service `donnees`.

```
DATABASE_URL=postgres://…/civictrace python -m src migrer        # schéma (schema_pg/NNNN_*.sql)
DATABASE_URL=postgres://…/civictrace python -m src canon         # charge ce qui a changé
                                            … canon --relire     # réanalyse sans re-télécharger (avec --etapes : ces étapes seulement)
                                            … canon --forcer     # re-télécharge et réanalyse tout
```

## Architecture

| Couche | Fichiers | Rôle |
|---|---|---|
| Domaine | `src/domaine/` | `IdentiteNative`, `Provenance`, `Correspondance`, `Affirmation`, et `Objet`/`Dependants`/`Rapprochement` (ce que produit un adaptateur) |
| Ports | `src/ports.py` | `Entrepot` (persistance), `Synthetiseur` (« en clair »), `ArchiveBrute` |
| Règles d'identité | `src/identites.py` | `RegistreIdentites` : identifiant officiel = VERIFIED ; référence explicite = VERIFIED sauf conflit ; nom + dates = NEEDS_REVIEW ; jamais d'écrasement ; fusion d'entités sur décision de revue (identités reportées en `MANUAL`) |
| Chargement | `src/chargement.py` | document brut → empreinte → analyse → écriture, dans une transaction par étape ; documents inchangés sautés |
| Adaptateurs de source | `src/adaptateurs/sources/{an,senat}/` | lecture des fichiers bruts, aucune écriture |
| Adaptateurs de stockage | `src/adaptateurs/stockage/{memoire.py,postgres/}` | même contrat, testé deux fois (`tests/test_identites.py`, `tests/test_postgres.py`) |
| Synthèse | `src/adaptateurs/synthese.py` | `SansSynthese` seulement : « Pas de synthèse disponible » |
| Composition | `src/compilation.py` | seul endroit qui choisit les adaptateurs (`ENTREPOT=postgres|memoire`) |

Indicateurs contextualisés (participation attendue, écarts, présence en commission) :
`python -m src projeter`, formules dans [indicateurs.md](indicateurs.md). Contrôle des invariants :
`python -m src controles`.

Une référence vers un objet inconnu reste vide : un lien n'est jamais supposé. Tout problème de
rapprochement (ambiguïté, absence, conflit, nom seul) devient un **cas de revue humaine** :
mécanismes, règles et procédure dans [rapprochements.md](rapprochements.md).

## Noms de la doc CivicTrace → schéma

| Doc (§5, §7) | Schéma | Remarque |
|---|---|---|
| source_record | `brut.enregistrement_source` | ajout seul, unique par (système, fichier, chemin, empreinte) |
| entity_crosswalk | `canon.correspondance` | + index unique partiel : un identifiant natif n'a qu'une correspondance VERIFIED |
| (racine polymorphe) | `canon.entite` | cible des clés étrangères, réponse à la note du §7 |
| Person / Organisation / MandateFunction | `canon.personne` / `organisation` / `fonction` | |
| LegislativeDossier / LegislativeStage / Document | `canon.dossier` / `etape` / `document` | étapes réelles publiées ; la barre de parcours sera une projection |
| TextVersion / ArticleVersion | `canon.version_texte` / `version_article` + `article_suivi` | AN (HTML) et Sénat (Akoma Ntoso) ; mention et statut publiés (supprimé, conforme, non modifié) |
| (retrait) | `canon.entite.retiree_de_la_source_le` | posé quand une relecture ne donne plus l'entité ; jamais de suppression |
| (fusion) | `canon.entite.fusionnee_dans` + `canon.fusion` | deux entités sont le même objet (décision de revue seulement) : l'absorbée est gardée, marquée et retirée, ses références passent à l'autre ; `canon.fusion` garde la preuve, les références re-pointées et les valeurs divergentes ([rapprochements.md §7](rapprochements.md)) |
| Amendment | `canon.amendement` + `avis_amendement` | AN et Sénat |
| Intervention | `canon.intervention` (+ `reunion`, `point_odj`, `participation`, `audition`) | texte intégral, index plein texte français |
| Scrutiny / IndividualVote | `canon.scrutin` / `vote` (+ `position_groupe`) | AN et Sénat ; mises au point AN : `canon.lien` nature `mise_au_point` (le vote n'est jamais modifié) |
| ParliamentaryQuestion | `canon.question` | AN : QG, QE, QOSD ; auteur, groupe et ministères par identifiant, textes tels que publiés |
| Declaration / DeclaredInterest | `canon.declaration` / `rubrique_declaree` | HATVP |
| InterestRepresentative / LobbyingAction | `canon.representant_interets` / `action_representation` (+ `exercice_representation`) | HATVP (AGORA) |
| (élu tel que publié par le RNE) | `canon.mandat_rne` | une fiche par mandat ; `personne_id` posé par la revue seulement (cas `elu_local`) |
| Claim / claim_evidence | `analytique.affirmation` / `preuve` | le schéma s'appelle `analytique` : `analyse` est un mot réservé de Postgres |
| (historique) | `canon.historique` | ancienne ligne copiée quand une valeur connue est remplacée (compléter un champ vide n'en est pas une) |
| (liens) | `canon.lien` | auteur, cosignataire, rapporteur, initiateur, étape→réunion, intervention→dossiers… |

## Ce qui est chargé (17e législature) — chargement complet : environ 40 min, incrémental : 6 min

| Étape | Source | Contenu |
|---|---|---|
| `an.acteurs` | AMO30 | 3 175 personnes, 2 643 organisations, 93 990 fonctions (sans groupes d'amitié ni d'études) |
| `an.travaux` | dossiers, agenda, amendements, scrutins, Syceron | 3 352 dossiers, 28 269 étapes, 11 344 documents, 8 142 réunions, 6 252 points d'ODJ, 187 957 présences, 142 089 amendements, 9 097 scrutins, 109 018 positions de groupe, 1 352 220 votes, 3 452 mises au point (1 664 scrutins), 341 299 interventions en séance ; 962 dossiers reliés au Sénat (1 en revue) |
| `an.questions` | questions au Gouvernement, écrites, orales sans débat | 21 793 questions (1 800 QG, 19 165 QE, 828 QOSD), 14 866 avec réponse ; auteurs et ministères tous reliés par identifiant AN |
| `an.commissions` | `dyn/opendata/CRC….html` | 2 927 comptes rendus de commission (113 annoncés, pas encore publiés), 216 842 interventions |
| `senat.senateurs` | ODSEN | 2 012 sénateurs, 7 481 mandats et fonctions de groupe, 29 groupes ; anciens députés reliés par la fiche Sénat citée par l'AMO (184, sans revue) |
| `senat.dossiers` | DOSLEG | 11 528 dossiers non cités par l'AN (ceux qu'il cite sont reliés, pas dupliqués) |
| `senat.travaux` | AMELI, DOSLEG | 29 681 amendements, 31 960 avis (commission, Gouvernement), 724 scrutins, 251 802 votes (depuis 2024) |
| `constit.decisions` | stock DILA CONSTIT (global + incréments) | 7 637 décisions du Conseil constitutionnel ; liées aux dossiers par l'AN |
| `hatvp.declarations` | `liste.csv` + XML unitaires | 1 652 déclarations (1 535 reliées par `id_origine`, 117 en revue), rubriques publiées sans données privées |
| `hatvp.representants` | répertoire AGORA | 4 105 représentants d'intérêts, leurs exercices, 113 382 actions déclarées |
| `insee.territoires` | COG 2026 (INSEE) | régions, départements, collectivités d'outre-mer, communes, communes déléguées et associées, arrondissements municipaux |
| `senat.textes` | Akoma Ntoso du Sénat | versions de texte et d'article des dossiers depuis 2024, suivi des articles |
| `an.textes` | HTML unitaire de l'AN | textes déposés, de la commission et adoptés des dossiers examinés, suivi des articles |
| `textes.modifications` | textes AN et Sénat en cache, amendements bruts (AN, AMELI), DOSLEG | mesuré sur le cache, pas encore chargé : 9 137 modifications d'articles avec diff mot à mot (434 attribuées à un amendement, 1 129 au texte de CMP, le reste en revue), 509 versions non comparées (cf. [modifications.md](modifications.md)) |
| `rne.elus` | RNE (5 CSV : maires, conseillers communautaires, députés, sénateurs, eurodéputés) | 97 961 lignes publiées, une fiche `mandat_rne` chacune ; EPCI par SIREN ; cas `elu_local` pour les homonymes |
| `senat.debats` | `cri.zip` (+ AMELI, DOSLEG) | 244 jours de séance depuis le 18/07/2024, 167 954 interventions, 1 327 membres du Gouvernement identifiés par matricule, amendements cités (ancre `amd_…` ou numéro dans la lecture en cours) |
| `senat.agenda` | DOSLEG `date_seance` | 470 jours de séance publique par dossier depuis le 18/07/2024, dont 19 à venir (ordre du jour) : `canon.evenement_agenda` |

| Discussions | Interventions | Orateur certain | Dossier | Amendement |
|---|---|---|---|---|
| Séance AN | 341 299 | 306 168 | 285 594 | 31 298 (86 % de celles qui en citent un) |
| Commission AN | 216 842 | 0 (nom publié) | 85 527 | 23 163 |
| Séance Sénat | 167 954 | 167 739 | 97 190 | 37 075 (89 % des 41 743 qui en citent un ; 351 en revue, 4 360 vers des amendements non chargés) |

| Scrutins | Nombre | Dossier | Amendement voté |
|---|---|---|---|
| AN | 9 097 | 6 843 | 5 932 |

| Questions AN | Nombre | Avec réponse | Auteur relié | Ministère attributaire relié | Séance reliée |
|---|---|---|---|---|---|
| au Gouvernement (QG) | 1 800 | 1 800 | 1 800 | 1 800 | 0 (non publiée) |
| écrites (QE) | 19 165 | 12 251 | 19 165 | 19 165 | — |
| orales sans débat (QOSD) | 828 | 815 | 828 | 828 | 0 (non publiée) |

Le ministre qui répond n'est publié que comme ministère (`organeRef`) : la personne n'est nommée que
dans le texte de la réponse, elle n'est pas reliée.
| Sénat | 724 | 724 | 181 |

Les questions au Gouvernement, motions de censure et déclarations n'ont pas de dossier : c'est voulu.

## Règles de rattachement des amendements et des scrutins

| Lien | Règle (référence explicite) |
|---|---|
| amendement AN → dossier, texte | chemin de l'archive `json/<dossier>/<texte>/` et `texteLegislatifRef` |
| amendement AN → sort | `sort`, sinon l'état du traitement (« Retiré », « Irrecevable… ») ; « En traitement », « A discuter » : en attente |
| amendement → article suivi | `CIVICTRACE:article_suivi:<clé du dossier>#<numéro>`, la clé étant celle du dossier Sénat quand l'AN le cite (`senatChemin`), sinon `AN:dossier:<uid>` (même règle que les textes, [cle_suivi()](../src/adaptateurs/sources/an/dossiers.py#L89)). AN : numéro lu dans `division/titre` (casse publiée), annexe → article de `divisionRattachee` ; Sénat : `sub.lib` quand `amd.subpos` = 0, annexe → article parent `sub.merid`. L'amendement déclare l'article suivi lui-même (identité dérivée de références officielles, valeurs identiques à celles des textes) : 9 211 amendements AN visent un article dont le texte n'est pas chargé, ils seraient sinon autant de `reference_inconnue` |
| amendement → pas d'article suivi (voulu) | insertion avant ou après un article (`articleAdditionnel`, `chapitreAdditionnel`, `avant_A_Apres` ; Sénat `subpos` ≠ 0, « Article additionnel… »), intitulé du texte, titre, chapitre, section, aucune division publiée : l'amendement ne vise aucun article existant, ce n'est pas un cas de revue |
| amendement → article illisible | division d'article ou d'annexe sans numéro lisible (« Article 3 bi », « ARTICLE ARTICLE 2 ») : cas `article_vise_illisible`, aucun suivi deviné |
| amendement AN → étape | la lecture (acte racine) dont un acte cite le texte visé (`texteAssocie`, `texteAdopte`, `textesAssocies`), puis son étape d'examen (`…-COM-FOND`, `…-COM-AVIS`, `…-DEBATS`, `CMP-DEBATS-AN`) dont `organeRef` est l'organe d'examen de l'uid de l'amendement (`AMANR5L17<PO…>B…`). Une seule : reliée ; plusieurs : cas `etape_ambigue` ; aucune (séance pas encore publiée) : vide |
| amendement Sénat → étape | seulement pour un dossier cité par l'AN : le dossier AN unique qui cite le signet, la lecture qui cite le numéro du texte AMELI (`PRJLSNR5S479B0689`, `…BTC0763`) et dont le code concorde avec `txt_ameli.lecid` (1 → SN1, 2 → SN2, 3 → CMP, 4 → SNNLEC), puis la commission au fond (`txttyp` C, sauf délégation au fond `sai.isdelegfond`) ou la séance (`SN…-DEBATS`, `CMP-DEBATS-SN`, `txttyp` S) |
| intervention de séance AN → amendement | `@adt` : (séance, numéro), sinon (dossier, numéro) si un seul amendement de séance le porte |
| intervention de commission AN → amendement | (organe de la réunion, numéro du texte cité, numéro « AS3 ») |
| scrutin AN → dossier, étape | `voteRefs` de l'acte, sinon `objet/dossierLegislatif`, sinon dossier de l'amendement voté |
| scrutin AN → amendement | numéro cité par l'intitulé (« l'amendement n° 8… »), dans la séance du scrutin, sinon dans son dossier |
| position de groupe | recalculée depuis le décompte : `positionMajoritaire` publié est parfois faux |
| amendement Sénat → dossier, division, auteurs, avis | `txt_ameli.doslegsignet`, `sub.lib`, `amdsen` (rang 1 = auteur) → matricule, `avcid` / `avgid` |
| scrutin Sénat → dossier | `scr.code` → `date_seance` → `lecass` → `lecture` → `loi.signet` (`date_seance.lecidt` désigne une lecture par assemblée) |
| scrutin Sénat → amendement | `amescr` ; non relié si le numéro désigne plusieurs amendements du dossier (une lecture par texte) |
| intervention de séance Sénat → amendement | ancre `amd_<session>_<texte>_<numéro>` de l'intervention, si son texte est de la lecture en cours ; sinon numéro cité, dans les textes AMELI de la lecture (`cri:titreS1@lecassidt` → DOSLEG `texte` → `txt_ameli` du même dossier), si un seul amendement le porte |

Mesure sur le cache du 24/10/2026 (cas réels : [test_divisions_reelles](../tests/test_amendements_articles.py#L87)) :

| | AN (142 089) | Sénat (29 681) |
|---|---|---|
| reliés à un article suivi | 98 350 (dont 23 071 par une annexe) | 18 499 (dont 2 126 par une annexe) |
| sans article, voulu : additionnel | 41 290 | 9 178 |
| sans article, voulu : intitulé, titre, chapitre, sans division | 2 297 | 2 004 |
| article visé, dossier absent de l'archive des dossiers | 119 | 0 |
| en revue `article_vise_illisible` | 33 | 0 |
| reliés à une étape | 138 182 | 26 617 |
| en revue `etape_ambigue` | 43 | 0 |
| sans étape (aucune étape publiée, chaîne incomplète) | 3 864 | 3 064 |

## Règles de rattachement des discussions

| Discussion | Orateur | Dossier |
|---|---|---|
| Séance AN (Syceron) | `@id_acteur` (PA) : certain. `PA0` (voix collective) et identifiants négatifs : nom publié seul | numéros de texte cités par le point (`@valeur`) → documents principaux de la législature → dossier. Plusieurs dossiers : liens vers chacun (discussion commune). Sans numéro (QAG, motions) : aucun |
| Commission AN (HTML) | nom publié seulement (décision ouverte n° 7) | numéro de texte cité dans le compte rendu, à partir de l'endroit où il est cité. Pas de repli sur l'agenda : une réunion annoncée avec un seul point peut commencer par une audition |
| Séance Sénat (CRI) | `@mat` (matricule) : certain. Membres du Gouvernement : matricule Sénat, personne créée depuis le compte rendu ; rapprochement avec l'acteur AN à proposer | `titreS1@signet` (clé DOSLEG), relié au dossier AN quand l'AN le cite. Lecture tolérante (HTML embarqué : aucun jour ne passe un analyseur XML strict) |

Règles **écartées** après mesure, parce qu'elles auraient produit des liens supposés :
- l'ordre du point du compte rendu (`@valeur_ptsodj`) comme index dans l'agenda : il ne concorde que dans 42 % des cas ;
- « la séance n'a discuté qu'un dossier » : les questions au Gouvernement portent le même code que les discussions de texte ;
- le seul point de l'agenda pour une réunion de commission (cf. ci-dessus).

## Limites connues

- Un dossier créé côté Sénat puis cité par l'AN (navette ultérieure) donne un conflit en revue ; la décision fusionne les deux dossiers (procédure : [rapprochements.md §7](rapprochements.md)). Une fusion n'est pas défaite par le code.
- Interventions des comptes rendus HTML : identité `CR#ordre`. Une révision du compte rendu qui insère un paragraphe décale les identités suivantes (les anciennes restent, non marquées retirées).
- Dates incohérentes de la source (fin avant début) : gardées telles quelles, à signaler par les contrôles (phase 4).
- Membres du Gouvernement : une personne côté AN (PA) et une côté Sénat (matricule), rapprochées par la revue seulement (`identite_membre_gouvernement`) ; une personne créée par « aucun » est fusionnée dans l'acteur si la décision change.
- Commissions du Sénat : pas de comptes rendus structurés chargés.
- `--relire` après une correction de règle : les lignes corrigées passent dans l'historique avec la même source qu'avant (correction de lecture, pas changement à la source).
- Avis sur les amendements AN : non publiés en données structurées.
- Questions AN : ni la personne du ministre qui répond ni la séance (QAG, QOSD) ne sont publiées par identifiant ; non reliées.
- Non encore chargés : stocks JORF et LEGI (la promulgation vient des actes AN et de DOSLEG).

Exemples réels de chaque objet, de la source au canon, avec le code et le test qui le prouvent :
[sources/an.md](sources/an.md), [sources/senat.md](sources/senat.md), [sources/legifrance.md](sources/legifrance.md),
[sources/hatvp.md](sources/hatvp.md), [sources/insee.md](sources/insee.md), [sources/rne.md](sources/rne.md).
