# HATVP — déclarations publiées et répertoire des représentants d'intérêts

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Fréquence** : déclarations par livraison (dernière le 02/10/2026) ; répertoire quotidien (24/10/2026).

## Déclarations

| Fichier | Contenu |
|---|---|
| `livraison/opendata/liste.csv` (3,2 Mo, `;`, 13 065 lignes) | une ligne par déclaration publiée : `civilite`, `prenom`, `nom`, `type_mandat` (`depute`, `senateur`, `gouvernement`, `commune`, `epci`, `departement`, `region`, `europe`…), `qualite`, `type_document` (`di`, `dia`, `diam`, `dsp`…), `date_depot`, `date_publication`, `statut_publication`, `nom_fichier`, `open_data` (nom du XML), `url_dossier`, **`id_origine`**, `url_photo` |
| `livraison/merge/declarations.xml` (80 Mo, 5 976 déclarations) | `general/{typeDeclaration, dateDepot, declarationModificative, qualiteMandat, organe, dateDebutMandat, dateFinMandat}` et les rubriques `*Dto` : `activProfCinqDerniereDto`, `activConsultantDto`, `activCollaborateursDto`, `fonctionBenevoleDto`, `activProfConjointDto`, participations, et pour les DSP les rubriques patrimoniales (`immeubleDto`, `assuranceVieDto`…). Chaque rubrique porte `neant` et `items/items/…` |

**Identité du déclarant**
- **Députés** : `id_origine` est le numéro d'acteur AN (`841729` → `PA841729`). 2 531 lignes renseignées sur 2 570, et **les 2 531 existent dans l'AMO**.
- **Sénateurs** : `id_origine` est le matricule Sénat. 1 117 sur 1 132, **tous présents dans `ODSEN_ELUSEN`**.
- **Gouvernement, élus locaux, Parlement européen** : `id_origine` vide. Rapprochement NAME_DATE, en revue.
- Les XML ne portent pas `id_origine`. On relie XML et liste par le nom de fichier (`open_data`).

**Ne pas charger** : adresses, téléphones, e-mails (« [Données non publiées] » ou chiffrés `b64-*`), date de naissance (jamais une clé), commentaires de régime matrimonial.

## Répertoire des représentants d'intérêts (AGORA)

`agora/opendata/agora_repertoire_opendata.json` (139 Mo) : `publications[]`, un représentant par entrée.

**Représentant**
- `denomination`, `nomUsage`, `identifiantNational` et `typeIdentifiantNational` (SIREN, RNA, HATVP), `categorieOrganisation`, `datePremierePublication`.
- `dirigeants[]`, `collaborateurs[]` (personnes : on ne charge que nom, fonction et rôle, sans les rapprocher de responsables publics).
- `affiliations[]`, `clients[]` (avec `identifiantNational`), `activites/listSecteursActivites`.

**Exercices** : `exercices[]/publicationCourante/{dateDebut, dateFin, montantDepense (tranche), chiffreAffaire (tranche), nombreSalaries, nombreActivite}`.

**Actions** : `…/activites[]/publicationCourante/`
- `identifiantFiche`, **`objet`** (texte libre), `domainesIntervention[]`, `publicationDate` ;
- `actionsRepresentationInteret[]/{actionsMenees[], reponsablesPublics[] (catégories), decisionsConcernees[] (« Lois, y compris constitutionnelles »…), tiers[], observation}`.

**Pour le design**
- Les responsables publics visés sont des **catégories** (« Député, sénateur, collaborateur… »), jamais des personnes : aucun lien action → élu n'est possible, ce qui est conforme à l'écran « Pourquoi ce vote ».
- **« Vérifié · l'action cite le texte »** : seulement si `objet` mentionne explicitement le dossier (titre, numéro de texte, sigle comme « PLFSS 2026 »). Règle déterministe ; sinon le lien reste « à vérifier · même sujet, même période ».

## Exemples réels : de la source au canon

Relevés le 24/10/2026. Liens vers le code vérifiés par `tests/test_docs.py`.

### Déclaration d'un député — `HATVP:declaration:afedd0ca-2cd6-4789-85df-8b1bedd6d008`

