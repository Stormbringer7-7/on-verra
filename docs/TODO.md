# TODO — tout le dépôt

Trois parties : **En cours** (ce qui est réellement engagé, rien d'autre), **À faire** (relevé,
non commencé, par partie du dépôt), **Idées** (réflexions, rien d'engagé). Une case cochée reste
une ligne si elle porte une décision utile ; sinon elle est retirée. Index de la documentation :
[README.md](README.md).

## En cours

- Liste des médias sources (côté utilisateur) : voir « Intervenants et sources médiatiques ».
- À relire et commiter (25/10/2026, branche `design-v4`) : design v4 (voir « Design v4 » ci-dessous), migrations 0018 à 0020 et projections 11, 12, 60, 61, 65, déjà appliquées à la base locale.
- À commiter (25/10/2026) : liens des comptes rendus AN (migration 0017), chargement de l'app web
  (polices woff2, page de chargement), retrait de l'ancienne chaîne SQLite, réorganisation de la
  documentation.

# À faire

## Données (opendata)

### Intégrité des sources

- [ ] **Hacher les sources textuelles et externes pour garantir leur non-corruption.**
  - Existe déjà : l'empreinte sha256 de chaque *document* analysé (`brut.enregistrement_source`),
    qui sert à sauter l'inchangé et à versionner.
  - Manque :
    - le hash (sha256 + taille) de chaque *fichier téléchargé* (archives zip/tar.gz, HTML, XML,
      CSV), enregistré avec son URL, sa date et son `Last-Modified` ;
    - une vérification **avant chaque lecture du cache** : fichier tronqué ou modifié localement
      → rejet et retéléchargement, jamais une lecture silencieuse ;
    - la comparaison avec la somme publiée quand la source en donne une (data.gouv : `checksum`
      des ressources dans l'API ; à vérifier pour la DILA, l'AN, le Sénat, l'INSEE) ;
    - une alerte quand un fichier change à la source sans changement de date annoncée ;
    - un contrôle d'invariant : chaque `enregistrement_source` remonte à un fichier dont le hash
      est connu.
  - Même exigence pour les sources externes du debatron (web contrôlé) : chaque passage cité est
    haché et horodaté.
- [ ] **Arbre de Merkle par chargement** (complète le hash par fichier, ne le remplace pas).
  - Feuilles : sha256 de chaque document brut (`brut.enregistrement_source.empreinte`) ; nœuds :
    fichier → source → chargement ; une racine par chargement, stockée (nouvelle table) et écrite
    dans le rapport de contrôles.
  - Chaînage : chaque racine inclut la précédente (journal de transparence, historique non
    réécrivable sans que ça se voie) ; publication ou horodatage externe de la racine à étudier.
  - Usages : vérification d'intégrité globale en une comparaison, localisation de l'altération en
    descendant l'arbre, comparaison rapide de deux chargements, **preuve d'inclusion** d'un document
    source pour un fait affiché (API, debatron).
  - Limite : prouve qu'on n'a pas altéré ce qu'on a reçu, pas que la source dit vrai.
  - Commande : `python -m src integrite [verifier|prouver <document>]`.

### Liens et données manquants

- [ ] Loi promulguée : stocks JORF et LEGI (renumérotation, versions consolidées).
- [ ] Questions au Gouvernement du Sénat (283 Mo, non téléchargées).
- [ ] Comptes rendus des commissions du Sénat.
- [ ] Membres du Gouvernement : rapprochement AN ↔ Sénat proposé en revue.
- [ ] Lobbying → dossier (« Vérifié » si l'action cite le texte, sinon « à vérifier »).
- [ ] RNE : archiver chaque livraison (historique des mandats locaux) ; `ODSEN_MANDAT_LOCAL`.
- [ ] Avis du rapporteur et du Gouvernement sur les amendements AN (non publiés en données structurées).
- [ ] 49.3 : publié par l'AN (dossiers L17, vérifié le 25/10/2026) comme acte
  `DeclarationGouvernement_Type` (`AN21-DGVT`, `ANNLEC-DGVT`, `ANLDEF-DGVT`, `CMP-DGVT`) avec
  `typeDeclaration.fam_code = "Art.49.3"` (16 actes, 11 dossiers), suivi de `DepotMotionCensure_Type`
  (`texteAssocie` = la motion) et `DecisionMotionCensure_Type` (`voteRefs` → scrutin, `decision`).
  L'ETL garde la nature `declaration_gouvernement` mais perd `typeDeclaration` : à garder pour
  dire « 49.3 » sans deviner. Préalable aux moments institutionnels (voir « Famille Moments »).

### Corrections d'adaptateurs relevées par les lots

- [ ] AN, étapes : un acte programmé (daté dans le futur) est écrit `statut = 'faite'` ; la barre de parcours le compense, à corriger en amont.
- [ ] AN, promulgation : sans JO publié, `texte_publie.date_publication` reçoit la date de l'acte ; laisser vide.
- [ ] Sénat, textes : les états annexés des lois de finances (« État A »…) sont balisés `article` en Akoma Ntoso et donnent des cas `article_sans_numero` : les reconnaître comme annexes.
- [x] Fixtures inventées corrigées : `PA330008` (Xavier Breton), `PA795386` (Mathieu Lefèvre), vérifiés dans l'AMO.
- [ ] Consignes des agents : la base d'essais doit **finir** par `_essais` (`civictrace_<lot>_essais`).
- [ ] Sénat, scrutins : `Referentiel.indexer` / `amendements_votes` normalisent le numéro par `re.sub(r"\D", "")` : « COM-448 » et « 448 » se confondent.
- [ ] Sénat, interventions : après une section « PRÉSIDENCE DE … », `dossier_id` reste vide alors que l'amendement cité est relié.
- [ ] Sénat, interventions : amendements des missions du PLF/PLFSS (sans `doslegsignet`) non chargés par `senat.travaux` : 4 360 interventions sans lien.
- [ ] Questions AN : personne du ministre qui répond (nom seulement dans le texte) et séance des QAG non reliées ; pas de projection ni d'index plein texte.
- [ ] Amendements : pas d'`Ensemble` (un cas `article_vise_illisible` / `etape_ambigue` ne devient pas caduc si la source se corrige).
- [ ] Sénat, débats : `cri/d20261204.xml` est daté du 06/01/2026 dans l'archive ; `senat.debats` le charge comme séance du 04/12/2026 (`resultats.py` écarte déjà un compte rendu nommé après la date de l'archive : même règle à appliquer).
- [ ] Sénat, scrutins : 67 scrutins ont des décomptes annoncés en séance différents du dump (souvent ±1, déports, corrections) ; le sort proclamé est chargé, l'écart n'est pas exposé.
- [ ] `diffs.py` (`texte_dispositif`) : `.replace("\\r", "")` devenu inutile depuis le décodage COPY (`senat/commun.valeur_copy`).
- [ ] Parcours : délai du Conseil constitutionnel (« décision attendue avant le… ») non publié ; lois de finances non marquées accélérées.

### Relevé par l'API (lot scrutins)

- [ ] Siège publié (`numPlace`) non chargé dans `canon.vote` : l'hémicycle ne peut pas ordonner les groupes de gauche à droite.
- [ ] Groupes du Sénat en double, non fusionnés : « UMP » (ODSEN) et « UMPPO » (AMO `PO286005`), etc.
- [ ] `lecture.participation_scrutin` : plusieurs lignes par personne quand des mandats se chevauchent.
- [ ] Index plein texte (GIN) sur `canon.amendement.dispositif` : la recherche d'amendements prend 1 à 3 s.
- [ ] `canon.intervention.groupe_id` toujours vide (l'API le recalcule depuis l'appartenance datée).
- [ ] `canon.dossier.titre_court` contient le chemin AN ou un fragment Sénat, pas un titre court.
- [ ] Scrutins du Sénat sans étape : ils n'apparaissent dans aucune case de la barre de parcours.

### Couche de lecture (projections)

- [ ] Chiffres par étape et par dossier, rôles d'une personne dans un dossier, composition des institutions.
- [ ] Index de recherche plein texte.
- [ ] Thèmes (vocabulaire contrôlé, règles déterministes) et indicateurs par thème.
- [ ] Indicateurs : distribution de la chambre, seuil des petits échantillons.
- [ ] Ignorer partout les entités retirées de la source (`canon.entite.retiree_de_la_source_le`).

### Pour les écrans (plus tard)

- [ ] HATVP : afficher le lien vers le PDF original de chaque déclaration (`canon.declaration.url`) et vers la page nominative ; les pièces jointes (`attachedFiles`) ne sont pas publiées (contenu vide), aucun lien possible.

### Couverture, vérification, exploitation

- [ ] Bout en bout sur les deux dossiers prototypes (chaque écran a ses données, chaque fait remonte à sa source) — plusieurs passages prévus.
- [ ] Législatures 14 à 16 dans le modèle canonique (l'ancienne chaîne SQLite, qui les couvrait pour les scrutins AN, est retirée depuis le 25/10/2026 ; elle reste dans l'historique git, commit `v2`).
- [ ] Outil de revue humaine (écran triable par priorité) : 127 666 cas au 25/10/2026, plus le RNE.
- [ ] Export SQLite de la base (adaptateur de sortie, par exemple `canon` et `lecture` d'une législature) : à garder possible, pas demandé pour l'instant.
- [x] Rafraîchissement quotidien : service `donnees` (`opendata/docker/canon.sh` : migrations, chargement incrémental, projections, contrôles).

## API et contrat

Relevé à l'intégration du 24/10/2026 ([contrat.md](contrat.md)).

- [ ] Contrat : `VoteDifferent.miseAuPoint` (les mises au point ne s'affichent que dans « Pourquoi ce vote », pas sur l'écran Scrutin).
- [ ] Contrat : filtre par groupe dans `FiltreAnnuaire` ; pagination des questions dans `ConsulterPersonne` ; `FicheAmendement.barre` nullable (un amendement sans dossier renvoie 404).
- [ ] Contrat : sujet de synthèse distinct pour le résumé court d'une étape (`resume_etape` a deux textes dans les fixtures) ; type « interventions » dans `TypeRecherche` (index `intervention.texte_recherche` non utilisé).
- [ ] Fixtures : incohérences relevées par l'adaptateur mémoire (annuaire `total: 961` pour 9 éléments ; en-têtes de Claire différents selon l'onglet ; votes « de la semaine » hors de la semaine) ; fixtures manquantes (article sans version, filtres d'amendements, onglets dossiers/déclarations de Claire, classements hors AN · écarts).
- [ ] API : classement par absences (5 à 25 s) et annuaire (1,5 à 5 s) mesurés pendant un chargement : à remesurer (l'annuaire a été accéléré le 25/10/2026), index `(chambre, date)` sur `lecture.participation_scrutin` ou projection sur 12 mois glissants.

## Design v4 « Filtrer ou voir » (relevé le 25/10/2026)

**Source** : même canevas, renommé « Nos politiques ont du talent — navigation par filtres ».
- Onglets : Actualité · Chiffres · Carte · Recherche · Guide. Suivis et Réglages passent dans l'en-tête en paysage.
- Le cœur est une vue filtrée unique (Explorer) :
  - un fil de filtres par famille (Lois, Personnes, Institutions, Territoires, Action législative) ;
  - une phrase chiffrée, un objet focal avec « Fiche » ;
  - des onglets de faits : interventions, amendements, votes, contrôle, transparence, personnes ;
  - « Regrouper par », « Élargir », comparaison de deux groupes.
- Recherche : 6 familles, déclinaisons, numéros exacts ou ambigus.
- Remplace la navigation du plan v3 ci-dessous ; tokens, composants et écrans du v3 restent valables.

**Lots**
- [x] **Où en sont les textes (contrat et API).**
  - Engorgement par case du parcours et attentes hors du Parlement (Conseil constitutionnel, promulgation, JO).
  - `ConsulterAvancement`, fixtures, cœur, adaptateurs mémoire et Postgres.
- [ ] Où en sont les textes, suite :
  - [x] SQL de `PgDossiers.positions` validé sur la vraie base le 25/10/2026 (2 128 textes non aboutis, 0,3 s). Un renvoi en commission ou une nomination de rapporteur ne vaut pas examen : sans cette règle, 1 533 textes étaient « en examen » en 1re lecture AN, au lieu de 99 ;
  - [x] carte dans Chiffres, et page Textes par file (`/chiffres/textes`) ;
  - contrôle opendata qui ouvre un cas de revue pour chaque délai dépassé d'après nos données ;
  - décrets d'application (lot 4 du plan v3 : échéanciers Légifrance).
- [x] **Faits filtrés (contrat).** `ExplorerFaits` (`faits/explorer`) : contrat (`domain/faits.ts`, règles partagées dans `domain/explorer.ts`), 12 exemples de fixtures, API mémoire et Postgres. Temps réels : dossier moyen 0,6 s, compteurs par personne 0,75 s, par scrutin 0,13 s.
  - [ ] Trop lent sans filtre (61 s au premier appel) et par groupe (4,6 s) : `canon.intervention` fait 661 Mo pour 128 Mo de cache. Projection étroite `lecture.fait_intervention` et index (`canon.amendement (etape_id)`, `canon.scrutin (amendement_id)`, `canon.scrutin (etape_id)`, `lecture.parcours_acte (etape_id)`).
  - [ ] Rapports de commissions d'enquête dans Contrôle (absents de `canon`).
  - [ ] Filtre département, après le chargement des territoires (aujourd'hui dans `indisponibles`).
- [x] Relecture d'un compte rendu AN republié (25/10/2026) : interventions absentes marquées retirées (`Ensemble` par séance), unicité (réunion, rang) remplacée par un index (migration 0019) et le contrôle `intervention_ordre_en_double`. Cause : `CRSANR5L17S2027O1N039`, 45 interventions insérées, 440 décalées, 1 retirée.
- [x] Projections de l'Explorer `lecture.fait_intervention` et `lecture.fait_amendement` (60 et 61), index (migration 0020). Sorties identiques ; sans filtre de 28 s à 0,6 s au premier appel, groupe de 4,7 s à 1,6 s, dossier de 11 s à 0,4 s.
  - [ ] Encore au-delà de 1 s au premier appel : groupe (1,6 s), amendements d'un groupe (construction des fiches d'amendements, `PgDossiers.resumesAmendements`), cache de Postgres froid (128 Mo).
- [ ] Commissions AN : identité des interventions par rang (`an/commissions.py`) ; une republication décale le contenu sous la même identité.
- [x] **Fondations v4** (25/10/2026) : tokens v2, police sans 500, composants v2 (`components/fondations.tsx` : Avertissement, Indicateur à échelle, Puces, Interrupteur, Avant / Après, Pastille de statut), 5 onglets (Actualité, Chiffres, Carte, Recherche, Guide), Dossiers, Personnes et Institutions empilés aux mêmes adresses, pied de page, retour nommé en portrait, fil « / » en paysage. Guide : texte du canevas adapté à nos règles. Carte : avertissement honnête en attendant les données.
- [x] **Explorer** (25/10/2026) : écran `/explorer` sur `ExplorerFaits`, l'état dans l'adresse. Fil par famille, phrase composée depuis les compteurs, objet focal et Fiche (feuille ou panneau), onglets avec compteurs, transparence au style à part, « Regrouper par », têtes qui filtrent, scrutin filtré et « contre son groupe », main levée, comparaison par appui long, « Élargir », « Rien ici », « Ajouter un filtre » ou « Affiner ». Liens depuis Actualité, Recherche, Dossier et Personne.
  - [ ] Contrat : libellé lisible des groupes « par date » (une date ISO, mise en forme par l'UI).
  - [ ] Fiche de l'Explorer : chiffres propres à l'objet (vote uni, présence), quand le contrat les donnera.
  - [ ] Tester l'appui long sur iOS et Android.
- [x] **Lot 2 v4** (25/10/2026) : Réglages (taille du texte, thème, contraste renforcé, animations réduites, exporter, tout effacer), Méthode, Bienvenue au premier lancement, Mes suivis gardés sur l'appareil (boutons Suivre), « Ce qui a bougé » (`ConsulterSuivis`, sans état côté serveur), liens Suivis et Réglages dans l'en-tête paysage, bouton Suivis en portrait, pied de page.
  - [ ] Taille du texte pour les styles qui n'utilisent pas `T`.
  - [ ] Mes suivis : `derniersEcarts` en une requête pour toutes les personnes (3,8 s au premier appel), actes regroupés par dossier.
  - [ ] Thèmes et code postal dans Bienvenue et Réglages, une fois les thèmes attribués et `TrouverRepresentants` faits.
- [x] **Recherche v4** (25/10/2026) : `ChercherParFamilles` (6 familles, 21 déclinaisons comptées, numéros officiels exacts ou ambigus), contrat, fixtures, API mémoire et Postgres, écran. Toucher un résultat ouvre l'Explorer filtré, « Fiche » ouvre l'objet seul. Numéros 0,003 à 0,3 s, une déclinaison 0,3 à 0,7 s, parcourir 2 à 3 s.
  - [ ] Index plein texte des amendements (colonne `texte_recherche` + GIN), puis remettre le dispositif dans la recherche (aujourd'hui : numéro ou titre du dossier).
  - [ ] Étapes, personnes auditionnées, circonscriptions, rapports et déports dans la Recherche, quand leurs données existent.
- [x] **Territoires** (lot 3, 25/10/2026), sans les codes postaux : département de chaque mandat (AN : AMO ; Sénat : `elusen.dptnum` → `dpt.dptcod`) ; projections `lecture.departement`, `elu_departement`, `carte_scrutin` (vue), `presence_elu`, `presence_departement` (année en cours, comparée au groupe) ; `ConsulterCarte`, `ConsulterDepartement` ; écrans Carte (vraie carte, présence AN, présence Sénat ou un vote) et Département.
  - [ ] Codes postaux → circonscriptions et `TrouverRepresentants` : source officielle à charger ; une commune partagée donne ses candidates.
  - [ ] Présence sur 12 mois glissants : index `(chambre, date)` sur `lecture.participation_scrutin` d'abord (aujourd'hui 2 min 24 s).
- [ ] Autres écrans (puis leurs liens dans l'en-tête paysage), autres cartes de Chiffres (chacune avec ses données réelles), mise en page v4 des fiches ; README d'augure à mettre à jour.

**Règles de tous les écrans** (rappelées le 25/10/2026, souvent oubliées)
- [x] **Tout groupe a une couleur** (25/10/2026) : projection `lecture.couleur_groupe` (officielle, sinon famille d'après une table relue, sinon couleur de secours stable), `GroupeRef.sourceCouleur`, contrôle `groupe_actif_couleur_arbitraire`. En base : les 20 groupes actuels du Sénat en famille, 28 anciens groupes en secours.
  - Règle (utilisateur, 25/10/2026) : couleur connue et sûre (officielle, ou même parti qu'un groupe AN), sinon couleur selon la position gauche-droite, sinon couleur aléatoire seedée. Plus de rapprochements de « famille » discutables : Union Centriste, RDSE et Les Indépendants sont en couleur seedée en attendant le niveau gauche-droite.
  - [x] **Niveau gauche-droite** (25/10/2026).
    - Sièges chargés : AN `numPlace` → `canon.vote.siege` (migration 0018) ; Sénat `sennumsie` → lien `siege`.
    - Projection `lecture.position_groupe` : AN, 1 − rang du siège médian (l'AN numérote de la droite vers la gauche). Positions réelles : LFI 0,07, GDR 0,10, ECOS 0,21, LIOT 0,29, SOC 0,32, DEM 0,47, EPR 0,54, HOR 0,64, DR 0,71, UDR 0,85, RN 0,89.
    - Couleur `gauche_droite` (dégradé rouge → bleu) entre `famille` et `arbitraire` ; hémicycle AN ordonné de gauche à droite.
  - [ ] Sénat : la numérotation des sièges ne suit pas l'ordre gauche-droite, et aucun plan de la salle publié par le Sénat n'a été trouvé. D'ici là : pas de position, couleur seedée pour UC, RDSE et Les Indépendants.
- [x] **Hémicycle cliquable et zoomable** (molette, pincement, double tap), sur Scrutin et Institution (`components/zoom/ZoomPan.tsx`, `components/hemicycle/HemicycleZoom.tsx`) ; vérifié à la molette et au double clic dans Chrome.
  - [x] Jusqu'au député (25/10/2026) : `FicheScrutin.votes` (chaque parlementaire en mandat, absents compris, délégation, mise au point, siège publié) et `Institution.membres` (siège : dernier vote AN publié, ou n° de siège Sénat). Un siège touché ouvre la fiche ; liste accessible groupe par groupe. À chaud : fiche scrutin 0,4 à 1 s, composition AN 0,2 à 0,6 s, Sénat 0,1 s.
  - [x] Sièges AN chargés (relecture d'`an.travaux` le 25/10/2026) : 13 groupes AN placés de gauche à droite.
  - [ ] Placement selon le plan réel de la salle à étudier.
  - [ ] Tester le pincement, le glissé et l'inertie sur iOS et Android.
- [x] **Vraie carte de France** : composant `CarteDepartements` (contours Etalab 2025 dérivés d'ADMIN EXPRESS, généralisés à 1 000 m, Lambert-93, outre-mer en 11 encarts, 159 Ko ; `scripts/carte-departements.mjs` les régénère), zoomable, liste accessible.
  - [ ] Écran Carte à brancher sur le contrat territoires (lot 3).
- [x] **Débat et LLM** : le service attend un port. Tant qu'aucun adaptateur n'est branché, aucun élément du débat n'est affiché (ni bouton « Débattre », ni écran « Pas encore disponible »).

**Relevé en passant**
- [x] `npm run test:pg` sur la vraie base : 99 tests sur 99 le 25/10/2026 (valeurs remises à jour après le rafraîchissement : URL des comptes rendus, sort Sénat, ordre gauche-droite des groupes).

## Intégration du design v3 (relevé le 25/10/2026)

**Source**
- Canevas [Parcours législatifs](https://claude.ai/artifact/R33Yw8dE34vLyY9rbaRhDC), devenu « Panoptique v3 » : 17 pages de parcours, écrans en portrait (390 px) et en paysage.
- Design system [Panoptique](https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD), tokens v2.
- L'app suit encore les tokens v1 et le canevas du 23/10.

**Ce qui change**

| Sujet | Aujourd'hui (app) | Design v3 |
|---|---|---|
| Onglets | Accueil · Dossiers · Personnes · Institutions · Recherche | Accueil · **Lois** · **Carte** · **Élus** · Recherche. Institutions passe sous Élus. |
| Étiquettes | mono 11 px en MAJUSCULES (`label`, `meta`) | sans 14/20, graisse 500, casse normale |
| Échelle de texte | body 14, caption 12 | display 40/28 · title 24/20 · lead 21/18 · heading 17 · body 16/25 · label 14 · caption 13 ; jamais de texte à lire sous 15 px |
| Rayons | 2 / 4 | 6 / 8 / 10 / full |
| Couleurs | 16 tokens | ajoute `inkSoft`, `surfaceSoft`, `caution`, `ai`, `diffRemoved`, `diffAdded`, `shadowOverlay` |
| Mise en page | largeur max 1 280 | largeur max 1 200 ; marges 20 / 32 ; sections espacées de 32 / 40 ; cartes 20 / 28 |
| Repères | fil d'Ariane « › » | paysage : fil « / » souligné ; portrait : retour qui nomme la page précédente ; pied de page « Méthode et sources · Accessibilité et réglages » sur chaque écran |
| Composants | encadrés au cas par cas | Avertissement (info, prudence, IA, simulation) ; Indicateur (chiffre en phrase, échelle 0–100 avec la médiane et la moitié des élus du milieu) ; sélecteur segmenté ; puces ; interrupteur ; Avant / Après surligné (jamais barré) |
| Rapprochements | « Vérifié » / « À vérifier » | « Établi » / « À vérifier ». Libellé seulement : le type reste `verifie`. |
| Nouveaux écrans | — | Carte des votes, Département, Qui me représente (code postal), Application des lois, Méthode, Réglages, Bienvenue (premier lancement), Mes suivis, Débat (préparer, débattre, synthèse) |
| Fiche élu | Parcours · Votes · Travail · Intérêts | ajoute **Bilan** : textes non aboutis, absences sur les votes importants, « a dit / a voté » |

**Lots, dans l'ordre.** Chaque lot passe les tests, `tsc` et le lint, puis une comparaison visuelle
au canevas en portrait et en paysage. Les fixtures et [contrat.md](contrat.md) (écarts au design)
sont mis à jour dans le même lot.

- [ ] **Lot 0. Fondations (app seule, fixtures).**
  - [ ] `tokens.ts` v2 : couleurs, échelle de texte portrait et paysage, rayons, espacements, largeur 1 200.
  - [ ] Police sans 500 : woff2 dans `scripts/polices-web.sh`, et le paquet natif `IBMPlexSansCondensed_500Medium`.
  - [ ] Composants de base : Avertissement, Indicateur à échelle, SelecteurSegmente, Puces, Interrupteur, AvantApres, pastille de statut. On fusionne au passage les deux barres de parcours (ligne « App » ci-dessous).
  - [ ] Navigation : onglets Lois / Carte / Élus, anciennes adresses redirigées (`/dossiers`, `/personnes`, `/institutions`) ; fil « / » ; retour nommé en portrait ; pied de page.
- [ ] **Lot 1. Écrans existants au design v3** (contrat actuel, peu de changements de données).
  - [ ] Accueil : « Qui me représente ? », lois à suivre avec la prochaine étape datée, votes de la semaine, « Comprendre autrement ».
  - [ ] Lois : filtres et lien vers Application des lois.
  - [ ] Dossier : boutons Suivre et Débattre ; « Résumé / Très simple » au-dessus de la synthèse ; frise verticale, avec les étapes franchies repliées et les étapes du Sénat décalées à droite ; « En chiffres ».
  - [ ] Étape : « ← Avant / Après → » en haut.
  - [ ] Article : version en colonne (paysage) ou ‹ › (portrait) ; « Sans / Avec modifications » ; « Comparer à » ; surlignage `diff*`.
  - [ ] Amendement, Scrutin, Pourquoi ce vote, Représentant (libellés « Établi ») et Recherche.
  - [ ] Élus : annuaire et classements (filtres Où, Ce qu'on compare, Sens), lien vers les institutions.
- [ ] **Lot 2. Écrans sur l'appareil (aucune donnée envoyée).**
  - [ ] Méthode : texte du canevas, adapté à nos règles (aucun LLM aujourd'hui), plus le formulaire Signaler.
  - [ ] Réglages (`usePreference`) : 3 tailles de texte appliquées aux tokens, contraste renforcé (3e palette), lecture « Très simple » par défaut, animations réduites, thèmes ; Vos données : exporter, tout effacer (le transfert par QR code viendra plus tard).
  - [ ] Bienvenue au premier lancement : thèmes, code postal facultatif.
  - [ ] Mes suivis : lois et élus suivis gardés sur l'appareil.
    - « Ce qui a bougé » : nouvelle query `ConsulterSuivis { dossiers, personnes, depuis }`, sans état côté serveur.
    - Les alertes attendront : notifications locales seulement, rien ne doit passer par un serveur.
- [ ] **Lot 3. Territoires.**
  - [ ] Données :
    - département de chaque circonscription et de chaque sénateur (AMO, Sénat) ;
    - codes postaux → communes → circonscriptions (base La Poste et INSEE ; découpage des circonscriptions par commune, data.gouv). Une commune partagée entre plusieurs circonscriptions donne la liste des candidates, jamais un choix fait par le code ;
    - maires et conseillers départementaux du RNE (fiche par mandat).
  - [ ] Projections : `lecture.carte_scrutin` (répartition par département pour un scrutin) et `lecture.presence_departement`.
  - [ ] Contrat : `ConsulterCarte { scrutin | presence }`, `ConsulterDepartement { code, scrutin? }`, `TrouverRepresentants { codePostal }`. Cette dernière route n'est jamais journalisée (« nous ne le gardons pas »).
  - [ ] Écrans :
    - Carte : vraie carte des départements, zoomable (voir « Règles de tous les écrans » du v4) ; outre-mer en encarts, Français de l'étranger en liste ;
    - Département ;
    - Qui me représente. Les « résumés locaux IA » restent `Synthese` à null.
- [ ] **Lot 4. Rendre des comptes.**
  - [ ] Indicateurs avec leur distribution (médiane, quartiles) dans `lecture.indicateur_*`, pour l'échelle 0–100.
  - [ ] « Votes importants » : critère déterministe et documenté (proposition : votes sur l'ensemble d'un texte et motions de censure).
  - [ ] Bilan : propositions de loi déposées et non examinées, part des amendements adoptés comparée à la moyenne, absences sur les votes importants. « A dit / a voté » attend le registre des déclarations (Idées) : il est absent du type.
  - [ ] Application des lois :
    - inventaire de la source : échéanciers Légifrance (stock DILA DOLE ?) et contrôle de l'application des lois du Sénat ;
    - données `canon.mesure_application` (décret attendu, prévu pour, paru le, ministère) ;
    - query `ConsulterApplicationLois` ;
    - écran, et bilan du ministre sur sa fiche.
- [ ] **Lot 5. Débat simulé**, selon [debatron/PLAN.md](../debatron/PLAN.md).
  - Les écrans Préparer, Débat et Synthèse dépendent du port `Modele` : tant que `SansModele` est le seul adaptateur, rien du débat n'est affiché (ni bouton « Débattre », ni écran).
  - Le vrai résultat du vote (synthèse) se branche sur `ConsulterScrutin`.

**Décisions à prendre (mes propositions entre parenthèses)**
1. Nom dans l'en-tête : le canevas affiche « PANOPTIQUE » (garder « Nos politiques ont du talent » ; Panoptique reste le nom du design system).
2. Code postal : recherche côté API sans journal, ou table embarquée dans l'app, environ 39 000 lignes (API sans journal ; la table embarquée seulement si la règle « rien ne passe par nos serveurs » doit être stricte).
3. Contenus IA (« En clair », « Très simple », « Pourquoi », résumés locaux) : le design les montre relus et marqués ✦ (rester sur « Pas de synthèse disponible » tant qu'aucun LLM n'est branché ; le composant ✦ est prêt).
4. Critère des « votes importants » (voir le lot 4).

## Famille Moments (décidé le 25/10/2026, non commencé)

Une septième famille, objet de Recherche et filtre de l'Explorer : un moment (date ou période),
avec ses informations générales, pour explorer les faits qui l'entourent.

- [ ] **Les dates ne relient rien** : les moments se chevauchent (mobilisation, 49.3 et crise en
  même temps), s'emboîtent (une mobilisation = plusieurs journées, `parent`) et produisent des faits
  **après** eux (une proposition de loi des mois plus tard, une censure après un 49.3). Aucun fait
  n'est rattaché à un moment par sa date : ni « pendant X », ni « en réaction à X ».
- [ ] **Liens sourcés, le cœur de la famille** : fait ↔ moment et moment ↔ moment (mobilisation →
  49.3 → censure), avant, pendant ou après, chacun avec sa nature (cite, répond à, fait suite à,
  constaté par) et la source qui l'établit : acte de dossier (49.3, censure), exposé des motifs,
  exposé sommaire d'amendement, intervention, question, article. Repérage automatique (mention du
  moment dans ces textes) → candidat en revue humaine, jamais un lien direct.
- [ ] **Filtre `moment`** : les faits liés au moment (et à ses moments enfants), toutes dates
  confondues, groupés par nature du lien ; la fiche montre les liens en frise (avant, pendant,
  après).
- [ ] **Période, à part** : un outil de dates (du … au …, réglable, « + 6 mois après »), affichée en
  dates, jamais au nom d'un moment ; elle montre tous les moments qui la recoupent, côte à côte,
  sans rien leur attribuer.
- [ ] **Déclinaisons** : mobilisations (manifestations, grèves, blocages), institutionnels,
  périodes (crise, état d'urgence, campagne).
- [ ] **Moments institutionnels** (49.3, motion de censure, remaniement, dissolution) : construits
  depuis le `canon` (scrutin `motion_censure`, actes de dossier, `canon.fonction`), qu'ils citent
  sans les recopier ; aucune saisie. La fiche du moment mène au scrutin, au dossier, aux personnes.
- [ ] **Fiche** : nature, libellé, début et fin (avec leur précision), revendications, lieux (codes
  INSEE : lien avec Territoires et la carte), acteurs (organisations en texte ; personnes du
  `canon` par lien vérifié seulement), chiffres, sources.
- [ ] **Chiffres de plusieurs sources, côte à côte** (« 1,28 M selon l'Intérieur · 3,5 M selon
  la CGT ») : la comparaison est voulue, montrée comme telle, jamais moyennée ni tranchée. Chaque
  chiffre dit qui l'a publié, où, quand.
- [ ] **Sources** (vérifiées le 25/10/2026) :
  - **AN, dossiers** (déjà chargés) : 49.3, motions de censure et leur vote, en données structurées.
  - **Discours publics DILA / vie-publique.fr** (data.gouv, licence ouverte, `vp_discours.json`,
    153 840 entrées, mis à jour chaque jour) : métadonnées seulement (titre, date, intervenants,
    `circonstance`, `descripteurs` dont « Manifestation » : 1 882 entrées depuis 1979), le texte
    est sur la page. Comptes rendus du Conseil des ministres, déclarations du Gouvernement sur une
    mobilisation. Les déclarations syndicales s'arrêtent en 2009 ; les partis y sont (21 777),
    mais restent hors liste (déclaration d'un acteur, pas une source).
  - **DARES, JINT** (data.gouv) : journées de grève, **annuelles** seulement (pour 1 000 salariés
    depuis 2005, rupture de série) : contexte d'une année, pas d'une journée.
  - **Ministère de l'Intérieur, préfectures** : chiffres de manifestants publiés en communiqués
    (HTML, pas d'open data) ; taux de grévistes de la fonction publique et de l'Éducation nationale
    de même (aucun jeu de données trouvé sur data.gouv ni data.education.gouv). À lire page par
    page, avec empreinte.
  - **Chiffres des organisateurs** : pas de source officielle ; tels que rapportés par un média de
    la liste fermée.
  - **Ministère de l'Intérieur sur data.gouv** (733 jeux, parcourus le 25/10/2026) : aucun sur
    les manifestations, l'ordre public ou les interpellations. Utiles quand même : **résultats
    électoraux** (29 jeux, structurés : moments « élection » sans saisie) et délinquance
    enregistrée (SSMSI, par commune et département, mensuelle avant 2022) comme contexte, jamais
    comme cause.
  - Rien trouvé : comptage indépendant des manifestants, jeu de données d'événements officiel ;
    interieur.gouv.fr refuse les robots (403).
- [ ] Chaque source : URL, date, empreinte de la page ; fiche dans `opendata/docs/sources/` avec
  un exemple réel.
- [ ] **Saisie** (proposition) : fichiers relus et versionnés (`opendata/data/moments/`), le
  commit vaut décision humaine ; l'ETL vérifie les sources et calcule les empreintes ; stockés dans
  `analytique`, pas dans `canon`. Plus tard, le port `Actualites` propose, un humain valide.
- [ ] Touche : contrat (`FiltresFaits.moment`, familles, `FicheVisee`), migration et chargeur,
  dépôts pg et mémoire, fixtures avec des moments réels, écran de fiche.

## App (augure)

- [ ] Fusionner `ui/components/commun/BarreParcours` (`BarreDossierVue`, `BarreCompacte`) et `ui/components/dossiers/BarreDossier`.
- [ ] Lien « Débats » depuis la fiche dossier : les interventions ne sont accessibles que depuis une étape (« Qui intervient ») ou un amendement.
- [ ] Chargement web : le script fait 314 Ko compressé (surtout react-dom et react-native-web) ; découper par écran seulement si les 2,3 s mesurées en 4G lente ne suffisent pas.

## Déploiement

- [ ] Rôle Postgres dédié à l'API (`SELECT` sur `canon` et `lecture`, `INSERT` sur `analytique.signalement`), avec des droits qui survivent au `DROP SCHEMA lecture` de `projeter`.
- [ ] Limite de débit sur `/api/signalement/envoyer`.
- [ ] Supprimer sur le serveur l'ancienne base `big-brother` (schémas `lNN`) et le dossier `opendata/publication/`, plus lus par rien.
- [ ] Dépôt GitHub `on-verra` : désactiver GitHub Pages et supprimer la branche `gh-pages` (base SQLite d'`on_verra`, plus mise à jour), ou la garder comme archive ; le renommer `big-brother` si souhaité (GitHub redirige l'ancienne adresse).

# Idées

## Comparer par rapport à un contenant (périmètres) — réflexion, rien d'engagé

Principe : on ne compare jamais deux objets en sens unique ; on compare la **position de chacun
dans un contenant**, et seulement si la mesure a la même définition dans les deux. Déjà fait une
fois sans le dire : la participation rapportée à celle du groupe sur le même scrutin
(`projections/20_participation.sql`).

- [ ] **Périmètre** (« curseur », zoom sur les données) : ensemble nommé servant de contenant.
  - Types : territoire (commune → EPCI → département → région → pays → UE → monde),
    institution (chambre, commission, gouvernement), groupe, ensemble déclaré.
  - Graphe, pas arbre : un député est dans un groupe, une commission, un département ; un pays
    peut être en Europe et au Moyen-Orient.
  - Inclusions datées, sourcées, avec statut ; incertain → revue.
- [ ] **Mesure** : numérateur, dénominateur, unité d'occasion (scrutin, année, habitant), niveaux
  où elle a un sens, définition par source (un « vote public » n'est pas le même partout).
- [ ] **Position** d'une entité dans un périmètre : rang, centile, écart à la médiane, effectif
  du contenant, comparable ou non (et pourquoi).
- [ ] Trois comparaisons :
  - verticale : un élément et son contenant ;
  - horizontale : des éléments d'un même contenant ;
  - croisée : des éléments de contenants différents, par leurs positions relatives, jamais les
    valeurs brutes.
- [ ] Garde-fous :
  - jamais de moyenne de moyennes (recalcul depuis les unités de base, ou pondération explicite) ;
  - seuil des petits effectifs ;
  - « non comparable » affiché avec la raison plutôt qu'une comparaison forcée ;
  - population de référence toujours remontable.
- [ ] Modèle esquissé :
  - `canon.perimetre` (une entité) et `canon.inclusion` (contenant → contenu, `du`/`au`,
    source, statut) ;
  - `lecture.mesure` (briques numérateur/dénominateur) et `lecture.position` ;
  - paramètre `perimetre` dans l'API ;
  - dans l'app : fil d'Ariane de zoom, et un élément montré sur la distribution de son contenant.
- [ ] Étapes envisagées :
  1. réécrire participation et écarts sur ce modèle, à résultat identique ;
  2. hiérarchie territoriale INSEE (COG), reliée aux circonscriptions et au RNE ;
  3. zoom dans l'app ;
  4. niveau européen.
- Questions ouvertes :
  - quelles mesures traversent les niveaux (votes : élus seulement ; INSEE et Eurostat : de la
    commune au continent) ;
  - les ensembles composés par les utilisateurs.

## Registre des déclarations et vérification — réflexion, « immense chantier côté data »

But : vérifier ce que disent les politiques, y compris hors des textes de loi (un député qui dit
du bien d'un journal puis se contredit).

- [ ] **Verbatim** : texte exact, le plus fidèle possible, avec son empreinte, sa source, sa date
  et son contexte (la question posée).
  - Prolonge `canon.intervention` hors de l'hémicycle.
  - Degré de fidélité noté : texte officiel intégral, citation entre guillemets, transcription.
  - Une paraphrase n'est pas un verbatim ; une attribution incertaine part en revue.
- [ ] **Compression** dérivée, par le port `Modele` : thèses ; position envers chaque entité citée
  (journal, loi, personne) ; chiffres et leur période ; engagements datés ; faits revendiqués sur
  soi (« j'ai voté contre »).
  - Chaque élément pointe vers un extrait exact du verbatim. Le code vérifie que l'extrait existe :
    sinon, rejet.
  - Versionnée par l'empreinte du verbatim, le modèle et la version du prompt.
  - Ne remplace jamais le verbatim.
- [ ] **Comparaison de sens** sur les compressions, entre paires candidates seulement (même
  personne ou même périmètre, même entité ou même thème, même fenêtre de temps).
  - Relations : convergence, divergence, nuance, changement assumé, contexte différent, sans
    rapport.
  - Chaque relation est justifiée par des extraits des deux verbatims, et reste « générée »
    jusqu'à la revue. L'app n'affiche une contradiction qu'après la revue, et toujours avec les
    deux citations datées côte à côte, sans verdict automatique.
- [ ] **Vérification**, du plus sûr au plus risqué :
  1. contre `canon` (votes, amendements, participation rapportée à un périmètre) ;
  2. contre la statistique publique (INSEE, Eurostat : série, période, millésime) ;
  3. contre les déclarations passées de la même personne.
- [ ] Avant toute confiance dans le modèle :
  - un jeu de référence annoté à la main (quelques centaines de paires), qui sert à mesurer la
    précision, à comparer plusieurs modèles et à valider chaque changement de modèle ;
  - le coût chiffré sur un échantillon réel avant de lancer.
- [ ] Tables esquissées : `analytique.compression` et `analytique.relation_sens`, rattachées à
  `analytique.affirmation`.
- [ ] Risques :
  - juridiques : citation exacte, source vérifiable, droit de réponse, « Signaler une erreur » ;
  - biais de couverture : couverture mesurée et affichée par groupe ;
  - volume de revue : l'outil de revue devient prioritaire.
- [ ] Premier pas envisagé : déclarations de sources officielles, confrontées aux votes. Pas de
  presse à ce stade.

### Intervenants et sources médiatiques

- [ ] **Règle** : un média, traditionnel ou indépendant, n'est une source que **si et seulement si
  l'intervenant est qualifiable de manière canon**. Un docteur en droit et un essayiste, c'est un
  fossé.
- [ ] **Qualification** prouvée par un registre officiel, datée, sourcée, avec statut
  (`canon.qualification`) :
  - docteur : theses.fr / ABES, IdRef ;
  - enseignant-chercheur : nominations au JO, HAL ;
  - médecin : RPPS ;
  - avocat : annuaire du CNB ;
  - magistrat, haut fonctionnaire : nominations au JO ;
  - élu, ministre : déjà en canon.
- [ ] La qualification dépend du domaine : un docteur en droit n'est pas qualifié en
  épidémiologie (sujet de la compression comparé au domaine de la qualification).
- [ ] Rapprochement nom publié ↔ registre : comme pour le RNE, nom tel que publié, tout cas
  incertain en revue, jamais d'homonyme qui qualifie quelqu'un d'autre.
- [ ] Liste des médias sources : **en cours côté utilisateur, non figée**. Liste fermée : pas de
  réseaux sociaux, de sites de partis ni d'agrégateurs (GDELT écarté) ; INA par convention
  seulement.
- [ ] Open data repérées (à inventorier dans `docs/sources/`, échantillon réel à l'appui) :
  - **Discours publics DILA / vie-publique.fr** (plus de 100 000 textes, quotidien, orateur,
    fonction, thèmes) : premier corpus de verbatim hors Parlement. À vérifier : présence des
    interviews de ministres.
  - **Registres CPPAP** (data.culture.gouv.fr) : publications et services de presse reconnus ;
    filtre d'entrée de la liste des médias.
  - **Aides à la presse par titre** (ministère de la Culture) : contexte de chaque source. À
    vérifier : années après 2021.
  - **Temps de parole Arcom** : législatives 2022 et 2024 sur data.gouv.fr ; relevés courants à
    chercher sur arcom.fr. Dit où et quand une personne s'exprime, et mesure l'exposition par
    périmètre.
  - Propriété des médias : la carte du Monde diplomatique et d'Acrimed est sur GitHub (exclu) ;
    équivalent officiel à trouver.

## Contexte et comparaison dans l'app — propositions du 24/10/2026

Déjà en place : chaque `Indicateur` porte sa référence, son dénominateur et « ce que la donnée ne
dit pas » ; participation rapportée au groupe sur le même scrutin ; écarts seulement quand le
groupe a une majorité nette ; écran « Pourquoi ce vote » (faits publics rassemblés, sans causalité).

- [ ] Comparer une personne à elle-même dans le temps (avant / après un changement de groupe ou de
  fonction) et à la distribution de la chambre (médiane, quartiles, pas un rang sec).
- [ ] Comparer un dossier aux dossiers de même nature et procédure (durée, amendements, lectures) ;
  un amendement aux autres du même article, auteur ou groupe ; un scrutin à la participation
  habituelle pour ce type de scrutin.
- [ ] Présences croisées, toutes publiées : « absent du scrutin, en réunion de commission au même
  moment » est un fait (l'heure des scrutins n'est pas publiée : à vérifier source par source).
- [ ] Ce qui n'est pas une absence, à exposer : délégation, déport, mise au point, main levée,
  ministre.
- [ ] Mettre côte à côte deux personnes, groupes ou dossiers (même période, scrutins communs), et un
  fil d'Ariane qui garde la période et le thème choisis.
- [ ] Les deux chambres sur un même texte : ce que le Sénat change, ce que l'AN rétablit, article
  par article.
- [ ] « Mon territoire » : depuis une commune, tous ceux qui la représentent à chaque niveau (codes
  officiels seulement : COG, table communes ↔ circonscriptions). Rejoint les périmètres.
- [ ] Avec un LLM (port `Synthetiseur`/`Modele`, sorties « générées » jusqu'à la relecture) :
  résumer une intervention en gardant les citations exactes, cartographier les arguments d'un
  débat par camp, expliquer le changement d'un article entre deux versions.

Le debatron a son propre plan ([debatron/PLAN.md](../debatron/PLAN.md)) : il ne démarre pas avant
que l'app soit prête.

## Plus tard

- [ ] Données européennes (Parlement européen, eurodéputés) : un niveau de plus pour les
  périmètres.
