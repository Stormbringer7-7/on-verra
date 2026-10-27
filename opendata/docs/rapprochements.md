# Rapprochements : mécanismes, règles et revue humaine

Ce document décrit **comment CivicTrace relie les données entre elles et entre sources**, ce qui
est fait automatiquement, ce qui ne l'est jamais, et comment une personne tranche les cas
incertains. Il s'adresse aux personnes qui relisent les cas (sections 1, 2, 6, 7) et aux
développeurs qui écrivent des adaptateurs (toutes les sections, surtout 3, 4, 8).

Code : `src/identites.py` (registre), `src/revue.py` (revue), `src/chargement.py` (application),
`src/adaptateurs/sources/**` (règles par source). Données : `canon.correspondance`,
`analytique.cas_revue`.

---

## 1. Règle de conduite

> **Pour l'instant, tout problème de rapprochement est revu par une personne.**
> Le code ne choisit jamais entre plusieurs candidats, ne relie jamais deux objets parce que leurs
> noms ou leurs titres se ressemblent, et ne valide jamais seul une proposition.

Le code ne relie automatiquement que dans deux cas :

1. **Identifiant officiel lu dans sa propre source** (`OFFICIAL_ID`) : l'acteur `PA720614` de l'AMO
   est la même personne à chaque chargement.
2. **Référence explicite** (`EXPLICIT_REFERENCE`) : une source *cite* l'identifiant d'un objet
   (le dossier AN cite le signet du dossier Sénat, un scrutin cite le numéro de l'amendement voté
   dans sa séance). Ces liens restent automatiques, mais ils sont **comptés dans le rapport** pour
   pouvoir être audités, et chacun garde sa preuve.

Tout le reste — ambiguïté, absence, conflit, nom seul — devient un **cas de revue**, consigné avec
ses candidats et ses preuves. Rien n'est appliqué avant la décision d'une personne, et la
décision est tracée (qui, quand, pourquoi).

### Garantie : `canon` ne contient que des données 100 % fiables

| Dans `canon` (fiable, exposable) | Hors de `canon` (en attente) |
|---|---|
| objets lus dans leur source, sous leur identifiant officiel | cas de revue `A_REVOIR` dans `analytique.cas_revue` |
| liens par référence explicite, avec leur preuve | candidats proposés par nom, présence, homonymie |
| décisions humaines appliquées, tracées (`MANUAL`, provenance `revue:<clé>`) | correspondances `NEEDS_REVIEW` / `PROPOSED` (jamais résolues) |
| valeurs de la source telles quelles, même incohérentes (signalées) | — |

Une référence non résolue reste **vide** dans `canon` : l'absence est une donnée fiable, une
supposition ne l'est pas. Ce qui n'est pas fiable sera traité plus tard ; pour l'instant, cela
passe par la revue humaine et rien d'autre.

`python -m src controles` vérifie ces invariants (rapport JSON dans `data/rapports/`) et échoue si
l'un des contrôles bloquants trouve quelque chose :