Brut, 1/2 : `declarations_liste.csv`, une ligne (colonnes vides omises) :

```text
civilite=M.  prenom=Franck  nom=ALLISIO  type_mandat=depute  qualite=Député des Bouches-du-Rhône
type_document=dia  date_depot=2024-08-05  date_publication=2025-06-17
url_dossier=/pages_nominatives/allisio-franck-24180  open_data=allisio-franck-dia30882-depute-13.xml
id_origine=793432
```

Brut, 2/2 : le XML unitaire `declarations/allisio-franck-dia30882-depute-13.xml` (nom pris dans
`open_data`, URL encodée), avec `general/typeDeclaration` et une rubrique `*Dto` par sujet.

Canon :
- identité : `id_origine` 793432 + `type_mandat` depute → `AN:acteur:PA793432`. La page nominative
  `HATVP:declarant:allisio-franck-24180` devient une seconde identité de la même personne
  (EXPLICIT_REFERENCE, vérifiée à 100 % sur la 17e législature) ;
- `canon.declaration` : `{"type": "DIA", "type_libelle": "Déclaration d'intérêts et d'activités", "mandat": "depute",
  "qualite": "Député des Bouches-du-Rhône", "date_depot": "2024-08-05", "date_publication": "2025-06-17", "modificative": false}` ;
- `canon.rubrique_declaree` : une ligne par rubrique (`activProfCinqDerniereDto`, `activCollaborateursDto`…),
  `neant` et `contenu` tels que publiés, **sans** les clés privées (adresse, `b64*`, téléphone,
  e-mail, date de naissance, commentaires) ni les valeurs « [Données non publiées] ».

Sans `id_origine` (membre du Gouvernement) : cas `identite_declarant` avec les acteurs AN homonymes ;
« aucun » crée la personne telle que la HATVP la publie.

Code : [declaration()](../../src/adaptateurs/sources/hatvp/declarations.py#L73), [contenu()](../../src/adaptateurs/sources/hatvp/declarations.py#L53),
[declarant()](../../src/adaptateurs/sources/hatvp/declarations.py#L69) ·
Tests : [test_depute_relie_par_id_origine](../../tests/test_sources_hatvp.py#L34),
[test_rubriques_sans_donnees_privees](../../tests/test_sources_hatvp.py#L43),
[test_membre_du_gouvernement_en_revue](../../tests/test_sources_hatvp.py#L51)

### Représentant d'intérêts et action — `HATVP:representant:SIREN:413728676`

Brut : `repertoire.json` › `publications[]` (une entrée par représentant, ses exercices et ses fiches d'activité).

Canon :
- `canon.representant_interets` : `{"denomination": "AI2P", "type_identifiant": "SIREN", "identifiant_national": "413728676",
  "categorie": "Cabinet de conseil", "premiere_publication": "2017-11-30", "secteurs": ["Energie", "Environnement", "…"]}`.
  L'identité garde le type d'identifiant (`SIREN:`, `RNA:`, `HATVP:`) : deux registres, deux espaces de noms ;
- `canon.action_representation` (une de ses fiches d'activité, exercice 2024) :

```json
{"objet": "Contribuer à l'avant PJT Souveraineté agricole / Agrivoltaïsme / Favoriser le développement des EnR",
 "domaines": ["Energie", "Environnement"], "tiers": ["SYNDICAT DES ENERGIES RENOUVELABLES"],
 "exercice_debut": "2024-01-01", "exercice_fin": "2024-12-31",
 "actions_menees": ["Organiser des discussions informelles ou des réunions en tête-à-tête", "…"]}
```

Cette action parle du sujet du dossier prototype, mais son objet ne cite **ni** le titre exact ni
un numéro de texte : un lien vers DLR5L17N54085 serait au mieux « à vérifier · même sujet, même
période » (affirmation analytique, pas un fait). Il n'est pas encore produit.

Code : [representant()](../../src/adaptateurs/sources/hatvp/representants.py#L41) ·
Test : [test_representant_et_actions](../../tests/test_sources_hatvp.py#L61)
