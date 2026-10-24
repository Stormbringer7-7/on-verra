# TODO — données CivicTrace

État au 24/10/2026. Lots en cours (agents) : amendements → articles et étapes ; interventions du
Sénat → amendements ; barre de parcours (`lecture.parcours_dossier`) ; diffs d'articles et
amendement à l'origine ; fusion d'entités ; questions au Gouvernement (AN) et mises au point de
vote ; sénateurs anciens députés en revue et agenda du Sénat.

## Intégrité des sources

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

## Liens et données manquants

- [ ] Loi promulguée : stocks JORF et LEGI (renumérotation, versions consolidées).
- [ ] Questions au Gouvernement du Sénat (283 Mo, non téléchargées).
- [ ] Comptes rendus des commissions du Sénat.
- [ ] Membres du Gouvernement : rapprochement AN ↔ Sénat proposé en revue.
- [ ] Lobbying → dossier (« Vérifié » si l'action cite le texte, sinon « à vérifier »).
- [ ] RNE : archiver chaque livraison (historique des mandats locaux) ; `ODSEN_MANDAT_LOCAL`.
- [ ] Avis du rapporteur et du Gouvernement sur les amendements AN (non publiés en données structurées).

## Corrections d'adaptateurs relevées par les lots

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

## Relevé par l'API (lot scrutins)

- [ ] Siège publié (`numPlace`) non chargé dans `canon.vote` : l'hémicycle ne peut pas ordonner les groupes de gauche à droite.
- [ ] Groupes du Sénat en double, non fusionnés : « UMP » (ODSEN) et « UMPPO » (AMO `PO286005`), etc.
- [ ] `lecture.participation_scrutin` : plusieurs lignes par personne quand des mandats se chevauchent.
- [ ] Index plein texte (GIN) sur `canon.amendement.dispositif` : la recherche d'amendements prend 1 à 3 s.
- [ ] `canon.intervention.groupe_id` toujours vide (l'API le recalcule depuis l'appartenance datée).
- [ ] `canon.dossier.titre_court` contient le chemin AN ou un fragment Sénat, pas un titre court.
- [ ] Scrutins du Sénat sans étape : ils n'apparaissent dans aucune case de la barre de parcours.

## Couche de lecture (projections)

- [ ] Chiffres par étape et par dossier, rôles d'une personne dans un dossier, composition des institutions.
- [ ] Index de recherche plein texte.
- [ ] Thèmes (vocabulaire contrôlé, règles déterministes) et indicateurs par thème.
- [ ] Indicateurs : distribution de la chambre, seuil des petits échantillons.
- [ ] Ignorer partout les entités retirées de la source (`canon.entite.retiree_de_la_source_le`).

## Pour les écrans (plus tard)

- [ ] HATVP : afficher le lien vers le PDF original de chaque déclaration (`canon.declaration.url`) et vers la page nominative ; les pièces jointes (`attachedFiles`) ne sont pas publiées (contenu vide), aucun lien possible.

## Couverture, vérification, exploitation

- [ ] Bout en bout sur les deux dossiers prototypes (chaque écran a ses données, chaque fait remonte à sa source) — plusieurs passages prévus.
- [ ] Législatures 14 à 16, puis retrait de la chaîne SQLite et des schémas `lNN`.
- [ ] Rafraîchissement automatique (incrémental quotidien), avec contrôles et rapport.
- [ ] Outil de revue humaine (écran triable par priorité) : environ 61 000 cas, plus le RNE.

## Plus tard

- [ ] Données européennes (Parlement européen, eurodéputés).