| Contrôle | Bloquant | Ce qu'il interdit |
|---|---|---|
| `correspondance_certaine_par_nom` | oui | une correspondance VERIFIED obtenue par nom et dates |
| `correspondance_manuelle_sans_decision` | oui | une correspondance MANUAL sans le cas de revue qui l'a produite |
| `identite_reliee_deux_fois` | oui | une identité native reliée de façon certaine à deux entités |
| `entite_sans_identite` | oui | une entité qu'aucune identité vérifiée ne permet de retracer (hors entités fusionnées) |
| `reference_vers_entite_fusionnee` | oui | une référence (clé étrangère, cible ou candidat d'un cas) vers une entité fusionnée |
| `entite_fusionnee_avec_identite` | oui | une entité fusionnée qui garde une correspondance certaine ou en revue |
| `fusion_sans_decision` | oui | une entité fusionnée sans le cas de revue appliqué qui l'a décidé |
| `ligne_sans_provenance` | oui | une ligne métier sans enregistrement source |
| `valeur_de_revue_sans_cas` | oui | une valeur posée « par revue » sans cas appliqué |
| `elu_relie_sans_revue` | oui | une fiche RNE (`mandat_rne`) reliée à une personne sans cas `elu_local` appliqué |
| `decision_non_appliquee` | oui | une décision humaine enregistrée mais pas appliquée |
| `dates_incoherentes_source` | non | (signalement) fin avant début, tel que publié |
| `cas_a_revoir` | non | (signalement) volume en attente de revue |

## 2. Vocabulaire

| Terme | Sens |
|---|---|
| **Identité native** | L'identifiant exact d'un objet dans sa source, toujours une chaîne : `AN:acteur:PA720614`, `SENAT:dossier:ppl25-940`, `AN:intervention:CRSANR5L17S2026O1N039#4034592` |
| **Entité** | L'objet canonique, désigné par un UUID interne stable (`canon.entite`). Une entité peut avoir plusieurs identités natives (une par source) |
| **Correspondance** | Le lien identité native → entité (`canon.correspondance`), avec sa **méthode**, son **statut**, sa **preuve**, et son audit (`revu_par`, `revu_le`) |
| **Méthode** | `OFFICIAL_ID` (lu dans la source), `EXPLICIT_REFERENCE` (cité par une autre source), `MANUAL` (décision de revue), `NAME_DATE` (nom et dates : jamais une preuve) |
| **Statut** | `VERIFIED` (certain), `NEEDS_REVIEW` / `PROPOSED` (à revoir), `REJECTED` (écarté, conservé pour l'audit) |
| **Lien** | Relation entre deux entités dans une colonne (`intervention.amendement_id`) ou dans `canon.lien` (auteur, cosignataire, rapporteur…) |
| **Cas de revue** | Un rapprochement que le code ne tranche pas (`analytique.cas_revue`) : constat, sujet, candidats avec indices, contexte, décision |
| **Indice** | Ce qui rend un candidat plausible (présence à la réunion, ancien député…). **Jamais une preuve** |

## 3. Le registre des identités

`RegistreIdentites` (`src/identites.py`) est le **seul** à écrire des correspondances, et il applique
les mêmes règles quel que soit le stockage (Postgres ou mémoire : même suite de tests).

| Opération | Règle |
|---|---|
| `identifier(type, identité)` | Identité déjà reliée de façon certaine : même entité. Sinon : nouvelle entité et correspondance `OFFICIAL_ID` / `VERIFIED`. |
| `resoudre(identité)` | Entité reliée de façon certaine, sinon rien. Une référence non résolue reste **vide** : jamais supposée. |
| `rapprocher(type, entité, autre identité, méthode, preuve)` | Preuve obligatoire. `OFFICIAL_ID`, `EXPLICIT_REFERENCE`, `MANUAL` : `VERIFIED`… **sauf** si l'identité est déjà reliée de façon certaine à une autre entité : alors `NEEDS_REVIEW` avec `conflit_avec`, et un cas `correspondance_a_revoir`. `NAME_DATE` : toujours `NEEDS_REVIEW`. Idempotent. |
| `valider` / `rejeter` | Ajoutent un audit ; une correspondance n'est jamais supprimée. Valider est refusé si l'identité est reliée de façon certaine ailleurs (rejeter l'autre d'abord). |
| `fusionner(type, absorbée, absorbante, preuve)` | Décision de revue seulement (`preuve.cas` obligatoire). Chaque identité certaine de l'absorbée est rejetée chez elle et reliée à l'absorbante (`MANUAL`, preuve du cas) ; puis l'entrepot re-pointe les références (§7). Idempotent. |

Garanties de la base : unicité de `(système, type, identifiant, entité)` ; index unique partiel :
**une identité native n'a qu'une seule correspondance `VERIFIED`**.

## 4. Références explicites (automatiques, auditées)

Chaque ligne : ce qui est cité, où, et ce qu'on en fait. Les taux ont été mesurés sur la
17e législature (cf. `docs/sources/`).

### Entre sources

| De → vers | Champ cité | Effet | Mesure |
|---|---|---|---|
| Dossier AN → dossier Sénat | `titreDossier/senatChemin` (signet `ppl21-419`) | même dossier canonique (`EXPLICIT_REFERENCE`) ; le Sénat n'y réécrit rien | 962 dossiers, 100 % présents dans DOSLEG ; 1 signet cité par deux dossiers AN → cas en revue |
| Acteur AN → sénateur | AMO, `adresses/adresse` de type 23 « Url sénateur » (`…/senateur/amard_gabriel20684b.html` → matricule `20684B`) | même personne (`EXPLICIT_REFERENCE`) ; une fiche sénateur déjà créée est **fusionnée** dans l'acteur (décision d'équipe du 24/10/2026) | 1 049 acteurs citent une fiche, 100 % des matricules présents dans `ODSEN_GENERAL` |
| Déclarant HATVP → député / sénateur | `liste.csv/id_origine` (n° d'acteur AN, matricule Sénat) ; identité du déclarant : sa page nominative (`url_dossier`) | même personne (`EXPLICIT_REFERENCE`) | 2 531/2 531 et 1 117/1 117 retrouvés |
| Ligne HATVP → déclaration | `open_data` → XML unitaire → `uuid` | identité de la déclaration | |
| Dossier AN → décision du Conseil constitutionnel | acte `ConclusionEtapeCC` : `anneeDecision`-`numDecision` = `NUMERO` du stock CONSTIT | même décision ; l'AN écrit le lien au dossier, le Conseil le reste | |
| Promulgation AN → texte publié | acte `PROM-PUB` : `infoJO/referenceNOR` (NOR), `codeLoi` | texte publié identifié par son NOR | |
| Décision CC → loi déférée | `LOI_DEF@nor` | NOR gardé (`nor_loi`) | |

### Au sein d'une source

| Lien | Règle |
|---|---|
| intervention de séance AN → orateur | `paragraphe@id_acteur` (`PA…`) |
| intervention de séance AN → dossier | numéros de texte cités par le point (`@valeur` « (n° 2406, 2401) ») → documents principaux de la législature (`numNotice`, uid sans suffixe) → dossier. Plusieurs dossiers : **un lien vers chacun** (discussion commune), aucun choisi |
| intervention de séance AN → amendement | `@adt` : (séance, numéro), sinon (dossier, numéro) **s'il ne désigne qu'un amendement** ; sinon cas `amendement_ambigu` / `amendement_introuvable` |
| intervention de commission AN → dossier | numéro de texte cité dans le compte rendu (« (n° 4 rect.) »), à partir de l'endroit où il est cité |
| intervention de commission AN → amendement | (organe de la réunion, numéro du texte cité, numéro « AS3 ») ; un seul amendement : relié ; sinon cas |
| intervention de séance Sénat → orateur, dossier | `cri:intervenant@mat` (sénateur) ; `cri:titreS1@signet` |
| intervention de séance Sénat → amendement | ancre `amd_<session>_<texte>_<numéro>` dont le texte est de la lecture en cours ; sinon numéro cité, dans les textes AMELI de la lecture (`cri:titreS1@lecassidt` → DOSLEG `texte` → `txt_ameli` du même `signet`) **s'il ne désigne qu'un amendement** ; ancre hors de la lecture, numéro à plusieurs amendements ou à aucun : cas `amendement_ambigu` / `amendement_introuvable` |
| étape → réunion, point d'ODJ, texte | `reunionRef`, `odjRef`, `texteAssocie` de l'acte |
| scrutin AN → dossier, étape | `voteRefs` de l'acte, sinon `objet/dossierLegislatif`, sinon dossier de l'amendement voté |
| scrutin AN → amendement | numéro cité par l'intitulé, dans la séance du scrutin, sinon dans son dossier s'il y est unique ; sinon cas |
| scrutin Sénat → dossier | `scr.code` → `date_seance` → `lecass` → `lecture` → `loi.signet` |
| jour de séance Sénat (agenda) → dossier | `date_seance.lecidt` → `lecass` → `lecture` → `loi.signet` ; chaîne rompue ou lecture de l'AN : rien n'est écrit |
| scrutin Sénat → amendement | `amescr` ; un seul amendement du dossier porte ce numéro : relié ; sinon cas |
| amendement → dossier, texte, auteurs | AN : chemin de l'archive, `texteLegislatifRef`, `signataires` ; Sénat : `doslegsignet`, `amdsen` (rang 1 = auteur) |
| version de texte → version précédente (navette) | DOSLEG : `typlec.typlecord`, `lecass.ordreass`, `oritxt.oriordre`, dates `txtoritxtdat` ; texte AN cité par son URL (`l17b2632`, `l17t0295`) ; même place sans dates distinctes, texte rejeté, non chargé ou adopté définitivement (renuméroté) entre les deux : cas `navette_incertaine` (cf. [modifications.md](modifications.md)) |
| modification d'article → amendement | un **seul** amendement adopté de l'étape vise l'article (Sénat `txt_ameli.numado` ; AN `texteLegislatifRef` + organe saisi au fond ou de séance) et son dispositif se retrouve dans le changement : `VERIFIED` ; sinon `NEEDS_REVIEW` et cas. Texte de CMP : `compromis_cmp` |
| amendement → article suivi | numéro officiel de la division visée (AN : `pointeurFragmentTexte/division/titre`, annexe → `divisionRattachee` ; Sénat : `sub.lib` si `subpos` = 0, annexe → `sub.merid`) + clé de suivi du dossier. Article additionnel, intitulé, titre, chapitre : aucun suivi (voulu) ; numéro illisible : cas `article_vise_illisible`. Détail : [modele.md](modele.md#règles-de-rattachement-des-amendements-et-des-scrutins) |
| amendement → étape | AN : la lecture qui cite le texte visé, l'étape d'examen (`-COM-FOND`, `-COM-AVIS`, `-DEBATS`) menée par l'organe d'examen de l'uid ; Sénat : le dossier AN qui cite le signet, la lecture qui cite le numéro du texte AMELI (code concordant avec `lecid`), commission au fond (`txttyp` C) ou séance (S). Plusieurs étapes : cas `etape_ambigue` ; aucune : vide |

### Identités dérivées de références officielles (`CIVICTRACE`)

| Identité | Dérivation | Pourquoi c'est fiable | Limite |
|---|---|---|---|
| `CIVICTRACE:article_suivi:<dossier>#<numéro>` | clé officielle du dossier (signet Sénat quand l'AN le cite, sinon uid AN) + numéro officiel de l'article dans la navette, mentions « (nouveau) », « (Supprimé) » retirées | pendant la navette, un article garde son numéro (« 3 bis » inséré, « Supprimé » conservé) | la loi promulguée renumérote : le passage au texte promulgué n'est pas couvert (Légifrance, à venir) ; un article sans numéro lisible donne un cas `article_sans_numero`. Un amendement qui vise un article le déclare aussi (même identité, mêmes valeurs) : le lien ne dépend pas du chargement des textes |

### Territoires

| Lien | Règle |
|---|---|
| commune → département → région, commune déléguée / arrondissement → commune | codes INSEE du COG 2026 (le type fait partie de l'identité : une commune déléguée peut porter le code de sa commune nouvelle) |
| mandat de député → département ou collectivité d'outre-mer | `election/lieu/numDepartement` de l'AMO = code INSEE ; « 099 » (Français établis hors de France) n'est pas un territoire du COG : constat |
| fiche RNE → commune, département, EPCI | codes publiés par le RNE : code commune et département INSEE ; SIREN de l'EPCI (`INSEE:siren:<SIREN>`, identifiant Sirene). Communes des COM (975…, 986…, 987…) hors COG : libellé seul |

### Élus du RNE : une fiche par mandat, la personne par la revue

Le RNE ne publie aucun identifiant de personne (cf. [sources/rne.md](sources/rne.md)). Chaque ligne
devient une fiche `mandat_rne` sous une **clé locale** (type, siège ou territoire, date de début,
et le nom publié quand le siège ne suffit pas) : c'est l'identité de la *ligne*, pas de la personne.
Le lien fiche → personne (`personne_id`) ne vient **que** d'un cas `elu_local` décidé ; même un
député RNE au même siège et à la même date qu'un acteur AN reste un indice
(`meme_siege_meme_date`). La date de naissance publiée n'est jamais lue (possibilité notée, non
retenue : cf. la fiche RNE).

### Règles écartées après mesure (elles auraient produit des liens supposés)

| Règle | Pourquoi |
|---|---|
| ordre du point du compte rendu (`@valeur_ptsodj`) comme index dans l'agenda | ne concorde que dans 42 % des cas |
| « la séance n'a discuté qu'un seul dossier » | les questions au Gouvernement portent le même code que les discussions de texte |
| « l'agenda n'annonce qu'un point » (commissions) | une réunion peut commencer par une audition non annoncée |
| titre du scrutin ≈ titre du dossier (ancien pipeline) | rapprochement par ressemblance : remplacé par `voteRefs` et l'amendement voté |
| nom de l'orateur ≈ nom d'un présent (commissions) | même un seul présent homonyme n'est qu'un indice : cas de revue |

## 5. Ce qui n'est pas un problème

Une absence de lien voulue n'est pas un cas de revue : une question au Gouvernement, une motion de
censure ou une déclaration n'ont pas de dossier ; une audition de commission avant que le texte
soit cité n'en a pas non plus ; une voix collective (« Un député du groupe RN », `PA0`) n'est pas
une personne.

## 6. Types de cas de revue

| Type | Créé quand | Nature | Candidats (indices) | Décider un candidat… | « aucun » |
|---|---|---|---|---|---|
| `correspondance_a_revoir` | un rapprochement est en conflit, ou par nom et dates | identité | l'entité proposée, l'entité déjà reliée | valide cette correspondance, rejette les autres ; si l'identité était l'identité propre de l'autre entité (dossier créé côté Sénat), **fusionne** celle-ci dans l'entité choisie (§7) | rejette les propositions |
| `identite_membre_gouvernement` | le Sénat cite un ministre sous un matricule propre (`@type="2"`) | identité | acteurs AN homonymes (député, membre du Gouvernement) | relie le matricule à l'acteur (`MANUAL`) ; ses interventions au Sénat prennent cet orateur. Après un « aucun » : fusionne la personne créée dans l'acteur | crée la personne telle que le Sénat la publie |
| `identite_senateur_ancien_depute` | un sénateur a d'anciens mandats de député (`ODSEN_ELUDEP`, sans identifiant AN), l'AMO ne cite pas sa fiche Sénat, mais un acteur porte son nom | identité | acteurs AN homonymes (`homonyme`, `depute`, `debuts_concordants`, `mandats_chevauchants`) | relie le matricule à l'acteur : les deux entités `personne` existant déjà, elles sont **fusionnées** (§7) | rien : ce sénateur n'est pas cet acteur |
| `identite_declarant` | un déclarant HATVP n'a pas d'identifiant parlementaire (membre du Gouvernement) | identité | acteurs AN homonymes | relie la page nominative HATVP à l'acteur (`MANUAL`) ; ses déclarations prennent cette personne. Après un « aucun » : fusionne la personne créée dans l'acteur | crée la personne telle que la HATVP la publie |
| `orateur_commission` | un orateur de commission AN n'est désigné que par son nom | champ `orateur_id` | homonymes de l'AMO (présence à la réunion, député, Gouvernement) | renseigne l'orateur de **ses interventions de cette réunion** | laisse le nom publié seul |
| `orateur_sans_identifiant` | Syceron donne un identifiant hors référentiel (`PA-125869`) | identité | homonymes de l'AMO | relie cet identifiant à la personne, pour toutes ses interventions | — |
| `elu_local` | une fiche RNE porte le nom d'une autre personne connue (acteur AN, sénateur, personne établie par revue) ou d'un autre mandat RNE du département | champ `personne_id` | homonymes AN (député, Gouvernement, même siège et même date), sénateurs, personnes établies par revue ; contexte : mandats RNE homonymes, priorité 1 (parlementaire) ou 2 | relie la fiche à cette personne | crée une personne pour ce mandat (`RNE:personne:<clé>`), proposée ensuite aux autres mandats homonymes |
| `fusion_entites` | une personne demande la fusion de deux entités existantes (`revue fusionner`) | identité | l'entité gardée | fusionne l'entité du sujet dans celle-ci (§7) | — |
| `conflit_fusion` | deux entités fusionnées publiaient des valeurs différentes | constat | — | — | constater (celles de l'entité gardée l'emportent ; les autres sont dans le contexte) ou corriger |
| `amendement_ambigu` | un numéro cité désigne plusieurs amendements | champ `amendement_id` | les amendements portant ce numéro | renseigne l'amendement des interventions ou du scrutin | laisse vide |
| `amendement_introuvable` | un numéro cité ne désigne aucun amendement | constat | — | — | constater (motif : numéro mal transcrit, amendement hors archive…) |
| `etape_ambigue` | le texte visé par un amendement et son organe d'examen désignent plusieurs étapes d'une lecture (acte publié dans deux dossiers) | champ `etape_id` | les étapes candidates | renseigne l'étape de l'amendement | laisse vide |
| `article_vise_illisible` | la division visée par un amendement (AN `pointeurFragmentTexte/division`, Sénat `sub.lib`) est un article sans numéro lisible (« Article 3 bi », « ARTICLE ARTICLE 2 ») | constat | — | — | constater ; l'amendement reste sans article suivi |
| `article_sans_numero` | un intitulé d'article n'a pas la forme d'un numéro (coquille de la source, intitulé collé) | constat | — | — | constater ; la version est gardée sans suivi |
| `articles_plage` | un intitulé désigne une plage (« Articles 6 à 14 ») | constat | — | — | constater ; la version est gardée sans suivi |
| `texte_non_decoupe` | un texte AN n'utilise pas le balisage des articles | constat | — | — | constater (ou adapter le découpage, avec test) |
| `modification_a_attribuer` | un article a changé, des amendements adoptés de l'étape le visent, aucun n'est prouvé seul à l'origine (plusieurs candidats, dispositif non retrouvé, changement pas entièrement expliqué, adopté avec modification) | constat | les amendements adoptés visant l'article (preuve lue dans le dispositif, sort) | — (constat pour l'instant : l'application d'un choix sur `modification_article` reste à brancher) | constater |
| `modification_sans_amendement` | un article a changé sans amendement adopté qui le vise à cette étape, ou sans étape d'amendement connue (transmission) | constat | — | — | constater (écart d'édition, coordination, 49.3…) |
| `navette_incertaine` | la version précédente d'un texte ne se lit pas avec certitude : ordre ambigu, texte non chargé, rejeté ou adopté définitivement (renuméroté), version hors navette DOSLEG | constat | — | — | constater ; les articles de cette version ne sont pas comparés |
| `reference_inconnue` | la source cite un identifiant absent des données chargées | constat | — | — | constater |
| `lien_ecarte` | un lien (auteur, réunion…) cite un objet absent | constat | — | — | constater |
| `document_illisible` | un document brut ne se lit pas | constat | — | — | constater ou corriger l'adaptateur |
| `document_non_publie` | un document annoncé n'est pas en ligne | constat | — | — | constater (il sera pris quand il paraîtra) |

**Clé** : chaque cas a une clé stable (ex. `orateur_commission:RUANR5L17S2025IDC455857:M. Yannick
Monnet`, `amendement_cite:AN:<séance>:<numéro>`, `identite_membre_gouvernement:<matricule>`). Un
rechargement retrouve le cas, met à jour ses candidats et son contexte, et **garde la décision**.

**Granularité** : un cas regroupe toutes les cibles concernées (toutes les interventions d'un orateur
dans une réunion ; toutes les interventions qui citent un numéro dans une séance). Une identité
(matricule, identifiant hors référentiel) est revue une fois pour toutes ses occurrences.

## 7. Cycle de vie et application

```
           signaler (chargement)                decider (personne)           appliquer
   (rien) ──────────────────────▶ A_REVOIR ─────────────────────▶ DECIDE ──────────────▶ APPLIQUE
                                     ▲                                                  │
                                     └──── rechargement : candidats/contexte mis à jour, ┘
                                           décision gardée et réappliquée
```

- **Nature champ** : la décision renseigne `champ` sur chaque cible (`corriger` : mise à jour
  d'une ligne existante, historisée, provenance `revue:<clé>`). Elle est aussi chargée au début de
  chaque chargement (`charger_decisions`) et **substituée à l'écriture** : un adaptateur qui réécrit
  la cible sans lien explicite n'efface pas la décision.
- **Nature identité** : la décision crée une correspondance `MANUAL` / `VERIFIED` entre l'identité
  du sujet et l'entité choisie (preuve : clé du cas, auteur, motif). Les objets qui citent cette
  identité la résolvent au prochain passage : `python -m src canon --relire --etapes <étape>`.
- **Nature constat** : la décision est l'accusé de lecture (« aucun ») avec un motif.
- Une identité mise en revue par un cas dédié ne produit pas en plus des cas « référence inconnue »
  pour chacun des objets qui la citent.
- **Caduc** : quand un document relu (règle de lecture corrigée, document modifié à la source) ne
  produit plus un cas `A_REVOIR`, celui-ci passe `CADUC` : il n'a plus d'objet. Il repasse
  `A_REVOIR` s'il réapparaît. Un cas décidé n'est jamais rendu caduc : la décision reste tracée.
  L'adaptateur déclare ce que le document publie au complet (`Ensemble`) ; les entités qu'il ne
  donne plus sont marquées retirées (`canon.entite.retiree_de_la_source_le`), **jamais supprimées**,
  et la couche de lecture doit les ignorer.
  Code : [Ensemble](../src/domaine/objets.py#L73), [ecrire()](../src/chargement.py#L116) ·
  Tests : [test_relecture_retire_les_absents_sans_supprimer](../tests/test_identites.py#L157),
  [test_cas_sans_objet_caduc_puis_revu_s_il_revient](../tests/test_revue.py#L85) (rejoués sur Postgres).

### Fusion d'entités

Deux entités existantes se révèlent parfois être le même objet : un dossier créé côté Sénat (DOSLEG
non cité par l'AN) que l'AN cite lors d'une navette ultérieure ; un membre du Gouvernement créé
côté Sénat par un « aucun », qu'une décision relie ensuite à son acteur AN ; une personne RNE établie
par revue (`RNE:personne:<clé>`) qui est un parlementaire ; un sénateur dont l'AMO cite la fiche.
Une fusion ne se fait que sur une **preuve tracée** : un cas de revue appliqué, ou une **référence
explicite sourcée**. Jamais sur un nom ou une ressemblance.

**Par référence explicite** (décision d'équipe du 24/10/2026) : quand une source cite l'identifiant
**officiel** d'une autre entité du même type (l'AMO cite le matricule Sénat d'un acteur ; l'AN cite
le signet d'un dossier créé côté Sénat), c'est le même objet vu par deux sources : l'entité citée est
fusionnée dans celle qui cite, sans revue. La preuve (`canon.fusion.preuve`) est la référence, qui la
cite et le document source (`reference`, `cite_par`, `source_id`) ; l'identité est reliée en
`EXPLICIT_REFERENCE`. Une identité déjà reliée par une *autre* référence (deux acteurs citant le même
matricule, deux dossiers AN citant le même signet) n'est pas l'identité propre d'une fiche : elle
reste en revue (`correspondance_a_revoir`), jamais de fusion en chaîne.
Code : [fusionner_par_reference()](../src/chargement.py#L193) ·
Tests : [test_amo_cite_la_fiche_senat_fusion_sans_revue](../tests/test_fusion.py#L92),
[test_dossier_senat_cite_ensuite_par_l_an](../tests/test_fusion.py#L57).

**Sur décision.** À l'application d'un cas de nature identité, si l'identité du sujet est l'**identité
propre** (`OFFICIAL_ID`) d'une entité B et que la décision désigne une autre entité A du même type,
B et A sont le même objet : B est fusionnée dans A. Une identité reliée à B par simple référence
(`EXPLICIT_REFERENCE`, ex. le signet `pjl24-869` cité par deux dossiers AN) ne dit rien de B : la
décision rejette seulement ce lien, sans fusion. Pour deux entités qu'aucun cas ne met en regard
(personne RNE ↔ député), la commande `revue fusionner` consigne un cas `fusion_entites`, le décide et
l'applique (§8).

**Ce que fait la fusion de B dans A** (une transaction ; rejouée, elle ne fait rien) :

1. **Identités** (registre) : chaque correspondance certaine de B est révisée `REJECTED`
   (`motif_rejet`, `fusionnee_dans`) et l'identité est reliée à A en `MANUAL` / `VERIFIED` avec la
   preuve du cas (`cas`, `decide_par`, `motif`, `fusion_de`, `methode_origine`) ; si A avait déjà une
   correspondance en revue pour cette identité (le conflit d'origine), c'est elle qui est validée.
   Une proposition en attente vers B est rejetée et reposée sur A. Rien n'est supprimé.
2. **Valeurs** : celles de A gagnent. Une colonne vide chez A est complétée par celle de B (avec
   les provenances de B) ; une valeur différente est **consignée** (`canon.fusion.conflits` et un cas
   `conflit_fusion`), jamais tranchée en silence. Une colonne unique (ex. NOR) n'est pas recopiée.
3. **Références** : toutes les colonnes qui référencent B passent à A. Elles sont trouvées dans le
   catalogue (`pg_constraint` : clés étrangères vers `canon.entite` et vers la table du type), si bien
   qu'une table ajoutée plus tard est couverte sans y penser : colonnes des entités, faits dépendants,
   `canon.lien`, affirmations, et dans `analytique.cas_revue` le sujet, les cibles et les candidats. Les
   décisions déjà prises qui visaient B désignent donc A, et `charger_decisions` les réapplique. Un fait
   dépendant qui existe déjà chez A (même clé : le même rapporteur des deux côtés) est copié dans
   `canon.historique`, puis retiré. L'audit (correspondances, provenance, historique) reste sur B.
4. **Marquage** : la ligne de B est gardée ; `canon.entite.fusionnee_dans` = A et
   `retiree_de_la_source_le` posé (la couche de lecture l'ignore, une relecture ne la « dé-retire »
   pas) ; la fusion est enregistrée dans `canon.fusion` (preuve, références re-pointées, doublons,
   colonnes complétées, conflits). Une entité déjà absorbée par B suit : son `fusionnee_dans` passe à A.

Au rechargement suivant, les identités de B se résolvent en A : la source de B réécrit sur A, et
ses objets citent A.

Code : [RegistreIdentites.fusionner()](../src/identites.py#L96),
[fusionner_si_meme_objet()](../src/revue.py#L161), [fusionner()](../src/revue.py#L191) (commande),
[EntrepotPostgres.fusionner()](../src/adaptateurs/stockage/postgres/entrepot.py#L356),
[EntrepotPostgres.references()](../src/adaptateurs/stockage/postgres/entrepot.py#L326),
[EntrepotMemoire.fusionner()](../src/adaptateurs/stockage/memoire.py#L171) ·
Tests (rejoués sur Postgres) : [test_dossier_senat_cite_ensuite_par_l_an](../tests/test_fusion.py#L57),
[test_membre_du_gouvernement_aucun_puis_relie](../tests/test_fusion.py#L118),
[test_personne_rne_fusionnee_avec_un_parlementaire](../tests/test_fusion.py#L144),
[test_reference_d_une_autre_entite_pas_une_fusion](../tests/test_fusion.py#L171),
[test_jamais_sans_decision_ni_entre_types](../tests/test_fusion.py#L185),
[test_fusions_en_chaine_et_controles](../tests/test_fusion.py#L197).
Exemples réels : [sources/senat.md](sources/senat.md) (membre du Gouvernement),
[sources/rne.md](sources/rne.md) (député du RNE).

## 8. Procédure de revue

```
export DATABASE_URL=postgres://…/civictrace
python -m src revue rapport                       # docs/revue/rapport.md + un CSV complet par type
python -m src revue lister --type orateur_commission
python -m src revue decider "orateur_commission:RU…:M. Yannick Monnet" --choix 0 --par "A. Relectrice" \
       --motif "présent à la réunion, seul homonyme député"
python -m src revue decider "amendement_cite:AN:RU…:2347" --choix aucun --par "A. Relectrice" \
       --motif "numéro mal transcrit dans le compte rendu"
python -m src canon --relire --etapes senat.debats   # après des décisions d'identité
python -m src revue fusionner RNE:personne:depute:0101:2024-07-08 AN:acteur:PA330008 --type personne \
       --par "A. Relectrice" --motif "même circonscription, même prise de fonction, fiche AN"
```

`revue fusionner <absorbée> <gardée>` (identités natives) : la première est fusionnée dans la
seconde (§7), tracé par un cas `fusion_entites:<absorbée>`. Ne fusionner que sur une preuve
vérifiable : une fusion re-pointe toutes les références, elle se défait à la main seulement.

Le **rapport** (`docs/revue/rapport.md`, non versionné) contient :
- la synthèse par type et par statut (à revoir, décidés, appliqués) ;
- les **correspondances automatiques** par système, type d'objet, méthode et statut, pour audit ;
- pour chaque type : ce qu'on attend de la personne, puis les cas à revoir (les 200 premiers dans
  le Markdown), et **la liste complète dans `<type>.csv`** : clé, statut, constat, sujet, champ,
  nombre de cibles, candidats avec leurs indices, contexte, décision, auteur.

Bonnes pratiques de relecture : ne choisir un candidat que sur une preuve vérifiable (fiche
officielle, compte rendu, vidéo de séance) et l'écrire dans `--motif` ; en cas de doute, ne pas
décider ; « aucun » est une décision, pas un abandon.

## 9. Pour les développeurs

- Un adaptateur ne tranche jamais : quand une règle explicite ne donne pas exactement un résultat,
  il émet un `CasRevue` (`src/domaine/objets.py`) avec des `Candidat` et des indices. Les cas
  d'identité sont émis **avant** les objets qui citent l'identité.
- `chargement.ecrire` crée seul les cas génériques (`reference_inconnue`, `lien_ecarte`,
  `correspondance_a_revoir`, `document_illisible`).
- Les candidats par nom (`src/noms.py`, annuaire de l'AMO) servent à proposer, jamais à décider.
- Tests : `tests/test_revue.py` (contrat rejoué sur Postgres dans `tests/test_postgres.py`),
  `tests/test_identites.py`, `tests/test_fusion.py` (contrat de fusion, mémoire et Postgres dans le
  même fichier), et pour chaque adaptateur un test qui vérifie qu'un cas ambigu donne un cas de revue
  et **pas** de lien.
- Fusion : `Entrepot.fusionner` re-pointe ce que le catalogue désigne. Une nouvelle colonne qui
  référence une entité doit donc être une **clé étrangère** (vers `canon.entite` ou la table du type) ;
  une référence sans clé étrangère (UUID nu, JSON) échappe à la fusion et au contrôle
  `reference_vers_entite_fusionnee`. Côté mémoire, toute valeur égale à l'UUID de l'absorbée est
  re-pointée ; les clés des faits dépendants y sont recopiées du schéma (`CLES_DEPENDANTS`, `UNIQUES`).

## 10. Limites connues

- **Élus du RNE** : les candidats d'un cas `elu_local` ne sont recalculés qu'à la relecture du RNE
  (`canon --relire --etapes rne.elus`) : une personne créée par « aucun » n'apparaît aux autres
  mandats homonymes qu'après ce passage. Environ 57 000 mandats ont un homonyme dans leur département.
- **Fusion d'entités** (§7) : une fusion n'est pas défaite par le code (la défaire = re-pointer à la
  main, l'audit le permet). Deux entités qui auraient alors la même clé unique (deux interventions de
  même ordre dans une réunion, en fusionnant deux réunions) arrêtent la fusion : les fusionner
  d'abord. Un index unique sur expression (`modification_article_unique`) n'est pas lu par la
  détection des doublons : un tel doublon annule la fusion (erreur d'unicité, rien n'est écrit).
  Après une fusion, les deux sources peuvent écrire la même entité : la dernière lue remplace les
  valeurs de l'autre (historisées), comme pour toute entité que deux sources écrivent.
- **Sénateurs anciens députés** : les 184 dont l'AMO connaît l'acteur sont reliés par la fiche
  Sénat citée (référence explicite) ; les 134 autres n'ont été députés qu'avant 2002 (l'AMO30
  commence à la 12e législature) : il n'y a personne à leur proposer. Un homonyme sans fiche citée
  part en revue ; ses candidats ne sont recalculés qu'à la relecture de `senat.senateurs`.
- Les cas `amendement_introuvable` en commission sont nombreux quand le compte rendu ne cite pas
  le texte examiné avant les amendements.
- La décision d'identité prend effet sur les objets qui la citent au prochain `--relire` de leur étape.
