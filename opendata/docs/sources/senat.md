# Sénat — data.senat.fr

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Fréquence** : quotidienne (Last-Modified vers 02 h à 03 h pour les dumps).
- **Formats** : dumps PostgreSQL en zip (DOSLEG, AMELI, débats, questions), CSV précédés de leur requête SQL en commentaire `%` (sénateurs, en cp1252), XML Akoma Ntoso (textes).
- **Profondeur** : DOSLEG et sénateurs, tout l'historique ; comptes rendus depuis 2003 ; Akoma Ntoso depuis le 01/12/2019.

## Jeux

| Jeu | URL (Mo) | Tables ou objets utiles |
|---|---|---|
| DOSLEG | `data/dosleg/dosleg.zip` (16) | `loi` (12 490 dossiers), `lecture`, `lecass` (lecture par assemblée), `texte`, `rap`, `auteur`, `ecr` (auteurs des documents), `date_seance`, **`aud`** (15 385 auditions), **`scr`** (scrutins), **`votsen`** (1,67 M votes individuels), `org`, `the`/`loithe` (thèmes) |
| AMELI | `data/ameli/ameli.zip` (154) | `amd` (274 502 amendements, avec `avcid`, `avgid` : avis de la commission et du Gouvernement ; `sorid` : sort), `amdsen` (auteurs, `senid`), `txt_ameli` (`doslegsignet`), `sub` (subdivisions visées), `sen_ameli` (`mat` = matricule), **`intora`** (47 110 prises de parole par amendement : `entid`, `ord`, `temps`), `avicom`, `avigvt`, `sor` |
| Débats | `data/debats/debats.zip` (34) | `debats` (2 843 séances), `intpjl` (1 589 370 interventions sur les textes : `autcod`, `intana` = **analyse résumée**, `inturl`), `intdivers`, `lecassdeb` |
| Comptes rendus intégraux | `data/debats/cri.zip` (546) | **non inventorié** : texte intégral XML |
| Sénateurs | `data/senateurs/ODSEN_*.csv` | `GENERAL` (2 012 sénateurs, `Matricule`), `ELUSEN` (3 734 mandats datés), `HISTOGROUPES` (groupes datés), `COMS` (commissions datées, y compris CMP et commissions d'enquête), `ELUDEP` (790 mandats de député antérieurs), `MANDAT_LOCAL` (5 348 mandats locaux) ; dump complet `export_sens.zip` (9 Mo), dont la table `sen` et sa colonne **`sennumsie`** (« N° de siège Hémicycle » : 347 des 348 sénateurs en fonction au 25/10/2026), chargée comme lien `siege` sénateur → Sénat ; la numérotation ne suit pas l'ordre gauche-droite et aucun plan de la salle n'est publié |
| Textes Akoma Ntoso | `www.senat.fr/akomantoso/{depots,adoptions}.xml` (index de 3 759 et 1 127 textes) → `<signet>.akn.xml` | `bill/body/article@eId`, `article/num`, `alinea@eId`, `alinea@GUID`, `alinea@pastille`, `FRBRExpression/FRBRdate` |
| Questions | `data/questions/questions.zip` (283) | **non inventorié** |

## Identifiants

| Objet | Clé | Exemple |
|---|---|---|
| Dossier | `loi.signet` (clé lisible, citée par l'AN), `loi.loicod` (clé interne) | `ppl21-419`, `68922` |
| Sénateur | matricule (`Matricule`, `senmat`, `autmat`, `sen_ameli.mat`) | `21077M` |
| Scrutin | `(sesann, scrnum)` | |
| Amendement | `amd.id`, numéro `amd.num` dans `txt_ameli.id` ; ancre du compte rendu `amd_<session>_<texte>_<numéro>` | `1327464`, `amd_2025_766_2` |
| Texte AKN | `signet` du fichier, `FRBRthis`, GUID par article et par alinéa | `/akn/fr/ppre/2026-2027/93/fr@/RECT/` |

## Références croisées

- `loi.url_an` → dossier AN ; `loi.loinumjo`, `url_jo`, `loidatjo` → JORF ; `num_decision`, `deccocurl`, `saisine_par`, `saisine_date` → CC.
- `loi.proaccdat` : date d'engagement de la procédure accélérée.
- `txt_ameli.doslegsignet` → `loi.signet`.
- `ODSEN_ELUDEP` : anciens mandats de député d'un sénateur. Il n'y a pas d'identifiant AN : chaque
  sénateur ancien député à qui l'AMO connaît un acteur candidat part en revue
  (`identite_senateur_ancien_depute`, cf. l'exemple ci-dessous). En sens inverse, l'AMO publie pour
  1 049 acteurs une adresse « Url sénateur » (type 23) dont le nom de page finit par le matricule :
  c'est un indice du cas, pas encore un rapprochement automatique.
- `date_seance` : jours de séance publique d'une lecture, **y compris à venir** (ordre du jour) ;
  `lecidt` désigne une lecture par assemblée (`lecass.lecassidt`). Cf. « Agenda » ci-dessous.
- Les champs `loi.en_clair_*` sont un **résumé rédigé par le Sénat** : on peut l'afficher comme fait sourcé (« selon le Sénat »), distinct du port `Synthetiseur`.

## Points d'attention

- Les CSV commencent par 15 à 20 lignes `%` (la requête SQL) avant l'en-tête ; ils sont encodés en cp1252.
- Les dumps sont du SQL PostgreSQL brut (`COPY … FROM stdin`) : on les restaure dans un schéma `brut_senat_*`, ou on les lit en flux.
- `intpjl.intana` est une analyse et non le texte prononcé. Pour « ce que l'intervenant a dit », il faut `cri.zip`.
- `intora` donne l'ordre et la durée des prises de parole par amendement, ce qui sert à « ce qui a été dit » sur un amendement du Sénat.
- Le dump DOSLEG stocke des octets Windows-1252 comme caractères de contrôle C1 : « à l\x92article »
  dans l'intitulé du scrutin 2025-325. [table_dump()](../../src/adaptateurs/sources/senat/commun.py#L73)
  restitue l'apostrophe (« à l’article ») ; c'est une correction d'encodage, pas de contenu.
  Test : [test_apostrophe_windows_1252_restituee](../../tests/test_sources_senat.py#L63).
- Les valeurs des dumps sont au format texte de `COPY` : retour chariot, saut de ligne, tabulation
  et barre oblique y sont échappés (`\r`, `\n`, `\t`, `\\`). Brut de l'amendement COM-154 (`amd.id`
  1324544, pjl25-689) : `Alin&#233;as 21 et 22</p>\r\n<p style="text-align: justify;">Supprimer…` ;
  aucun `\\` dans les dumps, donc aucun « \r » publié tel quel. [valeur_copy()](../../src/adaptateurs/sources/senat/commun.py#L62)
  décode tout en un seul passage (avant le 25/10/2026, `\r` restait littéral dans 21 297 amendements).
  Test : [test_dispositif_ameli_retour_chariot](../../tests/test_sources_senat.py#L166).

## Exemples réels : de la source au canon

Relevés le 24/10/2026 sur le dossier prototype (côté Sénat : **pjl25-689**). Liens vers le code
vérifiés par `tests/test_docs.py`. Les dumps sont lus par [table()](../../src/adaptateurs/sources/senat/travaux.py#L55) ;
chaque ligne devient un document brut dont l'empreinte suit les valeurs
([document_ligne()](../../src/adaptateurs/sources/senat/commun.py#L91)).

### Dossier — `SENAT:dossier:pjl25-689`

Brut : `dosleg.zip` › `dosleg.sql`, table `loi` :

```json
{"loicod": "82340", "typloicod": "pjl", "signet": "pjl25-689", "numero": "2026-796",
 "loient": "Protection et souveraineté agricoles",
 "loitit": "d'urgence pour la protection et la souveraineté agricoles",
 "url_an": "http://www.assemblee-nationale.fr/17/dossiers/projet_loi_urgence_pour_protection_et_souverainete_agricoles.asp",
 "loinumjo": "192", "loidatjo": "2026-08-19 00:00:00", "date_loi": "2026-08-18 00:00:00",
 "url_jo": "http://www.legifrance.gouv.fr/UnTexteDeJorf.do?numjo=AGRS2603566L",
 "num_decision": "2026-914 DC", "date_decision": "2026-08-14 00:00:00",
 "saisine_par": "au moins soixante députés", "saisine_date": "2026-07-24 00:00:00"}
```

Canon : **aucune nouvelle entité**. L'AN cite `pjl25-689` (`senatChemin`), donc
`SENAT:dossier:pjl25-689` est une seconde identité du dossier `AN:dossier:DLR5L17N54085`
(EXPLICIT_REFERENCE). Seuls les dossiers DOSLEG **non cités par l'AN** créent un dossier, titré
`loient` : [dossier()](../../src/adaptateurs/sources/senat/dossiers.py#L15) ·
Test : [test_titre](../../tests/test_sources_senat.py#L98).

### Sénateur, mandat, groupe — `SENAT:senateur:14038Y`

Brut : `senateurs.csv` (ODSEN_GENERAL, cp1252, en-tête après les lignes `%`) :

```text
Matricule=14038Y  Qualité=M.  Nom usuel=Chaize  Prénom usuel=Patrick  État=ANCIEN  Groupe politique=Les Républicains
```

Canon : `canon.personne` `{"civilite": "M.", "prenom": "Patrick", "nom": "Chaize", "nom_affiche": "Patrick Chaize"}`
(ni date de naissance ni adresse) ; `canon.fonction` par mandat (`SENAT:mandat_senateur:<Identifiant mandat>`,
ODSEN_ELUSEN) et par fonction occupée dans un groupe (`SENAT:fonction_groupe:<Id fonction occupée>`, ODSEN_HISTOGROUPES).

Le RNE (livraison du 11/08/2026) le liste encore comme sénateur depuis le 01/10/2020 ; le Sénat le
dit « ANCIEN » : le RNE est un instantané, pas une référence (cf. [rne.md](rne.md)).

Code : [senateur()](../../src/adaptateurs/sources/senat/senateurs.py#L31), [mandat()](../../src/adaptateurs/sources/senat/senateurs.py#L40),
[appartenance()](../../src/adaptateurs/sources/senat/senateurs.py#L67)

### Amendement et avis — `SENAT:amendement:1328039`

Brut : `ameli.zip` › `var/opt/opendata/ameli.sql`, table `amd` (codes, jointures par `txtid`, `sorid`…) :

```json
{"id": "1328039", "txtid": "107100", "num": "999", "typ": "A", "sorid": "N",
 "datdep": "2026-06-25 11:56:54", "alinea": "8", "accgou": "N",
 "dis": "<p style=\"text-align: justify;\">Alin&#233;a 8</p>…<p>R&#233;diger ainsi cet alin&#233;a&#160;:</p>…"}
```

Canon (`canon.amendement`) : numéro 999, division « Article 21 » (et article suivi, étape : ci-dessous), `sort = non_soutenu`
(`sort_source` « Non soutenu »), dossier par `txt_ameli.doslegsignet` → `pjl25-689`, donc le dossier
prototype. Les avis de la commission et du Gouvernement (`avcid`, `avgid`) vont dans
`canon.avis_amendement`, une ligne par émetteur (ici aucune : amendement non soutenu ; sur un
amendement examiné : `{"emetteur": "gouvernement", "avis": "favorable", "avis_source": "F"}`).

Code : [amendement()](../../src/adaptateurs/sources/senat/travaux.py#L146), [Referentiel](../../src/adaptateurs/sources/senat/travaux.py#L59) ·
Tests : [test_amendement_avis_auteurs](../../tests/test_sources_senat.py#L128), [test_numero_ambigu_en_revue](../../tests/test_sources_senat.py#L152)

#### Article suivi et étape de l'amendement

Brut (même amendement 1328039) : `amd.subid` → table `sub`, `amd.txtid` → table `txt_ameli` :

```json
{"amd": {"id": "1328039", "subid": "207638", "subpos": "0", "txtid": "107100", "num": "999"},
 "sub": {"id": "207638", "txtid": "107100", "typid": "4", "lib": "Article 21", "merid": null},
 "txt_ameli": {"id": "107100", "num": "763", "lecid": "1", "txttyp": "S", "doslegsignet": "pjl25-689"}}
```

et, côté AN, le dossier DLR5L17N54085 qui cite `pjl25-689` : sa lecture SN1 cite `PRJLSNR5S479B0689`
(dépôt) et `PRJLSNR5S479BTC0763` (texte de la commission), ses étapes `SN1-COM-FOND`
(`L17-VD232373CF`) et `SN1-DEBATS` (`L17-SN1-DEBATS-54085`).

Canon : `article_suivi_id` → `CIVICTRACE:article_suivi:SENAT:dossier:pjl25-689#21` (la même clé que
l'article 21 des textes AN et Sénat de ce dossier) ; `etape_id` →
`AN:acte:DLR5L17N54085:L17-SN1-DEBATS-54085` : le texte n° 763 est cité par la seule lecture SN1,
dont le code concorde avec `lecid` 1 (« 1ère lecture »), et c'est un texte de séance (`txttyp` S).
Un amendement de commission (`COM-…`, texte `txttyp` C) va à `SN1-COM-FOND`, sauf si une commission
pour avis a reçu délégation au fond (`sai.isdelegfond = 'O'`) : la commission qui l'examine n'est
alors pas connue, l'étape reste vide.

| Subdivision AMELI (amendement réel) | Canon |
|---|---|
| `typid` 4 « Article 21 », `subpos` 0 (1328039) | article suivi « 21 » |
| `typid` 4 « Article 1er bis A (nouveau) » | « 1 bis A » (mention retirée, comme pour les textes) |
| `typid` 7 « État B », `merid` → « Article 5 » (1300995, pjl25-132) | « 5 » : l'article parent qui porte l'annexe |
| « Article 13 », `subpos` 20 (1327276 : « Après l'article 13, insérer un article additionnel ») ; `subpos` -10, -20, 10 | aucun suivi, pas de revue (insertion avant ou après) |
| `typid` 4 « Article additionnel après l'article 71 bis » (7726) | aucun suivi, pas de revue |
| `typid` 1, 2, 3, 8, 9 (intitulé, titre, chapitre, section) ; pas de `subid` (1 883 amendements) | aucun suivi, pas de revue |
| numéro illisible | cas `article_vise_illisible` (aucun au 24/10/2026) |

Mesure sur les 29 681 amendements AMELI chargés : 18 499 reliés à un article suivi (dont 2 126 par
une annexe), 9 178 additionnels, 2 004 sans article (intitulé, division, pas de subdivision),
0 illisible ; 26 617 reliés à une étape, 0 ambigu, 3 064 sans étape (dossier non cité par l'AN :
730 ; signet cité par deux dossiers AN : 36 ; numéro du texte non cité par le dossier AN : 642 ; pas
encore d'étape publiée ou délégation au fond : le reste).

Code : [article_vise()](../../src/adaptateurs/sources/senat/travaux.py#L111), [etapes()](../../src/adaptateurs/sources/senat/travaux.py#L127),
[Examens](../../src/adaptateurs/sources/an/dossiers.py#L232) ·
Tests : [test_seance](../../tests/test_amendements_articles.py#L217), [test_commission_et_delegation](../../tests/test_amendements_articles.py#L224),
[test_lecture_discordante](../../tests/test_amendements_articles.py#L232), [test_divisions](../../tests/test_amendements_articles.py#L238)

### Scrutin — `SENAT:scrutin:2025-325`

Brut : `dosleg.sql`, table `scr` :

```json
{"sesann": "2025", "scrnum": "325", "code": "31121", "scrdat": "2026-07-01 00:00:00",
 "scrint": "sur les amendements identiques n° 584 rectifié, … n° 847 rectifié bis, … et n° 861, présenté par le Gouvernement, à l\u0092article 5 quater A du projet de loi d'urgence pour la protection et la souveraineté agricoles",
 "scrvot": "344", "scrpou": "133", "scrcon": "211"}
```

Canon (`canon.scrutin`) : 344 votants, 133 pour, 211 contre, `nature = amendement`. Le dossier est
trouvé par chaîne explicite `code` → `date_seance` → `lecass` → `lecture` → `loi.signet`.
`amendement_id` reste **vide** : trois amendements identiques sont visés, on ne choisit pas. Votes
nominatifs : table `votsen` (matricule → `SENAT:senateur:<mat>`).

Code : [scrutin()](../../src/adaptateurs/sources/senat/travaux.py#L185) ·
Test : [test_scrutin_dossier_amendement_votes](../../tests/test_sources_senat.py#L141)

### Sort d'un scrutin — `SENAT:scrutin:2025-340`

DOSLEG ne publie pas le sort : `scr.soslib` dit qui a demandé le scrutin, `scr.scrmaj` (« majorité
des suffrages exprimés ») vaut 0 depuis 2012. Brut, `scr` : `2025 340 31420 sur l'ensemble du projet
de loi d'urgence pour la protection et la souveraineté agricoles 2026-07-21 214 111 345 325 … scrmaj 0
soslib \N`. Le président l'annonce au compte rendu intégral du jour, `cri/d20260721.xml` :

```html
<p id="par_6406">Voici, … le r&#233;sultat du scrutin n&#176;&#160;340&#160;:</p>
<cri:scrutin1>…Nombre de votants…345…</cri:scrutin1> <cri:scrutin1>…suffrages exprim&#233;s…325…</cri:scrutin1>
<cri:scrutin2>…Pour l&#8217;adoption…214…</cri:scrutin2> <cri:scrutin2>…Contre…111…</cri:scrutin2>
<p id="par_6411">Le S&#233;nat a adopt&#233; d&#233;finitivement. …</p>
```

Canon : `sort = adopté`, pris de la phrase (« Le Sénat a adopté… », « … n'est pas adopté »),
jamais des voix ; scrutin retrouvé par (jour du compte rendu, numéro). Sans annonce : sort vide ;
phrase non reconnue ou annonces discordantes : cas `resultat_scrutin_illisible`. Un compte rendu
nommé après sa date dans l'archive (`cri/d20261204.xml`, daté du 06/01/2026) est écarté.

Code : [annonces()](../../src/adaptateurs/sources/senat/resultats.py#L51), [sort()](../../src/adaptateurs/sources/senat/resultats.py#L42) ·
Test : [test_sort_du_scrutin_340](../../tests/test_sources_senat.py#L265)

### Intervention en séance — `SENAT:intervention:d20260629#int_333`

Brut : `cri.zip` › `cri/d20260629.xml` (compte rendu intégral, XHTML balisé) :

```xml
<cri:intervenant id="int_333" parid="par_1487" mat="14111D" nom="Alain MARC" civ="M."
                 qua="pr&#233;sident de s&#233;ance" type="1">
<p id="par_1487"><span class="orateur_nom">…M. le président.</span> Je mets aux voix l&#8217;amendement n&#176;&#160;448.</p>
<p id="par_1488">…(L’amendement n’est pas adopté.)</p>
```

Canon (`canon.intervention`) : ordre 332, orateur `SENAT:senateur:14111D` (matricule publié dans
`mat` : identifiant officiel), qualité « président de séance », texte intégral « Je mets aux voix
l’amendement n° 448. (L’amendement n’est pas adopté.) », article « Article 1er », dossier par la
section de texte (`cri:titreS1@signet`). Un membre du Gouvernement (matricule hors ODSEN) part en
revue (`identite_membre_gouvernement`).

Code : [seance()](../../src/adaptateurs/sources/senat/debats.py#L115),
[membre_du_gouvernement()](../../src/adaptateurs/sources/senat/debats.py#L177) ·
Tests : [test_interventions](../../tests/test_sources_senat.py#L35), [test_membre_du_gouvernement_en_revue](../../tests/test_sources_senat.py#L47)

#### Amendements discutés

Le compte rendu ne porte aucune balise d'amendement sur les interventions : `cri:amendements`
n'encadre que le dispositif lu en séance, sans attribut. Deux références servent :

1. une **ancre** posée par le Sénat dans l'intervention qui présente un amendement (14 730 sur
   les 244 jours) : `<a name="amd_<session>_<texte>_<numéro>[_rect_N]">`, où le texte est le
   numéro AMELI (`txt_ameli.num`) ;
2. à défaut, le **numéro cité** dans le texte de l'intervention (hors dispositif), cherché
   seulement dans les textes AMELI de la **lecture en cours** : `cri:titreS1@lecassidt` → DOSLEG
   `texte` (session, numéro) → `txt_ameli` du dossier `cri:titreS1@signet`. Une section
   « PRÉSIDENCE DE … » (changement de président) prolonge la discussion en cours.

Brut, même fichier `cri/d20260629.xml` : la CMP du textile, puis le texte agricole où se trouve `int_333` :

```xml
<cri:titreS1 parid="par_17" libelle="Impact environnemental de l&#8217;industrie textile" type="sect_pdl"
             lecassidt="110201" signet="ppl23-431">
…
<cri:intervenant id="int_12" parid="par_262" mat="21061D" nom="Sylvie VALENTE LE HIR" …>
<a name="amd_2025_766_2"> </a><a name="ameli_amendement_cra_objet"> </a><p id="par_262">… Cet amendement, …
…
<cri:titreS1 parid="par_1037" libelle="Protection et souverainet&#233; agricoles" type="sect_pdl"
             lecassidt="109821" signet="pjl25-689">
```

DOSLEG, lecture 109821 : textes (2025, 689) et (2025, 763). AMELI : `107086` (n° 689, texte de la
commission, amendement `COM-448`) et `107100` (n° 763, texte de séance, amendement `448` =
`1327464`). Le numéro est comparé tel que publié : « 448 » ne désigne pas « COM-448 ».

| `SENAT:intervention:…` | `amendements` avant → après | `amendement_id` avant → après |
|---|---|---|
| `d20260629#int_333` « Je mets aux voix l’amendement n° 448. » | vide → `448` | vide → `SENAT:amendement:1327464` |
| `d20260629#int_331` « … les amendements identiques nos 272 rectifié et 743. » | vide → `272, 743` | vide ; liens `amendement` vers `1328968`, `1327708` |
| `d20260629#int_12` (ancre `amd_2025_766_2`) | vide → `2` | vide → `SENAT:amendement:1328518` (texte 766, CMP) |

Ce qui part en revue, jamais tranché :

- un numéro qui désigne plusieurs amendements → `amendement_ambigu` (candidats : ces amendements) ;
- une ancre dont le texte n'est pas de la lecture en cours (discussion commune de deux textes
  sous un seul signet, ou ancre erronée : `amd_2024_254_3` dans le débat du 30/01/2025 sur la haie,
  texte 189, désigne le texte 254 d'un autre dossier) → `amendement_ambigu`, candidats : son
  amendement et celui du même numéro dans la lecture (`contexte.motif`). Les numéros cités dans
  cette discussion sont aussi cherchés dans le texte de l'ancre, pour révéler l'ambiguïté :
  « l’amendement n° 8 » (`d20250130#int_124`) a deux candidats, `1285544` (haie) et `1285274` ;
- aucun amendement → `amendement_introuvable` (dont les mises au point sur un vote, hors lecture).

Reste vide, sans revue : une citation qui ne désigne que des amendements que `senat.travaux` ne
charge pas (missions de la seconde partie du projet de loi de finances, sans dossier dans AMELI ;
textes déposés avant la session 2024). AMELI numérote parfois un texte « 370 rect. » : c'est le
texte 370 de l'ancre et de DOSLEG.

Mesure sur les 167 954 interventions (244 jours) : 41 743 citent un amendement ; 37 075 sont
reliées (28 881 à un seul, 8 194 à plusieurs par des liens), 18 130 amendements distincts ; 351
sont citées par un cas (162 `amendement_ambigu`, 141 `amendement_introuvable`) ; 4 360 ne citent
que des amendements non chargés (3 701 dans les lois de finances et de financement de la sécurité
sociale). Contrôle : là où l'intervention a un article, la subdivision AMELI de l'amendement relié
est la même dans 92 % des cas (l'écart : « Après l’article 14 », annexes, rappel d'un amendement
d'un autre article).

Code : [Index.chercher()](../../src/adaptateurs/sources/senat/amendements_cites.py#L93),
[Index.en_discussion()](../../src/adaptateurs/sources/senat/amendements_cites.py#L84),
[numeros_cites()](../../src/adaptateurs/sources/senat/amendements_cites.py#L35),
[ancre()](../../src/adaptateurs/sources/senat/amendements_cites.py#L40),
[discussions()](../../src/adaptateurs/sources/senat/debats.py#L99),
[amendement_cite()](../../src/adaptateurs/sources/an/cas.py#L12) ·
Tests : [test_numero_cite_resolu_dans_la_lecture](../../tests/test_senat_debats_amendements.py#L117),
[test_plusieurs_amendements_un_lien_chacun](../../tests/test_senat_debats_amendements.py#L124),
[test_ancre_de_l_intervention](../../tests/test_senat_debats_amendements.py#L131),
[test_ancre_hors_de_la_lecture_en_revue](../../tests/test_senat_debats_amendements.py#L137),
[test_hors_lecture_introuvable](../../tests/test_senat_debats_amendements.py#L162),
[test_plf_dispositif_et_mission_non_chargee](../../tests/test_senat_debats_amendements.py#L175)

### Membre du Gouvernement créé côté Sénat, puis relié : fusion — `SENAT:membre_gouvernement:20872D`

Brut : `cri.zip` › `cri/d20261022.xml` :

```xml
<cri:intervenant id="int_16" parid="par_58" mat="20872D" nom="Mathieu LEF&#200;VRE" civ="M." qua="" type="2"  >
```

Le matricule `20872D` n'est pas dans ODSEN (`type="2"` : membre du Gouvernement) : cas
`identite_membre_gouvernement:20872D`, candidat l'acteur AN `PA795386` (`json/acteur/PA795386.json` :
Mathieu Lefèvre). Décidé « aucun », la personne « Mathieu LEFÈVRE » est créée telle que le Sénat la
publie, et ses interventions la prennent pour orateur. Si la décision est reprise
(`revue decider identite_membre_gouvernement:20872D --choix 0`), la personne créée est **fusionnée**
dans l'acteur : `SENAT:membre_gouvernement:20872D` → acteur en `MANUAL` (preuve : le cas),
`orateur_id` de l'intervention `SENAT:intervention:d20261022#int_16` = l'acteur, la personne Sénat
gardée et marquée `fusionnee_dans` (procédure : [rapprochements.md §7](../rapprochements.md)).
Aucune décision n'est prise dans la base : 82 cas `identite_membre_gouvernement` à revoir.

Code : [fusionner_si_meme_objet()](../../src/revue.py#L161) ·
Test : [test_membre_du_gouvernement_aucun_puis_relie](../../tests/test_fusion.py#L118) (rejoué sur Postgres)

### Textes Akoma Ntoso — `SENAT:texte:<stem>`

Brut : `senat.fr/akomantoso/<stem>.akn.xml` ; la table DOSLEG `texte` relie le fichier au dossier
(`texurl` « pjl25-689.html » → `pjl25-689.akn.xml`, `lecassidt` → … → `loi.signet`) et donne son
origine (`oritxt` : déposé, commission, adopté…). Un article : `<article eId="art_1"><num>Article 1er</num>…<alinea>…</alinea></article>`.
Canon : `canon.version_texte`, `canon.version_article` (`SENAT:article:<stem>#<eId>`),
`canon.article_suivi` partagé avec l'AN (clé du dossier + numéro officiel). Un texte adopté
définitivement (`oritxtado = 'D'`, ex. `tas25-166`) est renuméroté : pas de suivi
([test_senat_definitif_sans_suivi](../../tests/test_textes.py#L78)). Le corps d'un article ne lit que
les `content`, le parent avant ses sous-alinéas (« 1° » avant ses « a) »), sans répéter le texte des
enfants ([corps_articles()](../../src/adaptateurs/sources/senat/textes.py#L69),
[test_senat_sous_alineas_sans_doublon](../../tests/test_textes.py#L96)). Textes antérieurs à la
session 2024 et lignes sans session (40 textes anciens) ignorés.

Code : [references()](../../src/adaptateurs/sources/senat/textes.py#L50), [version()](../../src/adaptateurs/sources/senat/textes.py#L84) ·
Tests : [test_version](../../tests/test_textes.py#L60), [test_textes_sans_session_ignores](../../tests/test_sources_senat.py#L78)

### Sénateur ancien député — `SENAT:senateur:20684B` et `AN:acteur:PA794906`

Brut : `eludep.csv` (ODSEN_ELUDEP, cp1252, en-tête après les lignes `%`), une ligne par fonction
occupée pendant un mandat :

```text
20684B,M.,Amard,Gabriel,ACTIF,52998,,2022-06-22 00:00:00.0,,2024-06-09 00:00:00.0,,52535,…,Député
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55837,…,Député
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55838,…,Secrétaire de l'Assemblée nationale
20684B,M.,Amard,Gabriel,ACTIF,54396,,2024-07-08 00:00:00.0,,2026-09-30 00:00:00.0,2026,55839,…,Député
```

Côté AN, `acteurs.json.zip` › `json/acteur/PA794906.json` (AMO30) :

```json
{"uid": "AD885845", "type": "23", "typeLibelle": "Url sénateur",
 "valElec": "https://www.senat.fr/senateur/amard_gabriel20684b.html"}
{"uid": "PM843284", "typeOrgane": "ASSEMBLEE", "legislature": "17", "dateDebut": "2024-07-07",
 "dateFin": "2026-09-30", "mandature": {"datePriseFonction": "2024-07-08", "causeFin": "Élection au Sénat"}}
{"uid": "PM797187", "typeOrgane": "ASSEMBLEE", "legislature": "16", "dateDebut": "2022-06-19",
 "dateFin": "2024-06-09", "mandature": {"datePriseFonction": "2022-06-22"}}
```

Canon : l'AMO cite la fiche Sénat (adresse type 23) : **référence explicite** lue par
`an.acteurs`, même personne. La fiche sénateur est fusionnée dans l'acteur `PA794906` (décision
d'équipe du 24/10/2026, cf. [rapprochements.md](../rapprochements.md), Fusion d'entités) : une seule
personne, avec ses mandats de député (AMO) et de sénateur (ODSEN). **Pas de cas de revue.**

Le cas `identite_senateur_ancien_depute` ne reste que pour un sénateur sans fiche citée par l'AMO
mais avec un acteur AN homonyme : candidats = les homonymes, indices `homonyme`, `depute`,
`debuts_concordants`, `mandats_chevauchants` (jamais une preuve) ; décider « même personne »
fusionne les deux fiches.

Autres cas réels : Jacqueline Fraysse-Cazalis (`86027F`) est « Jacqueline Fraysse » à l'AN
(`PA1364`) : pas homonyme, mais l'AMO cite sa fiche (`fraysse_cazalis_jacqueline86027f.html`) :
reliée par la référence, sans revue. François Abadie (`83008P`), député en 1981, n'a pas d'acteur AN :
rien à relier.

Mesure (24/10/2026) : 790 lignes, 318 sénateurs. 184 ont un acteur AN candidat, et l'AMO cite la
fiche Sénat dans les **184** cas : tous reliés par référence explicite, **0 cas de revue**. 134
sénateurs sans candidat (mandats antérieurs à l'AMO30, qui commence le 19/06/2002). Au total,
l'AMO cite la fiche Sénat de 1 049 acteurs (anciens députés devenus sénateurs, sénateurs devenus
députés, ministres…).

Code : [anciens_deputes()](../../src/adaptateurs/sources/senat/senateurs.py#L84),
[ancien_depute()](../../src/adaptateurs/sources/senat/senateurs.py#L117),
[fiche_senat()](../../src/adaptateurs/sources/an/acteurs.py#L153) ·
Tests : [test_fiche_citee_par_l_amo_pas_de_revue](../../tests/test_senat_anciens_deputes.py#L101),
[test_homonyme_seul_en_revue_avec_indices](../../tests/test_senat_anciens_deputes.py#L107),
[test_amo_cite_la_fiche_senat_fusion_sans_revue](../../tests/test_fusion.py#L92),
[test_decision_fusionne_les_deux_fiches](../../tests/test_senat_anciens_deputes.py#L162)

### Agenda de la séance publique — `SENAT:date_seance:31479`

Brut : `dosleg.zip` › `dosleg.sql` (dump du 24/10/2026), tables `date_seance`, `lecass`, `lecture`, `loi`
(clés complétées d'espaces dans le dump) :

```text
date_seance  111525  2026-10-27 00:00:00  31479  \N
             111525  2026-10-28 00:00:00  31480  \N   (… 29, 30 octobre, 3 novembre : 31481, 31519, 31520)
lecass       111525  97392  S  …
lecture      97392   83479  1  Première lecture
loi          83479   pjl    pjl25-911  Protection des enfants
```

La page du dossier dit la même chose : « Discussion en séance publique les 27, 28, 29, 30 octobre
et 3 novembre 2026 ».

Canon (`canon.evenement_agenda`) : `{"dossier_id": <pjl25-911>, "date": "2026-10-27",
"libelle": "Séance publique du Sénat — Première lecture", "type_etape": "seance", "chambre": "SENAT",
"lecture": "1", "code_source": "Première lecture", "organisation_id": <Sénat>}`, `reunion_id`
vide. Le dossier `pjl25-911` étant cité par l'AN, c'est le dossier canonique commun aux deux
chambres. Une date que l'ordre du jour ne donne plus est marquée retirée à la relecture
(`Ensemble` sur l'organisation Sénat), jamais supprimée.

Code : [seances()](../../src/adaptateurs/sources/senat/agenda.py#L29),
[agenda()](../../src/adaptateurs/sources/senat/agenda.py#L53) ·
Tests : [test_jours_de_seance_relies_au_dossier](../../tests/test_senat_agenda.py#L55),
[test_ordre_du_jour_modifie](../../tests/test_senat_agenda.py#L98)

## Agenda : sources inventoriées (24/10/2026)

Besoin : la prochaine étape datée d'un dossier (« lecture au Sénat le … ») avec une référence
**explicite** au dossier (signet DOSLEG).

| Source | Ouverte | Futur | Référence au dossier | Retenue |
|---|---|---|---|---|
| DOSLEG `date_seance` (data.senat.fr, dump quotidien) | oui, Licence Ouverte | oui : 19 jours prévus au 24/10/2026, jusqu'au 05/11/2026 | `lecidt` → `lecass` → `lecture` → `loi.signet` : 470/470 lignes depuis le 18/07/2024 | **oui** (`senat.agenda`) |
| Ordre du jour HTML (`www.senat.fr/ordre-du-jour/ordre-du-jour.html`) | page web, sans licence de données | oui, plus loin (jusqu'au 19/11/2026) | lien `dossier-legislatif/<signet>.html` pour les textes déposés au Sénat ; « A.N., n° 3211 » pour un texte pas encore transmis (PLFSS 2027) | non : HTML de mise en page |
| API de l'application Agenda (`agenda.senat.fr` → `www.senat.fr/api/v1/agenda/events`, `/events/<id>`) | non documentée, sans licence | oui : séance et commissions | séance : lien au dossier dans le HTML du champ `content` ; commissions : titre abrégé (« PPL Droit des victimes… ») et numéro de texte, **sans signet** | non : non documentée, référence dans du HTML |
| Autres colonnes datées de DOSLEG (`aud.auddat`, `lecass.lecassamedat`, `texte.texdatsea`, `rap.rapdatsea`, `evtsea`) | oui | **non** : aucune date postérieure au 24/10/2026 | — | — |
| data.senat.fr | — | aucun jeu « agenda » ou « ordre du jour » | — | — |

Contrôle sur le passé : pour 409 des 451 jours de séance passés (91 %), le compte rendu intégral du
jour (`cri.zip`) a une section qui cite le même signet ; les autres sont surtout des conventions
examinées en procédure simplifiée.

Ce qui manque : l'agenda des **commissions** du Sénat avec référence au dossier (l'API ne donne
qu'un titre et un numéro de texte) ; les dates des textes pas encore transmis au Sénat (PLFSS,
PLF : l'ordre du jour HTML ne cite que le numéro AN) ; l'heure (DOSLEG ne donne que le jour).

## Limites constatées sur les exemples

- Interventions du Sénat : un amendement cité ailleurs que dans la discussion de son texte (mise
  au point sur un vote, question) n'est pas cherché hors de la lecture : cas `amendement_introuvable`.
  Le `dossier_id` d'une intervention suit toujours la seule section : après « PRÉSIDENCE DE … »,
  il est vide alors que l'amendement, lui, est relié.
- Ancres d'amendement du Sénat parfois erronées (texte d'un autre dossier) : contrôlées par la lecture.
- Scrutins du Sénat : `etape_id` vide ; abstentions non publiées dans `scr` ; sort vide pour un scrutin
  dont le compte rendu n'annonce pas le résultat (2 sur 724 au 25/10/2026 : 2024-244, 2026-24).
