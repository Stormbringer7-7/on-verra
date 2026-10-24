# RNE — Répertoire national des élus (data.gouv.fr)

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Accès** : `https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/`. Les URLs des fichiers changent à chaque livraison : elles sont résolues par l'API à chaque chargement (hors ligne, on relit le cache).
- **Fréquence** : irrégulière (dernière livraison le 11/08/2026).
- **Format** : un CSV par type de mandat (`;`, UTF-8).
- **Étape** : `python -m src canon --etapes rne.elus` (après `insee.territoires`, `an.acteurs`, `senat.senateurs`).

## Fichiers chargés

| Fichier (cache `data/brut/rne/`) | Lignes | Type de mandat | Colonnes clés |
|---|---|---|---|
| `elus_maires_mai_csv.csv` | 34 826 | maire | code département, **code commune (INSEE)**, nom, prénom, sexe, CSP, début de mandat et de fonction |
| `elus_conseillers_communautaires_epci_csv.csv` | 62 129 | conseiller_communautaire | **SIREN de l'EPCI**, commune de rattachement, libellé de fonction (« 2e vice-président… ») |
| `elus_deputes_dep_csv.csv` | 577 | depute | département, **code de circonscription** (`0101`), début de mandat |
| `elus_senateurs_sen_csv.csv` | 348 | senateur | département, début de mandat |
| `elus_representants_parlement_europ_en_rpe_csv.csv` | 81 | representant_parlement_europeen | début de mandat |

## Le modèle retenu : une fiche par mandat, la personne par la revue

Le RNE ne publie **aucun identifiant de personne** et ne décrit que les mandats en cours. On ne
peut donc ni affirmer que deux lignes sont la même personne, ni qu'un maire est un ancien député.
Décision d'équipe (24/10/2026) :

1. **Une fiche `mandat_rne` par ligne, telle que publiée** : nom, prénom, sexe, CSP, fonction,
   territoire, dates. Elle s'affiche et se cherche tout de suite (« selon le RNE »), depuis le
   territoire (« qui représente ma commune ») comme depuis la recherche par nom.
2. **Reliée à son territoire par les codes officiels publiés** : commune et département INSEE,
   SIREN de l'EPCI (l'EPCI devient une `organisation` `INSEE:siren:<SIREN>`, type `epci`).
3. **`personne_id` n'est posé que par une décision humaine** (cas `elu_local`) :
   - un cas est ouvert quand quelqu'un d'autre porte le même nom : un acteur AN, un sénateur, une
     personne déjà établie par une revue, ou un autre mandat RNE du même département ;
   - le relecteur choisit la personne, ou « aucun » : une personne est alors **créée** pour ce
     mandat (`RNE:personne:<clé du mandat>`) et proposée aux autres mandats homonymes au
     chargement suivant ;
   - priorité 1 : un parlementaire homonyme ; priorité 2 : homonymes locaux seulement ;
   - le contrôle bloquant `elu_relie_sans_revue` vérifie qu'aucun mandat n'est relié sans cas appliqué.
4. Un mandat sans aucun homonyme reste une fiche seule, sans cas : rien à décider.

### Clé locale d'une fiche (pas un identifiant de personne)

| Type | Clé `RNE:mandat:…` | Pourquoi |
|---|---|---|
| maire | `maire:<code commune>:<début de fonction>` | une commune n'a qu'un maire à une date |
| depute | `depute:<circonscription>:<début de mandat>` | un siège n'a qu'un titulaire à une date |
| conseiller_communautaire | `conseiller_communautaire:<SIREN>:<commune>:<début de mandat>:<nom>:<prénom>` | plusieurs conseillers par commune et par EPCI : seul le nom publié les distingue |
| senateur | `senateur:<département>:<début de mandat>:<nom>:<prénom>` | plusieurs sénateurs par département |
| representant_parlement_europeen | `representant_parlement_europeen:<début de mandat>:<nom>:<prénom>` | circonscription unique |

Clés vérifiées uniques sur la livraison du 11/08/2026 (0 doublon sur les 5 fichiers). Un nom
corrigé à la source donne une nouvelle fiche ; l'ancienne n'est plus vue (historique conservé).

### Ce qui n'est jamais utilisé

