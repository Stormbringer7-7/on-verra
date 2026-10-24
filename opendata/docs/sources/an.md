# Assemblée nationale — data.assemblee-nationale.fr

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Fréquence** : archives régénérées chaque nuit (Last-Modified entre 00 h et 06 h), téléchargement conditionnel en If-Modified-Since.
- **Base** : `https://data.assemblee-nationale.fr/static/openData/repository/17/…`. Pour les documents unitaires : `https://www.assemblee-nationale.fr/dyn/opendata/<uid>.{xml,html}`.
- **Format** : archives zip contenant un JSON par objet, rangé par type (`json/<type>/<uid>.json`), sauf Syceron, qui est en XML.
- **Profondeur** : l'AMO couvre tout l'historique ; les autres jeux, la législature demandée (14 à 17).

## Jeux

| Jeu | Fichier (Mo, objets) | Objet | Identifiant |
|---|---|---|---|
| AMO30 acteurs, mandats, organes | `amo/…/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip` (14, 14 053) | personnes, mandats (tous types : ASSEMBLEE, GOUVERNEMENT, commissions, GP), organes | `PA…`, `PM…`, `PO…` |
| Dossiers législatifs | `loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip` (11, 10 863) | dossiers et arbre des **actes** (étapes), documents | `DLR5L17N…`, actes `L17-VD…`, documents `PIONANR5L17B…`, `PRJLANR…`, `RAPPANR…` |
| Amendements | `loi/amendements_div_legis/Amendements.json.zip` (347, 142 089) | amendements | `AMANR5L17PO<organe>B<texte>P0D1N<numéro>` |
| Scrutins | `loi/scrutins/Scrutins.json.zip` (28, 9 097) | scrutins publics et votes nominatifs | `VTANR5L17V<n>` |
| Syceron | `vp/syceronbrut/syseron.xml.zip` (60, 640) | comptes rendus intégraux de **séance publique** | `CRSANR5L17S<année>O1N<n>` |
| Agenda | `vp/reunions/Agenda.json.zip` (8,5, 8 142) | réunions (séances, commissions), ordres du jour, présences, personnes auditionnées | `RUANR5L17S<année>IDS…` (séance), `…IDC…` (commission) |
| Questions | `questions/questions_gouvernement`, `questions_ecrites`, `questions_orales_sans_debat` (5 + 50 + 3 ; 1 800 + 19 165 + 828) | questions au Gouvernement, écrites, orales | `QANR5L17QG…`, `QE…`, `QOSD…` |
| Documents unitaires | `dyn/opendata/<uid>.xml` (métadonnées) et `.html` (texte) | textes, rapports, comptes rendus de commission | uid du document |

## Champs utiles au design

**Dossier** (`dossierParlementaire`) :
- `uid`, `legislature`, `procedureParlementaire/{code,libelle}`, `titreDossier/{titre, titreChemin, senatChemin}` ;
- `initiateur/acteurs/acteur/{acteurRef, mandatRef}` ou `initiateur/organes` (Gouvernement : `PO…`).

**Actes** (`actesLegislatifs/acteLegislatif`, arbre récursif) :
- `codeActe`, par exemple `AN1-DEPOT`, `AN1-COM-FOND-SAISIE`, `AN1-COM-FOND-NOMIN`, `AN1-COM-FOND-REUNION`, `AN1-DEBATS-SEANCE`, `AN1-DEBATS-DEC`, `SN1-…`, `CMP-…`, `ANNLEC-…`, `ANLDEF-…`, `CC-…`, `PROM-PUB` ;
- `@xsi:type` : `Etape_Type`, `DepotInitiative_Type`, `ProcedureAccelere_Type`, `DiscussionSeancePublique_Type`, `Decision_Type`, `Promulgation_Type`… ;
- `dateActe`, `organeRef`, `rapporteurs/rapporteur/acteurRef`, `reunionRef`, `odjRef`, `voteRefs/voteRef`, `textesAssocies/texteAssocie/refTexteAssocie`, `texteAdopte`, `statutConclusion/{fam_code, libelle}` (« adopté », « Accord », « Désaccord »…) ;
- pour une décision du CC : `casSaisine`, `numDecision`, `urlConclusion` ;
- pour une promulgation : `codeLoi`, `infoJO/{numJO, referenceNOR, urlLegifrance}`, `texteLoiRef`.

**Document** :
- `uid`, `classification/{type, sousType, famille}`, `titres`, `dossierRef`, `auteurs`, `coSignataires`, `organesReferents`, `notice/numNotice` ;
- `divisions` (tomes, annexes de rapport).

**Amendement** :
- `uid`, `examenRef`, `texteLegislatifRef`, `seanceDiscussionRef`, `identification/{numeroLong, prefixeOrganeExamen}` ;
- `signataires/{auteur/{acteurRef, typeAuteur, groupePolitiqueRef, gouvernementRef, auteurRapporteurOrganeRef}, cosignataires/acteurRef[], libelle}` ;
- `pointeurFragmentTexte/division/{titre, articleDesignation, type, articleAdditionnel, urlDivisionTexteVise}`, `…/alinea` ;
- `corps/contenuAuteur/{dispositif, exposeSommaire}` (HTML échappé) ;
- `cycleDeVie/{dateDepot, dateSort, sort, etatDesTraitements}`, `discussionCommune`, `discussionIdentique`, `amendementParentRef` (sous-amendements).
- **Absents** : avis du rapporteur et du Gouvernement.

**Scrutin** : `miseAuPoint/{pours, contres, abstentions, nonVotants, nonVotantsVolontaires}/votant/acteurRef`
et `miseAuPoint/dysfonctionnement/{pour, contre, abstentions, nonVotants, nonVotantsVolontaires}` :
ce que le député a fait savoir après le scrutin, à côté du décompte nominatif.

**Question** (`question`, une par fichier `json/<uid>.json`) :
- `uid`, `type` (QG, QE, QOSD), `identifiant/{numero, legislature}`, `indexationAN/{rubrique, analyses/analyse}` ;
- `auteur/{identite/{acteurRef, mandatRef}, groupe/organeRef}`, `minInt/organeRef` (ministère interrogé),
  `minAttribs/minAttrib[]/{denomination/organeRef, infoJO}` (attributions successives) ;
