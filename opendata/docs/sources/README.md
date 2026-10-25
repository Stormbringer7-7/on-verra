# Inventaire des sources — synthèse (phase 0)

Relevé du 24/10/2026 avec `python -m src inventaire <source>`. Les relevés bruts, avec chemins,
volumes et exemples, sont dans `data/inventaire/<source>.json` (non versionné). Chaque source a sa
fiche :
[an.md](an.md) · [senat.md](senat.md) · [legifrance.md](legifrance.md) (avec CONSTIT) ·
[hatvp.md](hatvp.md) · [insee.md](insee.md) · [rne.md](rne.md).

Chaque fiche se termine par des **exemples réels** : pour chaque objet, l'extrait brut tel que
publié, la ligne canonique produite, la fonction qui fait la transformation et le test qui la
prouve. Les liens vers le code sont vérifiés par `tests/test_docs.py` (un lien qui ne tombe plus
sur sa fonction fait échouer les tests ; `python3 -m tests.test_docs --corriger` recale les numéros
de ligne après un déplacement de code).

Toutes les sources sont sous **Licence Ouverte / Etalab 2.0**.

## Références croisées réellement observées

Une référence explicite est un identifiant d'une source lu dans une autre. Elle donne une
correspondance `EXPLICIT_REFERENCE`, donc `VERIFIED`. Tout le reste n'est qu'une proposition.

| De → vers | Champ source | Exemple | Méthode |
|---|---|---|---|
| Dossier AN → dossier Sénat | `dossierParlementaire/titreDossier/senatChemin` | `…/dossier-legislatif/ppl21-419.html` → `dosleg.loi.signet = ppl21-419` | EXPLICIT_REFERENCE |
| Dossier Sénat → dossier AN | `dosleg.loi.url_an` | URL du dossier AN | EXPLICIT_REFERENCE (contrôle croisé) |
| Promulgation AN → JORF | acte `PROM-PUB` : `infoJO/referenceNOR`, `codeLoi`, `urlLegifrance` | `SFHX2508281L`, loi `2026-247` | EXPLICIT_REFERENCE (NOR = `JORF …TEXTE@nor`) |
| Dossier Sénat → JORF | `dosleg.loi.loinumjo`, `url_jo`, `loidatjo` | | EXPLICIT_REFERENCE |
| Décision CC AN → CONSTIT | acte `CC-*` : `numDecision`, `urlConclusion`, `casSaisine` | `910`, `…/decision/2026/2026910D` | EXPLICIT_REFERENCE |
| CONSTIT → loi | `META_JURI_CONSTIT/LOI_DEF@nor`, `@num` | NOR de la loi contrôlée | EXPLICIT_REFERENCE |
| Acte AN → réunion, point d'ODJ | `reunionRef`, `odjRef` | `RUANR5L17S2026IDS29854PT50855` | identifiant interne AN |
| Acte AN → scrutin | `voteRefs/voteRef` | `VTANR5L17V1018` | identifiant interne AN (remplace le rapprochement par titre) |
| Réunion AN → compte rendu | `reunion/compteRenduRef` | `CRSANR…` (séance), `CRCANR…` (commission) | identifiant interne AN |
| Paragraphe de séance AN → orateur, amendement | `paragraphe@id_acteur`, `@id_mandat`, `@adt`, `@art` | `PA720908` | OFFICIAL_ID |
| Amendement AN → texte, article, séance | `texteLegislatifRef`, `pointeurFragmentTexte/division`, `seanceDiscussionRef`, `urlDivisionTexteVise` | `/17/textes/1375.asp#D_Article_3` | identifiant interne AN |
| Texte AMELI → dossier Sénat | `ameli.txt_ameli.doslegsignet` | | identifiant interne Sénat |
| **Déclaration HATVP → député** | `liste.csv/id_origine` (type_mandat `depute`) | `841729` → `PA841729` ; photo `…/photos/841729.jpg` | EXPLICIT_REFERENCE : renseigné sur 2 531 lignes sur 2 570, et les 2 531 existent dans l'AMO |
| **Déclaration HATVP → sénateur** | `liste.csv/id_origine` (type_mandat `senateur`) | `21077M` = matricule Sénat | EXPLICIT_REFERENCE : renseigné sur 1 117 lignes sur 1 132, et les 1 117 existent dans `ODSEN_ELUSEN` |
| Sénateur → ancien mandat de député | `ODSEN_ELUDEP` (matricule + dates) ; côté AN, adresse « Url sénateur » (type 23) de l'AMO | `amard_gabriel20684b.html` → `20684B` | pas d'identifiant AN dans ELUDEP : cas `identite_senateur_ancien_depute` (fiche citée et dates = indices) |
| Représentant d'intérêts → organisations | `affiliations[]/clients[]` : `identifiantNational` + `typeIdentifiantNational` | SIREN, RNA, HATVP | OFFICIAL_ID (SIREN) |

## Ce qu'aucune source ne fournit