- **La date de naissance** publiée par le RNE est retirée de chaque ligne dès la lecture : elle
  n'entre ni dans l'empreinte du document brut, ni dans `canon`, ni dans les indices de revue
  (doc CivicTrace §4.4).
  > **Possibilité notée, non retenue (24/10/2026)** : la date de naissance serait l'indice le plus
  > discriminant pour proposer des candidats (afficher au relecteur « même date de naissance :
  > oui / non », sans jamais la montrer ni la stocker). À rediscuter si le volume de revue
  > l'exige ; ce serait une décision d'équipe, et une analyse d'impact sur les données personnelles.
- Le nom seul ne relie jamais rien : il ne sert qu'à **proposer** des candidats ([normaliser()](../../src/noms.py#L22)).

## Exemples réels : de la source au canon

Relevés le 24/10/2026 (livraison RNE du 11/08/2026). Liens vers le code vérifiés par `tests/test_docs.py`.

### Maire — `RNE:mandat:maire:01001:2026-03-23`

Brut : `elus_maires_mai_csv.csv` (date de naissance retirée à la lecture) :

```text
Code du département=01  Libellé du département=Ain  Code de la commune=01001
Libellé de la commune=L'Abergement-Clémenciat  Nom de l'élu=EVALET TAPONAT  Prénom de l'élu=Line  Code sexe=F
Libellé de la catégorie socio-professionnelle=Ingénieur et cadre technique d'entreprise
Date de début du mandat=2026-03-15  Date de début de la fonction=2026-03-23
```

Canon (`canon.mandat_rne`) : `{"type_mandat": "maire", "nom": "EVALET TAPONAT", "prenom": "Line", "nom_affiche": "Line EVALET TAPONAT",
"sexe": "F", "fonction": "Maire", "territoire": "L'Abergement-Clémenciat", "debut_mandat": "2026-03-15",
"debut_fonction": "2026-03-23", "personne_id": null}`, `organisation_id` = `INSEE:commune:01001`,
`departement_id` = `INSEE:departement:01`.

### Conseiller communautaire — `RNE:mandat:conseiller_communautaire:200029999:01056:2026-03-15:turpin:juvenal`

Brut : `elus_conseillers_communautaires_epci_csv.csv`

```text
Code du département=01  N° SIREN=200029999  Libellé de l'EPCI=Cc Rives De L'Ain-Pays Du Cerdon
Code de la commune de rattachement=01056  Libellé de la commune de rattachement=Boyeux-Saint-Jérôme
Nom de l'élu=TURPIN  Prénom de l'élu=Juvénal  Code sexe=M  Date de début du mandat=2026-03-15
Libellé de la fonction=5eme Vice-président du conseil communautaire  Date de début de la fonction=2026-03-15
```

Canon : l'EPCI `INSEE:siren:200029999` (`{"type": "epci", "type_source": "EPCI", "nom": "Cc Rives De L'Ain-Pays Du Cerdon"}`,
un document par SIREN) ; la fiche `mandat_rne` avec `organisation_id` = l'EPCI, `commune_id` =
`INSEE:commune:01056`, `fonction` « 5eme Vice-président du conseil communautaire ».

### Député — `RNE:mandat:depute:0101:2024-07-08`

Brut : `elus_deputes_dep_csv.csv` : `Code de la circonscription législative=0101  Nom de l'élu=BRETON  Prénom de l'élu=Xavier  Date de début du mandat=2024-07-08`.

Canon : fiche `mandat_rne` (type depute, circonscription `0101`), `personne_id` vide. Un cas
`elu_local` de **priorité 1** propose l'acteur AN homonyme avec l'indice
`meme_siege_meme_date: true` : l'AMO publie pour lui la même circonscription (Ain, 1re) et la même
prise de fonction (2024-07-08). C'est un indice fort, **pas une preuve** : le RNE ne cite aucun
identifiant AN, le relecteur décide.

### Regroupement de deux mandats par la revue

