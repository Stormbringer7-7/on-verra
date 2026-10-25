# Contrat app ↔ API (Panoptique v2)

Le contrat partagé vit dans `augure/src/core` (alias `@contrat` côté API) :

| Fichier | Rôle |
|---|---|
| `augure/src/core/domain/model.ts` | point d'entrée des DTO, découpés par contexte : `commun`, `parcours`, `dossiers`, `discussions`, `scrutins`, `personnes`, `institutions`, `transparence`, `recherche` |
| `augure/src/core/commands/definitions.ts` | une query par écran, plus la commande `SignalerErreur` ; transport : `POST /<type>` (ApiBus) |
| `api/src/ports.ts` | ports par contexte (`DossiersRepository`, `DiscussionsRepository`, `PersonnesRepository`, `ScrutinsRepository`, `InstitutionsRepository`, `TransparenceRepository`, `RechercheRepository`, `SignalementsRepository`), `Synthetiseur`, `Horloge` |
| `augure/src/infra/fixtures/` | exemples `{ entrée, sortie }` par commande, tirés des deux dossiers fictifs du canevas ; type `Fixtures` exhaustif sur `definitions.ts` |
| `augure/tests/fixtures.test.ts` | charge chaque fixture et vérifie les règles de fond |

## Règles portées par les types