| Besoin du design | Constat | Conséquence |
|---|---|---|
| Identifiant personne dans le **RNE** | Aucun. Le jeu ne décrit que la situation actuelle (pas d'historique), mis à jour le 11/08/2026 | Une fiche `mandat_rne` par ligne sous une clé locale ; le lien à une personne (autre mandat, parlementaire) passe par la revue (cas `elu_local`), même au même siège et à la même date. La date de naissance n'est **jamais** lue (doc §4.4). Historique local à constituer par instantanés successifs |
| Identifiant HATVP pour les **membres du Gouvernement** et les **élus locaux** | `id_origine` vide | NAME_DATE vers l'acteur AN (les ministres ont un `PA` dans l'AMO) : en revue |
| **Avis rapporteur et Gouvernement** sur les amendements **AN** | Absents du JSON des amendements. Le Sénat les publie (`ameli.amd.avcid`, `avgid`) | AN : avis affichés « non publiés en données structurées ». À extraire plus tard des comptes rendus, en affirmation à relire |
| **Comptes rendus de commission AN structurés** | Pas dans Syceron (640 comptes rendus de séance seulement). Existent en HTML unitaire (`dyn/opendata/CRCANR….html`), orateur en gras sans `acteurRef` | Découpage HTML. Orateur résolu par nom **dans la liste fermée des participants de la réunion** (`agenda.participants`) : proposé, en revue (décision ouverte n° 7) |
| Texte intégral des interventions du **Sénat** | `debats.intpjl` (1,59 M interventions) ne contient qu'un résumé (`intana`). Le texte intégral est dans `cri.zip` (546 Mo, XML), non encore inventorié | Lot Sénat : inventorier `cri.zip` d'abord |
| **Texte par article, AN** | Pas de XML structuré. HTML unitaire (`dyn/opendata/<uid>.html`) avec classes stables (`assnat9ArticleNum`, `assnatLoiTexte`) | Découpage HTML, avec tests sur les deux dossiers prototypes |
| **Texte par article, Sénat** | Akoma Ntoso depuis le 01/12/2019 (`senat.fr/akomantoso/*.akn.xml`), avec `eId` et GUID par article et par alinéa | Source de référence pour le suivi d'article côté Sénat |
| Lien **action de lobbying → texte** | `objet` en texte libre (ex. « PLFSS : … ») ; responsables publics par **catégorie** seulement | « Vérifié » seulement si l'objet cite le texte (titre ou numéro) ; sinon « à vérifier » |

## Données personnelles : ce qu'on ne charge pas

- HATVP : adresses, téléphones, e-mails (déjà « [Données non publiées] » ou chiffrés en `b64-*`). On ne les stocke pas.
- Dates de naissance (HATVP, RNE, Sénat) : jamais utilisées, ni comme clé ni comme indice de revue. Retirées à la lecture (RNE, HATVP), jamais lues (Sénat). Leur usage comme simple indice de revue est une possibilité notée, non retenue (cf. [rne.md](rne.md)).
- Rubriques patrimoniales : seulement ce que la HATVP publie, telles quelles.

## Dossiers prototypes (17e législature)

| Forme du design | Dossier | Pourquoi |
|---|---|---|
| (a) Procédure accélérée, CMP conclusive, CC, promulgation | **DLR5L17N54085** — Projet de loi d'urgence pour la protection et la souveraineté agricoles | Projet du Gouvernement (ministre porteur), 73 actes, CMP « Accord », saisine du CC, `PROM-PUB` |
| (b) Procédure normale, deux lectures, CMP en échec, dernier mot à l'AN | **DLR5L17N51670** — Fin de vie | Proposition de loi, 159 actes, deuxièmes lectures, CMP « Désaccord », nouvelle lecture, lecture définitive AN, CC, promulgation |

Autres candidats (a) : DLR5L17N51852 (urbanisme et logement), DLR5L17N53187 (mineurs et réseaux sociaux).
Autres candidats (b) : DLR5L17N50692 (mode d'élection à Paris, Lyon, Marseille).

## Volumes (17e législature, en cache)

Environ 1,3 Go au total. Amendements AN 347 Mo ; AMELI 154 Mo ; répertoire HATVP 139 Mo ;
déclarations HATVP 80 Mo ; Syceron 60 Mo ; questions écrites AN 50 Mo. Non téléchargés pour
l'instant : `cri.zip` du Sénat (546 Mo), questions du Sénat (283 Mo), stocks DILA complets (LEGI,
JORF, CONSTIT : plusieurs Go ; seuls les derniers incréments sont inventoriés).

## Décisions ouvertes ajoutées par l'inventaire

7. Orateurs des commissions AN (nom dans la liste fermée des présents) : rester en revue, ou validation automatique par règle ?
8. RNE sans identifiant ni historique : faut-il archiver un instantané à chaque livraison pour reconstituer les mandats locaux dans le temps ?
9. Avis sur les amendements AN : les laisser absents, ou les extraire des comptes rendus en affirmations à relire ?