Deux lignes réelles portent le même nom dans l'Ain : la maire de L'Abergement-Clémenciat et une
conseillère communautaire de la CC de la Dombes (`200069193`) rattachée à la même commune, avec la
même CSP. C'est probablement la même personne, mais rien dans le RNE ne le prouve : la procédure,
rejouée telle quelle par le test, est la suivante (aucune décision n'est prise dans la base) :

1. au chargement, deux fiches et deux cas `elu_local` (priorité 2 : homonymes locaux seulement) ;
2. `python -m src revue decider elu_local:maire:01001:2026-03-23 --choix aucun --par <nom>` : une
   personne `RNE:personne:maire:01001:2026-03-23` est créée et reliée au mandat de maire ;
3. au chargement suivant, le cas du mandat EPCI propose cette personne (`etablie_par_revue`) ;
4. `revue decider elu_local:conseiller_communautaire:… --choix 0 --par <nom> --motif "même nom, CSP et commune"` ;
5. les deux fiches ont le même `personne_id`, et la décision tient aux relectures du RNE.

Code : [mandat()](../../src/adaptateurs/sources/rne/__init__.py#L163), [cle()](../../src/adaptateurs/sources/rne/__init__.py#L87),
[valeurs()](../../src/adaptateurs/sources/rne/__init__.py#L112), [lignes()](../../src/adaptateurs/sources/rne/__init__.py#L77),
[Annuaire](../../src/adaptateurs/sources/rne/__init__.py#L136), [sieges_an()](../../src/adaptateurs/sources/rne/__init__.py#L215),
[epci()](../../src/adaptateurs/sources/rne/__init__.py#L186), [appliquer()](../../src/revue.py#L110) (« aucun » avec création),
[charger_decisions()](../../src/chargement.py#L236) ·
Tests : [test_cles_locales_stables](../../tests/test_sources_rne.py#L61),
[test_date_de_naissance_jamais_lue](../../tests/test_sources_rne.py#L67),
[test_fiche_seule_sans_homonyme](../../tests/test_sources_rne.py#L77),
[test_homonyme_du_departement_en_revue](../../tests/test_sources_rne.py#L83),
[test_depute_meme_siege_indice_pas_preuve](../../tests/test_sources_rne.py#L91),
[test_regroupement_par_revue](../../tests/test_sources_rne.py#L130) (rejoué sur Postgres)

### Personne établie par revue qui est un parlementaire : fusion

Brut : la même ligne `elus_deputes_dep_csv.csv` (`0101`, BRETON Xavier, 2024-07-08) ; l'AMO publie
`json/acteur/PA330008.json` (Xavier Breton). Si le cas `elu_local:depute:0101:2024-07-08` a été
décidé « aucun », la fiche est reliée à une personne `RNE:personne:depute:0101:2024-07-08`, distincte
de l'acteur AN. Quand une personne établit que c'est le député (fiche AN, même siège, même prise de
fonction), elle demande la fusion (aucune décision n'est prise dans la base) :

```
python -m src revue fusionner RNE:personne:depute:0101:2024-07-08 AN:acteur:PA330008 --type personne \
       --par <nom> --motif "même circonscription, même prise de fonction, fiche AN"
```

Canon attendu : un cas `fusion_entites:RNE:personne:depute:0101:2024-07-08` appliqué ;
`RNE:personne:depute:0101:2024-07-08` relié à l'acteur en `MANUAL` (preuve : ce cas), sa
correspondance d'origine `REJECTED` (`fusionnee_dans`) ; la fiche `mandat_rne` et tous les mandats
reliés à la personne RNE ont `personne_id` = l'acteur ; le candidat du cas `elu_local` désigne
l'acteur, si bien que la décision tient aux relectures du RNE ; la personne RNE est gardée, marquée
`fusionnee_dans` (procédure : [rapprochements.md §7](../rapprochements.md)).

Code : [fusionner()](../../src/revue.py#L191), [RegistreIdentites.fusionner()](../../src/identites.py#L96) ·
Test : [test_personne_rne_fusionnee_avec_un_parlementaire](../../tests/test_fusion.py#L144) (rejoué sur Postgres)

## Limites

- **Instantané, sans historique** : un mandat terminé disparaît de la livraison suivante. Exemple :
  Patrick Chaize figure comme sénateur dans la livraison du 11/08/2026, alors que le Sénat le
  marque « ANCIEN ». La frise des mandats locaux passés suppose d'archiver chaque livraison
  (décision ouverte n° 8) ; pour les sénateurs, `ODSEN_MANDAT_LOCAL` donne aussi des mandats locaux
  passés, avec un matricule.
- Volume de revue : environ 57 000 mandats ont un homonyme dans leur département (28 560 groupes),
  plus les homonymes parlementaires. Rien n'est validé en lot.
- Communes des collectivités d'outre-mer (975…, 986…, 987…) : absentes du COG chargé, la fiche
  garde le libellé publié sans `organisation_id`.