- `textesQuestion/texteQuestion`, `textesReponse/texteReponse` (`texte`, `infoJO/{typeJO, dateJO, pageJO}`, `erratum`) ;
- `cloture/{codeCloture, libelleCloture, dateCloture}`, `signalement`, `renouvellements`.
- **Absents** : l'acteur du ministre qui répond, la séance d'une QAG ou d'une QOSD.

**Syceron** (`compteRendu/contenu/…/point/paragraphe`) :
- `@id_acteur` (PA), `@id_mandat`, `@ordre_absolu_seance`, `@ordinal_prise`, `texte@stime` (secondes depuis l'ouverture), `@code_grammaire` (type de prise de parole), `@roledebat`, `@art` et `@adt` (article et amendement en discussion), `@valeur_ptsodj` (point de l'ordre du jour) ;
- `orateurs/orateur/{id, nom, qualite}`.

C'est la source des **discussions en séance**, avec des identifiants officiels.

**Réunion** (agenda) :
- `@xsi:type` (`seance_type`, `reunionCommission_type`), `organeReuniRef`, `compteRenduRef` ;
- `ODJ/pointsODJ/pointODJ/{objet, typePointODJ, dossiersLegislatifsRefs/dossierRef}` ;
- `participants/participantsInternes/participantInterne/{acteurRef, presence}`, `participants/personnesAuditionnees`.

C'est la source de la **prochaine étape**, des présences et des **auditions**.

**Compte rendu de commission** (`dyn/opendata/CRCANR….html`) :
- un paragraphe par prise de parole, orateur en gras (« M. Alexis Corbière, rapporteur. ») ;
- pas d'`acteurRef` ; Word et PDF existent aussi (docparl).