- **Chaque fait porte sa source** : `Provenance { systeme, type, idNatif, url }` (`url` null plutôt qu'inventée) ; passage d'un compte rendu : `Ancre { url, ancre, provenance }`.
- **Chaque rapprochement porte son statut** : `Rapprochement = RapprochementVerifie | RapprochementAVerifier` (`statut`, `methode`, `motif`, et `preuve` ou `avertissement`). Un lien vers un objet est un `Lien<T>` : `{ statut: 'verifie', cible }` ou `{ statut: 'a_verifier', candidat }`. Sans tester `statut`, l'UI n'a pas accès à l'objet : elle ne peut pas montrer un candidat comme un fait.
- **Qui parle** : `Orateur = { type: 'personne', personne } | { type: 'nom_publie', nom }`. Un nom publié n'est jamais rapproché d'une personne par ressemblance (commissions AN, auditionnés).
- **Élus locaux** : `identite: 'personne' | 'fiche_rne'`. Un mandat RNE n'est rattaché à une personne que par la revue humaine (`FonctionDatee.rattachement`, méthode `revue_humaine`).
- **Jamais un chiffre sans « par rapport à quoi »** : `Indicateur { valeur, unite, denominateur, reference, ceQueLaDonneeNeDitPas, periode, calcul }`. Les comptes publiés (amendements déposés…) sont des `Chiffre`, pas des indicateurs.
- **Pas de LLM** : `Synthese = string | null`. Les dépôts rendent null ; le cœur appelle `Synthetiseur` (seul adaptateur : `SansSynthese` → null) ; l'UI affiche « Pas de synthèse disponible ».
- **Pagination** : `DemandePage { page, taille }` → `Page<T> { elements, page, taille, total, suivante }`.
- **Garanties des dépôts** (en tête de `api/src/ports.ts`) : seulement `canon` et `lecture`, liens VERIFIED seulement (au mieux `a_verifier` là où le type le prévoit), entités retirées ou fusionnées ignorées, provenance sur chaque fait, identifiant inconnu → null ou liste vide.

## Écran → commande → DTO → ports → tables

Tables : schéma à jour de la copie d'intégration opendata (migrations 0001 à 0016, projections 10 à 55). « Vide » : état de la base réelle au 24/10/2026, vérifié par `SELECT` en lecture seule.

| Écran | Commande (type) | Entrée | DTO | Ports | Tables |
|---|---|---|---|---|---|
| Accueil | `ConsulterAccueil` (`accueil/consulter`) | — | `Accueil` | `DossiersRepository.aSuivre`, `ScrutinsRepository.entre`, `Horloge` | `lecture.parcours_dossier_synthese`, `lecture.parcours_dossier`, `canon.dossier`, `canon.scrutin`, `lecture.parcours_acte` |
| Dossiers | `ListerDossiers` (`dossiers/lister`) | `FiltreDossiers { etat, origine, theme, legislature, page, taille }` | `ListeDossiers` | `DossiersRepository.lister` | `canon.dossier`, `lecture.parcours_dossier`, `lecture.parcours_dossier_synthese`, `lecture.parcours_acte` |
| Où en sont les textes (carte Chiffres) | `ConsulterAvancement` (`textes/avancement`) | `DemandeAvancement { etape, horsParlement, origine, page, taille }` | `AvancementDesTextes` (files par case, attentes hors du Parlement, textes paginés) | `DossiersRepository.{positions, textesEnAttente}`, `Horloge` | `lecture.parcours_dossier`, `lecture.parcours_dossier_synthese`, `canon.dossier`, `lecture.parcours_acte` |
| Dossier | `ConsulterDossier` (`dossier/consulter`) | `{ id, amendements?: { sort, page, taille } }` | `FicheDossier` | `DossiersRepository.{entete, parcours, ceQuiAChange, etapes, articles, amendements, acteurs, chiffres, sources}`, `ScrutinsRepository.duDossier`, `TransparenceRepository.interetsDe`, `Synthetiseur` | `canon.dossier`, `canon.lien`, `canon.personne`, `canon.fonction`, `lecture.parcours_*`, `canon.etape`, `canon.article_suivi`, `canon.version_texte`, `canon.version_article`, `canon.amendement`, `canon.scrutin`, `canon.intervention`, `canon.audition` (vide), `canon.correspondance`, `canon.action_representation` |
| Étape | `ConsulterEtape` (`etape/consulter`) | `{ dossier, cle: CleCase }` | `FicheEtape` | `DossiersRepository.{barre, etape}`, `DiscussionsRepository.intervenants`, `ScrutinsRepository.duDossier(dossier, cle)`, `Synthetiseur` | `lecture.parcours_dossier`, `lecture.parcours_acte`, `canon.etape`, `canon.document`, `canon.amendement`, `canon.lien` (étape → réunion), `canon.reunion`, `canon.intervention`, `canon.provenance`, `canon.version_article`, `canon.modification_article` (vide) |
| Discussions | `ListerInterventions` (`interventions/lister`) | `{ cible: CibleInterventions, page, taille }` | `ListeInterventions` (`Page<Intervention>`) | `DiscussionsRepository.interventions`, `Synthetiseur` | `canon.intervention`, `canon.reunion`, `canon.organisation`, `canon.point_odj`, `canon.amendement`, `canon.provenance`, `canon.document` |
| Article | `ConsulterArticle` (`article/consulter`) | `{ article, version?, comparaison?: 'precedente' \| 'depose' }` | `FicheArticle` | `DossiersRepository.{article, barre}`, `Synthetiseur` | `canon.article_suivi`, `canon.version_article`, `canon.version_texte`, `canon.modification_article` (vide), `canon.amendement`, `lecture.parcours_acte` |
| Amendement | `ConsulterAmendement` (`amendement/consulter`) | `{ id }` | `FicheAmendement` | `DossiersRepository.{amendement, barre}`, `DiscussionsRepository.surAmendement`, `ScrutinsRepository.surAmendement`, `TransparenceRepository.interetsDe`, `Synthetiseur` | `canon.amendement`, `canon.lien`, `canon.personne`, `canon.organisation`, `canon.avis_amendement` (Sénat), `canon.intervention`, `canon.scrutin`, `canon.version_article` |
| Scrutin | `ConsulterScrutin` (`scrutin/consulter`) | `{ id }` | `FicheScrutin` | `ScrutinsRepository.fiche`, `DossiersRepository.barre`, `Synthetiseur` | `canon.scrutin`, `canon.position_groupe`, `canon.vote`, `lecture.participation_groupe_scrutin`, `lecture.vote_et_groupe`, `canon.organisation`, `canon.amendement`, `canon.article_suivi` |
| Pourquoi ce vote | `ExpliquerVote` (`vote/expliquer`) | `{ scrutin, personne }` | `ExplicationVote` | `ScrutinsRepository.{fiche, vote}`, `DiscussionsRepository.avantLeVote`, `PersonnesRepository.{actesSurLeDossier, fonctions}`, `TransparenceRepository.{declarationsResumees, interetsDe}`, `Synthetiseur` | `canon.vote`, `lecture.participation_scrutin`, `lecture.vote_et_groupe`, `canon.position_groupe`, `lecture.dit_et_vote`, `canon.intervention`, `canon.lien`, `canon.amendement`, `canon.fonction`, `canon.mandat_rne` (vide), `canon.declaration`, `canon.action_representation` |
| Personnes · annuaire | `ListerPersonnes` (`personnes/lister`) | `FiltreAnnuaire { role, q, page, taille }` | `Annuaire` | `PersonnesRepository.annuaire` | `canon.personne`, `canon.fonction`, `lecture.appartenance_groupe`, `canon.organisation`, `canon.mandat_rne` (vide) |
| Personnes · classements | `ClasserPersonnes` (`personnes/classer`) | `DemandeClassement { chambre, critere, ordre, themes, limite }` | `Classement` | `PersonnesRepository.classement` | `lecture.indicateur_ecarts`, `lecture.indicateur_participation`, `lecture.vote_et_groupe`, `lecture.mandat_parlementaire`, `lecture.appartenance_groupe` |
| Personne | `ConsulterPersonne` (`personne/consulter`) | `{ id, onglet?: 'parcours' \| 'choix' \| 'dossiers' \| 'declarations' }` | `FichePersonne` (en-tête + contenu de l'onglet) | `PersonnesRepository.{entete, fonctions, choix, roles, questions}`, `ScrutinsRepository.derniersEcarts`, `TransparenceRepository.declarations` | `canon.personne`, `canon.fonction`, `canon.mandat_rne` (vide), `analytique.cas_revue` (décision `elu_local` appliquée), `lecture.indicateur_*`, `canon.lien`, `canon.amendement`, `canon.intervention`, `canon.question` (vide), `canon.avis_amendement`, `canon.audition` (vide), `canon.declaration`, `canon.rubrique_declaree` |
| Institutions | `ConsulterInstitution` (`institution/consulter`) | `{ institution: 'an' \| 'senat' \| 'gouvernement' \| 'cc' }` | `Institution` (union par `type`) | `InstitutionsRepository.{chambre, gouvernement, conseilConstitutionnel}`, `DossiersRepository.deposesParLeGouvernement` | `lecture.mandat_parlementaire`, `lecture.appartenance_groupe`, `canon.organisation` (groupe_politique, gouvernement), `canon.fonction` (membre_gouvernement), `canon.decision_cc`, `canon.etape` (saisine_cc), `canon.dossier` |
| Représentant d'intérêts | `ConsulterRepresentant` (`representant/consulter`) | `{ id, page, taille }` | `FicheRepresentant` | `TransparenceRepository.{representant, interetsDe}` | `canon.representant_interets`, `canon.exercice_representation`, `canon.action_representation` ; rapprochements : `analytique.affirmation` (vide) |
| Recherche | `Rechercher` (`recherche`) | `DemandeRecherche { q, type, page, taille }` | `ResultatRecherche` | `RechercheRepository.rechercher` | `canon.dossier`, `canon.personne`, `canon.amendement`, `canon.scrutin`, `canon.representant_interets`, `canon.organisation` (FTS `french`) |
| Partout | `SignalerErreur` (`signalement/envoyer`, **command**) | `Signalement { cible, message, contact, ecran }` | `AccuseSignalement` | `SignalementsRepository.enregistrer` | `analytique.signalement` (seule écriture : droit INSERT sur cette table) |

## Écarts au design (canevas) et au plan

**Données absentes : dites dans le type, jamais inventées**

| Ce que montre le canevas | Dans le contrat | Pourquoi |
|---|---|---|
| Titres et résumés « en clair », « ce qui a changé », objet en clair d'un amendement, sens de « pour » et « contre », phrase par thème, déclarations « ramenées au thème » | `Synthese` (null) | aucun LLM : `SansSynthese` |
| Filtre et regroupements par thème (Dossiers, Classements « sur mes thèmes », « Ses choix », « Ses votes sur l'énergie ») | `theme: null`, facette `themes: []`, `themesAppliques: []`, `ChoixTheme[]` vide, `surLeTheme: null` | aucun thème attribué dans `canon` ; pas de classement par mots-clés (l'ancien `KeywordThemeClassifier` n'est pas repris) |
| État du dossier (en cours, adopté, promulgué, rejeté) | `etat: EtatDossier \| null`, déduit du parcours | `canon.dossier.statut` toujours null en base |
| Origine Gouvernement / parlementaires | `origine: Origine \| null` | `initiative` null pour les dossiers Sénat seuls |
| Avis du rapporteur et du Gouvernement (amendement AN CE123) | `avis.publies: false`, liste vide | non publiés par l'AN en données structurées ; présents pour le Sénat (AMELI) |
| « Qui intervient » en commission avec la personne | `Orateur` `nom_publie` | comptes rendus de commission AN : nom publié seulement |
| Élus locaux auditionnés, mandats RNE dans la frise | `canon.audition`, `canon.mandat_rne` | vides en base au 24/10/2026 ; types prêts |
| Questions au Gouvernement | `QuestionResume`, ministère et non ministre | `canon.question` vide en base (migration 0014) ; l'AN ne publie pas la personne qui répond |
| Rapprochements lobbying vérifiés / à vérifier | `LienInteret` avec `Lien<CibleInteret>` | aucun rapprochement produit (`analytique.affirmation` vide) : listes vides en base |
| « Personnes déclarées » d'un représentant | `personnesDeclarees: null` | dirigeants et collaborateurs non chargés dans `canon` |
| Changement article ← amendement | `OrigineModification` (`amendement` vérifié / à vérifier, `compromis_cmp`, `non_etablie`) | `canon.modification_article` vide en base : « origine non établie » |
| Membres du Conseil constitutionnel | absent | non chargés |
| Mises au point (« voulait voter pour ») | `VoteIndividuel.miseAuPoint` | aucune en `canon.lien` en base (doc : 3 452) |

**Choix de modèle**

- **Barre de parcours** : le canevas dessine 10 cases ; le contrat suit la projection `lecture.parcours_dossier` (14 cases en procédure accélérée, 11 en navette, `sans_objet` comprises ; l'UI choisit de les montrer vides ou de les masquer). La « Lecture définitive » du dossier énergie (procédure accélérée) est la case `conclusions_cmp` (« Vote du texte de la CMP ») : ce n'est pas une lecture définitive au sens de l'article 45, alinéa 4 (cf. `opendata/docs/indicateurs.md`).
- **Où en sont les textes** : un texte non abouti est rangé à sa dernière case active (« en examen » si elle est en cours, sinon « en attente » depuis sa fin) ; jamais le mot « bloqué ». Hors du Parlement : décision du Conseil constitutionnel (un mois, art. 61), promulgation (quinze jours, art. 10), publication au JO (aucun délai fixé). Un délai dépassé d'après nos données est toujours `statut: 'a_verifier'`, avec `motif` et `avertissement` : la transmission au Gouvernement n'est pas publiée et l'acte attendu peut manquer dans nos sources. Les files et les attentes sont calculées par le cœur (`lectures/avancement.ts`) sur les positions rendues par le dépôt, sans les filtres de la demande.
- **Étape** = une case de la barre (`{ dossier, cle }`), pas un acte `canon.etape` : une case agrège plusieurs actes (`lecture.parcours_acte`).
- **Dossier** : une seule query pour tous les onglets (Parcours, Le texte, Amendements, Votes, Acteurs, Intérêts) ; seule la liste d'amendements est paginée et filtrée par sort (pas de query `ListerAmendements` en plus du plan).
- **Personne** : `ConsulterPersonne { id, onglet }` rend l'en-tête et le seul onglet demandé (union `ContenuOngletPersonne`).
- **Le graphique « ping-pong »** (plafond de nuits par version, article 2 du dossier location) n'a pas de donnée structurée : seuls les textes des versions et leur diff sont fournis.
- **Couleurs des personnes** (pastilles) : celles de leur groupe (`GroupeRef.couleur`), jamais une couleur propre.
- **Tout groupe a une couleur** : `GroupeRef.couleur` est toujours rempli, et `sourceCouleur` dit d'où elle vient. `officielle` : publiée par la chambre. `famille` : la couleur officielle du groupe AN de la même famille, d'après une table relue (`opendata/src/projections/12_couleur_groupe.sql`) ; c'est le cas de tout le Sénat, qui n'en publie aucune. `arbitraire` : une palette fixe choisie par l'empreinte du groupe, donc toujours la même, pour les groupes à venir aussi. Le contrôle `groupe_actif_couleur_arbitraire` signale un groupe actif sans famille.
- **Supprimés du contrat** : `Synchroniser`, `ListerLegislatures`, `ConsulterAssemblee`, `ConsulterGroupe`, `ConsulterDepute`, `ListerScrutins`, `Explorer`, `ConsulterChampions` et leurs DTO (remplacés par Accueil, Institutions, Personne, Classements). `domain/votes.ts` perd `bilan` (sur l'ancien `VoteDepute`) ; `domain/hemicycle.ts` devient générique (`Siege`). `bus.ts` : `OutputOf` corrigé (il rendait `never`).

## Fixtures de maquette

`augure/src/infra/fixtures/index.ts` exporte `fixtures: Fixtures`, un tableau d'exemples `{ titre, input, output }` par commande (le type échoue à la compilation si une commande manque ou si un exemple n'a pas le format exact). Données fictives du canevas : dossier **énergie** (projet de loi, procédure accélérée, CMP conclusive, Conseil saisi, synthèses présentes comme si elles étaient relues) et dossier **location** (proposition de loi, navette, CMP en échec, dernier mot à l'AN, synthèses absentes). URL fictives sur le domaine réservé `panoptique.invalid`. Aucune adresse ni date de naissance.

Un `FixturesBus` (app) ou un adaptateur mémoire (API) répond à une entrée en cherchant l'exemple dont l'`input` est égal (JSON) ; aucune réponse sinon.

## À faire

Dans [TODO.md](TODO.md), section « API et contrat ». Décidé le 25/10/2026 : nom de l'app « Nos
politiques ont du talent » ; les non-inscrits gardent leur « position majoritaire » (publiée par
l'AN) et restent au classement des écarts, ce qui montre s'ils votent ensemble ou non.