**Texte** (`dyn/opendata/<uid>.html`) :
- HTML issu de Word, classes `assnat9ArticleNum` (numéro d'article) et `assnatLoiTexte` (corps) ;
- découpable par article, sans identifiant d'alinéa.

## Vérifications faites

- `senatChemin` est présent sur les 124 dossiers échantillonnés. Sa clé (`ppl21-419`) existe dans `dosleg.loi.signet`.
- Acte `PROM-PUB` : `referenceNOR` présent sur les 6 promulgations échantillonnées.
- 2 388 dossiers législatifs en 17e législature (types `DossierLegislatif_Type`).

## Exemples réels : de la source au canon

Relevés le 24/10/2026 sur le dossier prototype **DLR5L17N54085** (projet de loi d'urgence pour la
protection et la souveraineté agricoles). Pour chaque objet : l'extrait brut tel que publié, la
ligne canonique produite, la fonction qui fait la transformation et le test qui la prouve. Les
liens vers le code sont vérifiés par [test_chaque_lien_pointe_sur_sa_definition](../../tests/test_docs.py#L57).
Les UUID changent d'une base à l'autre : seuls les identifiants natifs sont stables.

Chaîne commune à tous les objets : chaque document brut est enregistré par son empreinte sha256
([charger()](../../src/chargement.py#L80)), analysé par l'adaptateur, puis écrit avec sa provenance
(fichier, membre de l'archive, pointeur JSON) par [ecrire()](../../src/chargement.py#L115). Une
identité native connue donne toujours la même entité ([RegistreIdentites.identifier()](../../src/identites.py#L47),
prouvé par [test_meme_identifiant_meme_entite](../../tests/test_identites.py#L28)).

### Dossier législatif — `AN:dossier:DLR5L17N54085`

Brut : `dossiers.json.zip` › `json/dossierParlementaire/DLR5L17N54085.json`

```json
{"uid": "DLR5L17N54085", "legislature": "17",
 "titreDossier": {"titre": "Projet de loi d’urgence pour la protection et la souveraineté agricoles",
                  "titreChemin": "projet_loi_urgence_pour_protection_et_souverainete_agricoles",
                  "senatChemin": "http://www.senat.fr/dossier-legislatif/pjl25-689.html"},
 "procedureParlementaire": {"code": "1", "libelle": "Projet de loi ordinaire"},
 "initiateur": {"acteurs": {"acteur": [{"acteurRef": "PA643210", "mandatRef": "PM873637"},
                                       {"acteurRef": "PA605991", "mandatRef": "PM873649"}]}}}
```

Canon (`canon.dossier`) :

| Champ | Valeur | Règle |
|---|---|---|
| `titre` | Projet de loi d’urgence pour la protection et la souveraineté agricoles | `titreDossier/titre` tel quel |
| `type_procedure` | Projet de loi ordinaire | `procedureParlementaire/libelle` |
| `procedure_acceleree` | true | un acte `ProcedureAccelere_Type` existe dans l'arbre |
| `initiative` | gouvernement | texte déposé `PRJL…` (projet de loi, Constitution art. 39) ; `PION…`/`PNRE…` = parlementaire |
| `date_depot` | 2026-04-08 | date du premier acte de dépôt |

Identités de l'entité : `AN:dossier:DLR5L17N54085` (OFFICIAL_ID) et `SENAT:dossier:pjl25-689`
(EXPLICIT_REFERENCE : la clé est lue dans `senatChemin`, un `Rapprochement` vérifié).

> Les deux ministres apparaissent comme « acteurs » initiateurs : déduire l'initiative de leur
> présence classait ce projet de loi en « parlementaire ». Corrigé le 24/10/2026, la règle lit le
> texte déposé.

Code : [dossier()](../../src/adaptateurs/sources/an/dossiers.py#L96) ·
Tests : [test_etapes_publiees_avec_identite_composite](../../tests/test_sources_an.py#L121),
[test_projet_de_loi_initiative_gouvernement_meme_avec_ministres_initiateurs](../../tests/test_sources_an.py#L131)

### Étapes (actes) — `AN:etape:DLR5L17N54085:<uid de l'acte>`

Brut : l'arbre `actesLegislatifs` du même fichier. Quatre actes du dossier :

```json
{"@xsi:type": "Decision_Type", "uid": "L17-VD232288DEC", "codeActe": "AN1-DEBATS-DEC",
 "dateActe": "2026-06-02T00:00:00.000+02:00", "statutConclusion": {"fam_code": "TSORTF01", "libelle": "adopté"},
 "reunionRef": "RUANR5L17S2026IDS30660", "voteRefs": {"voteRef": "VTANR5L17V7259"}}
{"@xsi:type": "Decision_Type", "uid": "L17-VD232958DEC", "codeActe": "CMP-DEC",
 "dateActe": "2026-07-17T00:00:00.000+02:00", "statutConclusion": {"libelle": "Accord"}}
{"@xsi:type": "ConclusionEtapeCC_Type", "uid": "L17-VD233384CCC", "codeActe": "CC-CONCLUSION",
 "statutConclusion": {"libelle": "Partiellement conforme"}, "numDecision": "914", "anneeDecision": "2026",
 "urlConclusion": "http://www.conseil-constitutionnel.fr/decision/2026/2026914DC.htm"}
{"@xsi:type": "Promulgation_Type", "uid": "L17-VD233515PL", "codeActe": "PROM-PUB", "codeLoi": "2026-796",
 "infoJO": {"numJO": "192", "dateJO": "2026-08-19+02:00", "referenceNOR": "AGRS2603566L"}}
```

Ce qui en sort :
- une ligne `canon.etape` par acte : type déduit de `@xsi:type` (lecture, depot, seance, decision,
  cmp, conseil_constitutionnel, promulgation…), parent, organe, dates, conclusion ;
- `voteRefs` relie l'étape au scrutin `VTANR5L17V7259` (identifiant interne AN, jamais par le titre) ;
- `numDecision` + `anneeDecision` donnent la décision `CONSTIT:decision:2026-914`
  ([decision()](../../src/adaptateurs/sources/constit/__init__.py#L23)) ;
- `referenceNOR` donne le texte publié `LEGIFRANCE:nor:AGRS2603566L` (loi n° 2026-796, JO n° 192).

L'identité d'une étape est composite (`dossier:acte`), parce qu'un même uid d'acte peut être repris
d'un dossier à l'autre. Code : [actes()](../../src/adaptateurs/sources/an/dossiers.py#L64),
[type_etape()](../../src/adaptateurs/sources/an/dossiers.py#L48) ·
Test : [test_etapes_publiees_avec_identite_composite](../../tests/test_sources_an.py#L121)

### Personne et mandat — `AN:acteur:PA793432`

Brut : `acteurs.json.zip` › `json/acteur/PA793432.json`

```json
{"etatCivil": {"ident": {"civ": "M.", "prenom": "Franck", "nom": "Allisio"}},
 "mandats": {"mandat": [{"uid": "PM796323", "typeOrgane": "ASSEMBLEE", "legislature": "16",
   "dateDebut": "2022-06-19", "dateFin": "2024-06-09",
   "election": {"lieu": {"departement": "Bouches-du-Rhône", "numDepartement": "13", "numCirco": "12"}},
   "mandature": {"datePriseFonction": "2022-06-22", "causeFin": "Fin de législature"},
   "organes": {"organeRef": "PO791932"}}, "…"]}}
```

Canon :
- `canon.personne` : `{"civilite": "M.", "prenom": "Franck", "nom": "Allisio", "nom_affiche": "Franck Allisio"}` ;
- `canon.fonction` (`AN:mandat:PM796323`) : type `depute`, début = **prise de fonction** (2022-06-22,
  pas la date d'élection), fin 2024-06-09, législature 16 ;
- `canon.lien` mandat → territoire `INSEE:departement:13`, attribut `circonscription: "12"` (code
  INSEE publié par l'AMO : référence explicite, cf. [docs/sources/insee.md](insee.md)).

Identités de la personne : `AN:acteur:PA793432` (OFFICIAL_ID) et
`HATVP:declarant:allisio-franck-24180` (EXPLICIT_REFERENCE, `id_origine` de la HATVP, cf.
[hatvp.md](hatvp.md)).

Fiche Sénat citée : l'AMO publie pour 1 049 acteurs une adresse de type 23 « Url sénateur ». Pour
`PA794906` (Gabriel Amard, député jusqu'au 30/09/2026, puis sénateur) :
`{"type": "23", "valElec": "https://www.senat.fr/senateur/amard_gabriel20684b.html"}` → identité
`SENAT:senateur:20684B` reliée à la même personne (EXPLICIT_REFERENCE) ; la fiche sénateur et ses
mandats sont fusionnés dans l'acteur (cf. [rapprochements.md](../rapprochements.md), Fusion d'entités).
Code : [fiche_senat()](../../src/adaptateurs/sources/an/acteurs.py#L153) ·
Test : [test_amo_cite_la_fiche_senat_fusion_sans_revue](../../tests/test_fusion.py#L92). Les groupes d'amitié et d'études (GA, GE, GEVI) ne sont pas chargés.

Code : [acteur()](../../src/adaptateurs/sources/an/acteurs.py#L82), [organe()](../../src/adaptateurs/sources/an/acteurs.py#L53),
[titre()](../../src/adaptateurs/sources/an/acteurs.py#L67)

### Scrutin, votes nominatifs, positions de groupe — `AN:scrutin:VTANR5L17V7259`

Brut : `scrutins.json.zip` › `json/VTANR5L17V7259.json`

```json
{"uid": "VTANR5L17V7259", "numero": "7259", "dateScrutin": "2026-06-02",
 "titre": "l'ensemble du projet de loi d'urgence pour la protection et la souveraineté agricoles (première lecture).",
 "sort": {"code": "adopté"}, "modePublicationDesVotes": "DecompteNominatif",
 "syntheseVote": {"nombreVotants": "562", "suffragesExprimes": "547",
                  "decompte": {"nonVotants": "1", "pour": "369", "contre": "178", "abstentions": "15"}},
 "ventilationVotes": {"organe": {"groupes": {"groupe": [{"organeRef": "PO845401", "nombreMembresGroupe": "122",
   "vote": {"positionMajoritaire": "pour", "decompteVoix": {"pour": "120", "contre": "0", "abstentions": "0"},
            "decompteNominatif": {"pours": {"votant": [{"acteurRef": "PA793432", "mandatRef": "PM840276",
                                                         "parDelegation": "true", "numPlace": "063"}, "…"]}}}}, "…"]}}}}
```

Canon :
- `canon.scrutin` : `{"numero": "7259", "date": "2026-06-02", "nature": "ensemble", "type_vote": "scrutin public solennel",
  "votants": 562, "pour": 369, "contre": 178, "abstentions": 15, "non_votants": 1, "sort": "adopté"}`,
  `dossier_id` et `etape_id` par l'acte qui cite `VTANR5L17V7259` (pas par le titre) ;
- `canon.vote` : Franck Allisio (`PA793432`), `pour`, `par_delegation = true`, groupe `PO845401` ;
- `canon.position_groupe` : RN (`PO845401`), 122 membres, 120 pour, position majoritaire **recalculée**
  depuis le décompte (la valeur publiée par l'AN est parfois fausse ; aucune en cas d'égalité).

`nature` est lue dans le titre (« l'ensemble », « l'amendement n° », « l'article »…) : un libellé,
pas un lien. Le lien scrutin → amendement passe par le numéro cité **et** le dossier de l'étape ;
un numéro ambigu ou introuvable part en revue (`amendement_ambigu`, `amendement_introuvable`).

Code : [scrutin()](../../src/adaptateurs/sources/an/scrutins.py#L78), [majoritaire()](../../src/adaptateurs/sources/an/scrutins.py#L58),
[nature()](../../src/adaptateurs/sources/an/scrutins.py#L39) ·
Tests : [test_scrutin](../../tests/test_sources_an.py#L270), [test_nature](../../tests/test_sources_an.py#L291)

### Amendement — `AN:amendement:AMANR5L17PO838901BTC2765P0D1N000357`

Brut : `amendements.json.zip` › `json/DLR5L17N54085/PRJLANR5L17BTC2765/AMANR5L17PO838901BTC2765P0D1N000357.json`

```json
{"identification": {"numeroLong": "357", "prefixeOrganeExamen": "AN"},
 "signataires": {"auteur": {"typeAuteur": "Député", "acteurRef": "PA718838", "groupePolitiqueRef": "PO845425"}},
 "pointeurFragmentTexte": {"division": {"articleDesignationCourte": "AVANT ART. PREMIER",
                                        "urlDivisionTexteVise": "/17/textes/2765.asp#D_TITRE_Ier_2"}},
 "cycleDeVie": {"dateDepot": "2026-05-13", "dateSort": "2026-05-19T…", "sort": "Adopté"},
 "corps": {"contenuAuteur": {"dispositif": "<p>Compléter l’intitulé par le mot : « française ».</p>",
                             "exposeSommaire": "<p>Amendement rédactionnel</p>"}}}
```

Canon (`canon.amendement`) : numéro 357, `sort = adopte` (`sort_source` « Adopté » gardé), division
« AVANT ART. PREMIER », texte visé `PRJLANR5L17BTC2765`, séance de discussion, organe d'examen ;
dispositif et exposé en HTML **tels que publiés**. Liens (`canon.lien`) : `auteur` → `PA718838`,
`cosignataire` → 9 députés (ordre publié), `groupe_auteur` → `PO845425`.

Ce que l'AN ne publie pas : les avis du rapporteur et du Gouvernement (le Sénat, oui).

Code : [amendement()](../../src/adaptateurs/sources/an/amendements.py#L112), [sort()](../../src/adaptateurs/sources/an/amendements.py#L28) ·
Tests : [test_amendement](../../tests/test_sources_an.py#L239), [test_irrecevable_sans_sort](../../tests/test_sources_an.py#L259)

#### Article suivi et étape de l'amendement

Brut : `amendements.json.zip` › `json/DLR5L17N54085/PRJLANR5L17B2632/AMANR5L17PO419610B2632P0D1N000154.json`
(amendement CE154 de la commission des affaires économiques, sur le projet de loi déposé) :

```json
{"uid": "AMANR5L17PO419610B2632P0D1N000154", "texteLegislatifRef": "PRJLANR5L17B2632",
 "pointeurFragmentTexte": {"division": {"titre": "Article 4", "articleDesignationCourte": "ART. 4",
   "articleDesignation": "ARTICLE 4", "type": "ARTICLE", "avant_A_Apres": "A",
   "divisionRattachee": {"@xsi:nil": "true"}, "articleAdditionnel": "false", "chapitreAdditionnel": "false",
   "urlDivisionTexteVise": "/17/textes/2632.asp#D_Article_4"}}}
```

et `dossiers.json.zip` › `json/dossierParlementaire/DLR5L17N54085.json` (condensé) :

```json
{"titreDossier": {"senatChemin": "http://www.senat.fr/dossier-legislatif/pjl25-689.html"},
 "actesLegislatifs": {"acteLegislatif": [{"codeActe": "AN1", "uid": "L17-AN1-54085", "actesLegislatifs": …
   {"codeActe": "AN1-DEPOT", "uid": "L17-VD231245DI", "texteAssocie": "PRJLANR5L17B2632"},
   {"codeActe": "AN1-COM-FOND", "uid": "L17-VD231246CF", "organeRef": "PO419610"},
   {"codeActe": "AN1-COM-AVIS", "uid": "L17-VD231318CA", "organeRef": "PO419865"},
   {"codeActe": "AN1-DEBATS", "uid": "L17-AN1-DEBATS-54085", "organeRef": "PO838901"}]}}
```

Canon : `canon.amendement.article_suivi_id` → `CIVICTRACE:article_suivi:SENAT:dossier:pjl25-689#4`
(l'AN cite le dossier du Sénat : même clé que les textes des deux chambres) ; `etape_id` →
`AN:acte:DLR5L17N54085:L17-VD231246CF` (AN1-COM-FOND : la lecture AN1 cite le texte visé, l'organe
PO419610 de l'uid est celui de l'étape). L'amendement de séance n° 1423 sur le texte de la commission
`PRJLANR5L17BTC2765` (cité par AN1-COM-FOND-RAPPORT) va à AN1-DEBATS ; le conteneur AN1-COM, qui porte
lui aussi l'organe de séance, n'est pas une étape d'examen.

Règles, d'après la division publiée ([article_vise()](../../src/adaptateurs/sources/an/amendements.py#L53)) :

| Division publiée (amendement réel) | Canon |
|---|---|
| `"titre": "Article 4"` (CE154 ci-dessus) | article suivi « 4 » |
| `"titre": "Article PREMIER ter"` (AMANR5L17PO838901B2341P0D2N000001) | « 1 ter » |
| `"titre": "ARTICLE 64 :"` (AMANR5L17PO838901B1906P2D1N001664, titre en capitales) | « 64 » |
| `"type": "ANNEXE", "titre": "ÉTAT B", "divisionRattachee": "ARTICLE 42"` (AMANR5L17PO59048B0324P2D1N001974) | « 42 » : l'article qui porte l'annexe |
| `"avant_A_Apres": "Après", "articleAdditionnel": "true"` (« APRÈS L'ARTICLE PREMIER, insérer l'article suivant: », AMANR5L17PO419610B2632P0D1N000457) | aucun suivi, pas de revue : l'article n'existe pas encore |
| `"type": "CHAPITRE", "titre": "TITRE Ier"` (n° 357 ci-dessus, « AVANT ART. PREMIER ») et `"type": "TITRE"` (intitulé du texte) | aucun suivi, pas de revue |
| aucune division (AMANR5L17PO419610B3058P0D1N000723) | aucun suivi, pas de revue |
| `"titre": "Article 3 bi"` (AMANR5L17PO419610B1034P0D1N000006) | cas `article_vise_illisible` : « bi » n'est ni un adverbe ni une lettre d'insertion |
| `"titre": "Article Article 2"` (AMANR5L17PO838901BTC2117P0D1N000011, article groupé « D_Article_2_et_3 ») | cas `article_vise_illisible` |

Le numéro est lu dans `titre`, dont la casse distingue « bis » d'une lettre d'insertion « A » ; un
titre en capitales n'a, dans les données, que des numéros simples. `articleDesignation` donne le même
numéro dans les 75 398 cas où `titre` se lit. L'amendement **déclare l'article suivi** qu'il vise
(même identité et mêmes valeurs que les textes) : au 24/10/2026, 9 211 amendements visent un article
absent de la base (texte non publié en HTML, gabarit non découpé, dossier dont les textes ne sont pas
chargés), qui serait sinon une `reference_inconnue`.

Étape ([Examens](../../src/adaptateurs/sources/an/dossiers.py#L232)) : chaque acte racine est une
lecture (un dossier repris d'une législature à l'autre en a plusieurs du même code, « AN2 ») ; ses
étapes d'examen sont les actes `…-COM-FOND`, `…-COM-AVIS`, `…-DEBATS`, `CMP-DEBATS-AN`. Plusieurs
étapes pour le même texte et le même organe : cas `etape_ambigue` (le PLFSS 2025, DLR5L17N50588,
porte deux `CMP-DEBATS-AN`, dont `L17-CMP-DEBATS-AN-50975` d'un autre dossier) ; aucune (séance pas
encore publiée dans le dossier) : vide.

Mesure sur les 142 089 amendements en cache : 98 350 reliés à un article suivi (dont 23 071 par une
annexe), 41 290 additionnels, 2 297 sur un intitulé, un titre, un chapitre ou sans division, 119
rangés sous un dossier absent de l'archive des dossiers (pas de clé de suivi), 33 en revue
`article_vise_illisible` ; 138 182 reliés à une étape, 43 en revue `etape_ambigue`, 3 864 sans étape.

Code : [article_vise()](../../src/adaptateurs/sources/an/amendements.py#L53), [numero_publie()](../../src/adaptateurs/sources/an/amendements.py#L45),
[rattachement()](../../src/adaptateurs/sources/an/amendements.py#L82), [Examens](../../src/adaptateurs/sources/an/dossiers.py#L232),
[cle_suivi()](../../src/adaptateurs/sources/an/dossiers.py#L89) ·
Tests : [test_divisions_reelles](../../tests/test_amendements_articles.py#L87), [test_commission_au_fond](../../tests/test_amendements_articles.py#L123),
[test_commission_pour_avis_et_seance](../../tests/test_amendements_articles.py#L134), [test_etape_ambigue_en_revue](../../tests/test_amendements_articles.py#L158),
[test_lectures_reprises_distinctes](../../tests/test_amendements_articles.py#L168), [test_sans_etape_publiee](../../tests/test_amendements_articles.py#L174)

### Intervention en séance — `AN:intervention:CRSANR5L17S2026O1N237#4091148`

Brut : `comptes_rendus.xml.zip` › `xml/compteRendu/CRSANR5L17S2026O1N237.xml`

```xml
<paragraphe valeur_ptsodj="1" ordre_absolu_seance="56" id_acteur="PA719024" id_mandat="PM842390"
            code_grammaire="PAROLE_GENERIQUE" id_syceron="4091148">
  <orateurs><orateur><nom>M. le président</nom><id>719024</id><qualite/></orateur></orateurs>
  <texte stime="1438.76">J’appelle maintenant, dans le texte de la commission, les articles du projet de loi.</texte>
</paragraphe>
<point … code_grammaire="DISC_ARTICLES_2_4" bibard=" 2765" art="Avant_ 1er" adt="">…</point>
```

Canon (`canon.intervention`) : un **tour de parole** (paragraphes consécutifs du même orateur
regroupés), ordre 37, horodatage 1 438,76 s, orateur `PA719024` (identifiant officiel du compte
rendu), libellé « M. le président », texte intégral :

> J’appelle maintenant, dans le texte de la commission, les articles du projet de loi.
> La parole est à M. Fabrice Brun, pour soutenir l’amendement no 357.

Sujet : dossier par le numéro de texte cité (`bibard` 2765 → DLR5L17N54085), article « Avant_ 1er »
tel que publié, amendement 357 (`AMANR5L17PO838901BTC2765P0D1N000357`) par le numéro cité dans la
même réunion. Empreinte sha256 du texte et `tsvector` français pour la recherche.

Règles : `PA0` = voix collective (pas d'orateur) ; un `PA` hors référentiel = cas
`orateur_sans_identifiant` ; plusieurs amendements en discussion commune = liens vers tous, sans choisir.

Code : [seance()](../../src/adaptateurs/sources/an/seances.py#L55), [numeros_cites()](../../src/adaptateurs/sources/an/seances.py#L36) ·
Tests : [test_tour_de_parole_regroupe_les_paragraphes_consecutifs](../../tests/test_sources_an.py#L50),
[test_numero_de_texte_rattache_au_dossier](../../tests/test_sources_an.py#L61),
[test_voix_collective_et_identifiant_hors_referentiel](../../tests/test_sources_an.py#L75),
[test_discussion_commune_liens_sans_choisir](../../tests/test_sources_an.py#L65)

### Intervention en commission — `AN:intervention:CRCANR5L17S2026PO419865N040#14`

Brut : `commissions/CRCANR5L17S2026PO419865N040.html` (HTML unitaire, orateur en gras, **sans
identifiant**) ; la réunion `RUANR5L17S2026IDC459802` vient de l'agenda (`compteRenduRef`), avec
74 participants dont 28 présents.

Canon : orateur_libelle « M. Mathieu Lefèvre », qualité « ministre délégué », texte intégral
(« S’agissant des zones humides, l’article ne fait que rappeler le principe de proportionnalité… »),
**`orateur_id` vide**. Un cas `orateur_commission` propose l'acteur AN `PA795386` (homonyme, indices :
député, membre du Gouvernement, présence à la réunion). Rien n'est relié avant une décision humaine.

Code : [compte_rendu()](../../src/adaptateurs/sources/an/commissions.py#L97),
[candidats_orateur()](../../src/adaptateurs/sources/an/cas.py#L28) ·
Tests : [test_decoupage](../../tests/test_sources_an.py#L192), [test_compte_rendu_sans_reunion_ignore](../../tests/test_sources_an.py#L231)

### Réunion, ordre du jour, présences — agenda

Brut : `agenda.json.zip` (`reunion` : `@xsi:type`, `organeReuniRef`, `compteRenduRef`,
`ODJ/pointsODJ/pointODJ/{objet, dossiersLegislatifsRefs}`, `participants/participantInterne/{acteurRef, presence}`).
Canon : `canon.reunion`, `canon.point_odj` (avec `etat`), `canon.participation` (présent, excusé,
absent : la base de l'indicateur de présence en commission), `canon.audition`, `canon.evenement_agenda`.

Code : [reunion()](../../src/adaptateurs/sources/an/agenda.py#L20) · Test : [test_reunion_points_presences](../../tests/test_sources_an.py#L147)

### Textes et articles — `AN:version_texte:<uid>`, `AN:article:<uid>#<numéro>`

Brut : `dyn/opendata/<uid>.html` (HTML issu de Word, cache `data/brut/an/textes/`). Un paragraphe
de classe `assnat9ArticleNum` ouvre un article, les paragraphes `assnatLoiTexte` en sont le corps.
Les cas réels relevés le 24/10/2026 et ce que le découpage en fait :

| HTML publié (condensé) | Texte | Canon |
|---|---|---|
| `<p class="assnat9ArticleNum">Article 1<sup>er</sup><br />Rectification des tableaux d’équilibre</p>` | PRJLANR5L17B3211 (PLFSS) | numéro « 1 », intitulé « Rectification des tableaux d’équilibre » (le `<br/>` sépare les deux lignes) |
| `Article 4` puis un second `assnat9ArticleNum` « (Supprimé) » | PIONANR5L17B0872 | un seul article « 4 », mention « Supprimé », statut `supprime` |
| `Article 3<br /><span>Supprimé</span>` | PIONANR5L17B0013 | « 3 », mention « Supprimé » (formule exacte sur sa ligne, sinon c'est un intitulé) |
| `Article 2` puis « (Non modifié) », puis le corps | PRJLANR5L17BTC1617 | « 2 », statut `non_modifie`, corps complet |
| `Articles 2 et 3` puis « (Supprimés) » | PIONANR5L17B1034 | deux versions, « 2 » et « 3 », chacune suivie, statut `supprime` |
| `Articles 19 bis A à 19 bis C` puis « (Supprimés) » | PRJLANR5L17B3017 | une version au libellé publié, **sans suivi**, cas `articles_plage` (les articles intermédiaires ne sont pas connus) |
| `……………………………………` | PRJLANR5L17BTC0920 | ignoré : articles non reproduits dans un texte comparatif |
| « Délibéré en séance publique, à Paris, le… », signature | PIONANR5L17B0013 | fin des articles : n'entre pas dans le corps du dernier |
| aucun `assnat9ArticleNum` (autre gabarit Word) | PIONANR5L17B0062 et 72 autres | `version_texte` seule, cas `texte_non_decoupe` (titres probables comptés en indice, jamais devinés) |

Un numéro a une forme stricte (« 3 », « 3 bis », « 3 bis A », « 4 septies », « liminaire »,
« unique ») : un intitulé collé, une liste ou une coquille de la source (« Article 2 et 3 », « 25C »)
donne un cas `article_sans_numero`, pas un suivi faux. Mesure sur les 1 127 textes en cache :
11 826 articles simples, 241 intitulés groupés, 81 plages et 9 coquilles en revue (701 cas avant
la correction).

**Texte adopté définitivement** : ses articles sont renumérotés (1 à N, sans « bis ») et ne sont
plus ceux de la navette. DOSLEG le marque (`oritxt.oritxtado = 'D'`, texte AN cité par son URL
`…/textes/l17t0332…` = TA n° 332) : ses versions d'articles sont gardées, **sans suivi**. 87 textes
AN (17e) et 1 451 textes Sénat concernés. Code : [definitifs()](../../src/adaptateurs/sources/senat/textes.py#L34) ·
Test : [test_an_definitif_sans_suivi](../../tests/test_textes.py#L86).

Canon : `canon.version_texte` (nature lue dans l'uid : `B` déposé, `BTC` texte de la commission,
`BTA` adopté), `canon.version_article` (numéro, intitulé, mention, statut `present`, `supprime`,
`conforme` ou `non_modifie`, texte, empreinte), `canon.article_suivi` (clé du dossier + numéro, cf.
[rapprochements.md](../rapprochements.md)). L'identité d'une version est le numéro dans son texte
(le rang seulement sans numéro). À chaque lecture, le texte déclare l'**ensemble** de ses articles :
une version d'une lecture précédente absente est marquée retirée (jamais supprimée), et ses cas
devenus sans objet passent `CADUC`.

Code : [articles()](../../src/adaptateurs/sources/an/textes.py#L59), [version()](../../src/adaptateurs/sources/an/textes.py#L90),
[numero_article()](../../src/textes.py#L19), [numeros_articles()](../../src/textes.py#L52),
[statut_mention()](../../src/textes.py#L76) ·
Tests : [test_cas_reels_du_html](../../tests/test_textes.py#L122), [test_gabarit_sans_balisage_en_revue](../../tests/test_textes.py#L153),
[test_numero_strict](../../tests/test_textes.py#L30), [test_intitules_groupes_et_plages](../../tests/test_textes.py#L37),
[test_mentions](../../tests/test_textes.py#L45), [test_articles_du_html](../../tests/test_textes.py#L107)

### Mise au point de vote — `canon.lien` scrutin → personne, nature `mise_au_point`

Brut : `scrutins.json.zip` › `json/VTANR5L17V1992.json` (scrutin n° 1992 du 22/05/2025, amendement
n° 52 de M. Hetzel à l'article 7 de la proposition de loi relative au droit à l'aide à mourir).
Les catégories vides sont publiées en listes de `null`, un votant seul en objet :

```json
"miseAuPoint": {
  "nonVotants": [null, null], "pours": null, "abstentions": [null, null], "nonVotantsVolontaires": [null, null],
  "contres": {"votant": {"acteurRef": "PA721750", "mandatRef": "PM843647", "parDelegation": "false", "numPlace": "374"}},
  "dysfonctionnement": {"nonVotants": null, "pour": null, "abstentions": null,
    "contre": {"votant": {"acteurRef": "PA342384", "mandatRef": "PM842771", "parDelegation": "false", "numPlace": "637"}},
    "nonVotantsVolontaires": {"votant": {"acteurRef": "PA793342", "mandatRef": "PM842345", "parDelegation": "false", "numPlace": "204"}}}}
```

Dans le décompte nominatif du même scrutin, `PA793342` est publié **contre** (par délégation,
groupe `PO845425`) ; `PA721750` et `PA342384` n'y figurent pas.

Canon : trois lignes `canon.lien` (`de_id` = scrutin, `vers_id` = personne, par `acteurRef`) :

| Personne | `attributs.position` | `cle_publiee` | `dysfonctionnement` | Vote enregistré (`canon.vote`) |
|---|---|---|---|---|
| `PA721750` | contre | `contres` | false | aucun (inchangé) |
| `PA342384` | contre | `contre` | true | aucun (inchangé) |
| `PA793342` | non_votant_volontaire | `nonVotantsVolontaires` | true | contre, par délégation (inchangé) |

Une mise au point est ce que le député **a fait savoir** après le scrutin (« voulait voter… ») :
c'est un fait distinct, « selon la mise au point publiée ». Le vote enregistré et le décompte ne
sont jamais modifiés, et les indicateurs de participation ne la comptent pas
([indicateurs.md](../indicateurs.md)). Le lien est remplacé en bloc à chaque lecture du scrutin.

Mesure sur les 9 097 scrutins en cache : 3 452 mises au point sur 1 664 scrutins, toutes reliées
à un acteur de l'AMO ; 3 289 ordinaires (1 308 pour, 1 237 contre, 285 abstentions, 453
non-votants, 6 non-votants volontaires) et 163 après un dysfonctionnement (82 pour, 57 contre, 9
abstentions, 15 non-votants volontaires). Croisées avec le décompte : 1 556 contredisent le vote
enregistré (par exemple « contre » publiée pour un vote « pour »), 1 013 viennent de députés
absents du décompte nominatif.

Code : [mises_au_point()](../../src/adaptateurs/sources/an/scrutins.py#L63), [MISE_AU_POINT](../../src/adaptateurs/sources/an/scrutins.py#L34) ·
Tests : [test_telles_que_publiees](../../tests/test_mises_au_point.py#L49),
[test_vote_enregistre_inchange](../../tests/test_mises_au_point.py#L57),
[test_sans_mise_au_point_liste_vide](../../tests/test_mises_au_point.py#L64)

### Question au Gouvernement — `AN:question:QANR5L17QG390`

Brut : `questions_gouvernement.json.zip` › `json/QANR5L17QG390.json` (texte condensé) :

```json
{"uid": "QANR5L17QG390", "type": "QG", "identifiant": {"numero": "390", "legislature": "17"},
 "indexationAN": {"rubrique": "outre-mer", "teteAnalyse": null,
                  "analyses": {"analyse": "Continuité territoriale pour les fonctionnaires et militaires ultramarins"}},
 "auteur": {"identite": {"acteurRef": "PA721110", "mandatRef": "PM843782"},
            "groupe": {"organeRef": "PO845485", "abrege": "LIOT"}},
 "minInt": {"organeRef": "PO855072", "abrege": "Outre-mer", "developpe": "Ministère des outre-mer"},
 "minAttribs": {"minAttrib": {"infoJO": {"typeJO": "JO_DEBAT", "dateJO": "2025-02-12"},
                              "denomination": {"organeRef": "PO855072", "developpe": "Ministère des outre-mer"}}},
 "textesQuestion": null,
 "textesReponse": {"texteReponse": {"infoJO": {"typeJO": "JO_DEBAT", "dateJO": "2025-02-12", "pageJO": "1125"},
   "texte": "</p><p align=\"CENTER\"> CONTINUITÉ TERRITORIALE POUR LES FONCTIONNAIRES ET MILITAIRES ULTRAMARINS … <strong>Mme la présidente . </strong>La parole est à Mme Nicole Sanquer. … <strong>M. Manuel Valls,</strong><i> ministre d'État, ministre des outre-mer . </i>Madame la députée, …"}},
 "cloture": {"codeCloture": "REP_PUB", "libelleCloture": "Réponse publiée", "dateCloture": "2025-02-12"}}
```

Canon (`canon.question`) :

| Champ | Valeur | Règle |
|---|---|---|
| `type`, `numero` | QG, 390 | tels que publiés |
| `auteur_id`, `groupe_auteur_id` | `PA721110`, `PO845485` | `acteurRef` et `groupe/organeRef` (identifiants AN) |
| `ministere_interroge_id`, `ministere` | `PO855072`, « Ministère des outre-mer » | `minInt` |
| `ministere_attributaire_id` | `PO855072` | dernière `minAttrib` de la liste publiée |
| `rubrique`, `titre` | « outre-mer », « Continuité territoriale… » | `rubrique`, `analyses/analyse` |
| `date`, `date_reponse`, `page_jo_reponse` | 2025-02-12, 2025-02-12, 1125 | QAG : pas de texte de question à part, la date est celle de l'échange publié au JO débats |
| `texte_question`, `texte_reponse` | vide, l'échange en HTML | tels que publiés |
| `cloture`, `date_cloture` | REP_PUB, 2025-02-12 | `cloture` |

Ce qui **n'est pas** relié : la personne du ministre (Manuel Valls n'est nommé que dans le texte
de l'échange ; aucun `acteurRef`), et la séance (la question ne cite ni réunion ni compte rendu ;
le compte rendu Syceron ne cite pas la question, seulement son titre dans un point `QG_1_1`). Un
rapprochement par date et titre serait une supposition : non fait.

URL : `https://www.assemblee-nationale.fr/dyn/17/questions/QANR5L17QG390`.

### Question écrite — `AN:question:QANR5L17QE10205`

Brut : `questions_ecrites.json.zip` › `json/QANR5L17QE10205.json` (condensé) : question publiée
le 14/10/2025, réattribuée par le décret du 13/10/2025 (gouvernement nommé la veille), signalée,
sans réponse :

```json
{"uid": "QANR5L17QE10205", "type": "QE",
 "auteur": {"identite": {"acteurRef": "PA719412"}, "groupe": {"organeRef": "PO845407", "abrege": "EPR"}},
 "minInt": {"organeRef": "PO873446", "abrege": "Travail, santé, solidarités, familles, autonomie et personnes handicapées"},
 "minAttribs": {"minAttrib": [
   {"infoJO": {"typeJO": "JO_QUESTION", "dateJO": "2025-10-14"}, "denomination": {"organeRef": "PO873446"}},
   {"infoJO": {"typeJO": "JO_LOI_DECRET", "dateJO": "2025-10-13"},
    "denomination": {"organeRef": "PO873673", "developpe": "Ministère de la santé, des familles, de l’autonomie et des personnes handicapées"}}]},
 "textesQuestion": {"texteQuestion": {"infoJO": {"typeJO": "JO_QUESTION", "dateJO": "2025-10-14", "pageJO": "8480"},
                                      "texte": "Mme Sandrine Le Feur attire l'attention de Mme la ministre du travail, …"}},
 "textesReponse": null, "cloture": null,
 "signalement": {"dateDepotSignal": "2026-05-04"}}
```

Canon : `auteur_id` `PA719412`, `ministere_interroge_id` `PO873446`, **`ministere_attributaire_id`
`PO873673`** (la dernière de la liste : les dates JO n'y sont pas toujours croissantes, l'ordre
publié l'est), `date` 2025-10-14, `date_reponse` vide, `publication_jo` :
`{"attributions": [{"organe": "PO873446", "date_jo": "2025-10-14", "type_jo": "JO_QUESTION", …},
{"organe": "PO873673", "date_jo": "2025-10-13", "type_jo": "JO_LOI_DECRET", …}], "errata": [],
"renouvellements": [], "signalement": "2026-05-04"}`.

Errata (`QANR5L17QE10698`) : la réponse du 13/01/2026 (JO p. 148) est republiée le 27/01/2026 avec
un `erratum`. `texte_reponse` garde la première publication ; la seconde va dans
`publication_jo.errata` (`objet` « reponse », date, erratum, texte), sans rien choisir.

Mesure sur les fichiers en cache (17e législature), toutes références explicites :

| Type | Questions | Avec réponse | Auteur relié (`acteurRef` dans l'AMO) | Ministères reliés | Attributaire ≠ interrogé | Errata |
|---|---|---|---|---|---|---|
| QG (au Gouvernement) | 1 800 | 1 800 | 1 800 | 1 800 | 0 | 0 |
| QE (écrites) | 19 165 | 12 251 | 19 165 | 19 165 | 9 886 | 8 |
| QOSD (orales sans débat) | 828 | 815 | 828 | 828 | 52 | 0 |

Clôtures publiées des questions écrites sans réponse : 510 « Fin de mandat », 93 retraits par
l'auteur, 1 « question identique », 6 310 en cours. Aucun cas de revue : aucun ministère n'est
désigné par un libellé seul. Les 119 questions dont les dates d'attribution ne sont pas croissantes
suivent l'ordre publié.

Code : [question()](../../src/adaptateurs/sources/an/questions.py#L28), [flux()](../../src/adaptateurs/sources/an/questions.py#L75) ·
Tests : [test_question_au_gouvernement](../../tests/test_sources_an_questions.py#L111),
[test_ministre_jamais_devine](../../tests/test_sources_an_questions.py#L127),
[test_attribution_dans_l_ordre_publie](../../tests/test_sources_an_questions.py#L135),
[test_erratum_garde_a_part](../../tests/test_sources_an_questions.py#L147),
[test_documents_inchanges_sautes](../../tests/test_sources_an_questions.py#L162)

## Limites constatées sur les exemples

- « Ce qui a changé » article par article (diff mot à mot, amendement à l'origine) : cf.
  [modifications.md](../modifications.md).

- Amendements : l'article suivi et l'étape sont calculés à l'analyse ; un dossier mis à jour (séance
  publiée, `senatChemin` ajouté) ne relit pas les amendements inchangés : relire `an.travaux`
  (`canon --relire --etapes an.travaux`). L'attribution d'une modification d'article à un
  amendement (`modification_article`) reste à faire avec les diffs d'articles.
- Article d'une intervention : la valeur publiée (« Avant_ 1er ») est gardée telle quelle, pas
  normalisée.
