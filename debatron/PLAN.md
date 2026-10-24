# Debatron — plan

> Statut : plan à valider en équipe, aucun code. Débats simulés ou réels autour de textes de loi,
> avec débatteurs, public et modérateur, chacun **humain ou agent**.

## 1. Principe : un rôle = un port, deux adaptateurs

Chaque rôle est défini par ce qu'il reçoit et ce qu'il peut faire, jamais par sa nature. Le moteur
du débat ne sait pas s'il parle à une personne ou à un agent.

```
                 ┌──────────────── Moteur de débat (règles, tours, état, journal) ────────────────┐
                 │                                                                                │
Port Débatteur ──┤◀─ AdaptateurHumain (interface)      AdaptateurAgent (port Modèle + outils) ─▶│
Port Public    ──┤◀─ AdaptateurHumain (votes en direct)  AdaptateurAgent (panel simulé)  ─▶│
Port Modérateur──┤◀─ AdaptateurHumain (console)        AdaptateurAgent (port Modèle + outils) ─▶│
                 │                                                                                │
Port Modèle ─────┤──▶ SansModele (provisoire) · factice (tests) · fournisseurs LLM (à comparer)  │
Port Sources ────┤──▶ liste fermée : CivicTrace (canon) · sources institutionnelles · grands médias │
Port Journal ────┘──▶ transcript horodaté, sources citées, décisions du modérateur           │
```

Un agent = un **rôle** (consignes, position, niveau) + un **modèle** (port Modèle). Le rôle ne
dépend d'aucun fournisseur : changer de modèle, c'est changer d'adaptateur, pas de code métier.

Toutes les combinaisons sont permises, en particulier les deux extrêmes :

| Mode | Débatteurs | Public | Modérateur | Usage |
|---|---|---|---|---|
| **100 % humain** | humains | humains | humain (avec ses outils) | débat réel outillé, classe, association |
| **100 % agent** | agents | agents | agent | simulation, exploration d'arguments, tests |
| Mixte | ex. 1 humain contre 1 agent | humains | agent | entraînement, découverte d'un texte |

Le moteur ne fait **aucune** hypothèse sur le temps de réponse (un agent répond en secondes, un
humain en minutes) : les tours ont un délai configurable, et un adaptateur humain peut passer.

## 2. Les rôles

### Débatteur (humain ou agent)
- Défend une **position** sur une question précise (un article, un amendement, l'ensemble d'un texte).
- Peut, à son tour : **argumenter**, **citer une source** (extrait + référence), **répondre** à un
  argument adverse, **concéder**, **poser une question** à l'adversaire.
- Chaque prise de parole est structurée : texte, arguments (liste), sources citées, cible (à quel
  argument elle répond). L'agent produit cette structure ; l'humain la remplit via l'interface
  (le texte libre suffit, les champs aident).
- Un agent incarne une **position** (« pour l'article 2 tel qu'adopté par l'AN », « groupe A en
  1re lecture »), jamais une personne réelle qui parlerait à sa place.

### Public (humain ou agent)
- Réagit **+ / −** à chaque prise de parole, pour un ou plusieurs débatteurs, éventuellement avec
  un motif court (« argument sourcé », « hors sujet », « attaque personnelle »).
- Un public d'agents est un **panel** : chaque membre a un profil d'auditeur (connaissances,
  sensibilités, ce qui le convainc), pas une identité réelle. Les réactions sont des sorties
  structurées (débatteur, signe, motif), agrégées par le moteur.
- Le public ne parle pas dans le débat (sauf questions du public, si le format le prévoit, filtrées
  par le modérateur).

### Modérateur (humain ou agent) — garde-fou
- **Régule les tours** : ordre de parole, temps ou longueur, droit de réponse, fin du débat.
- **Vérifie les faits** à la demande ou d'office, avec ses outils (section 3), et publie un
  verdict sourcé : « confirmé », « inexact », « non vérifiable », « hors corpus ».
- **Gère le sourcing des débatteurs** : une source citée est-elle réelle, dit-elle ce qu'on lui
  fait dire, est-elle dans le corpus autorisé ?
- **Garde-fou contre les mauvais usages** : il peut avertir, retirer la parole, masquer une
  intervention, clore le débat (attaques personnelles, désinformation délibérée, propos haineux,
  usurpation d'une personne réelle, détournement hors du sujet).
- Toutes ses décisions sont journalisées avec leur motif ; un modérateur agent peut être doublé
  par un humain qui a le dernier mot (mode « supervision »).

## 3. Outils du modérateur (et des débatteurs agents)

| Outil | Ce qu'il fait | Source |
|---|---|---|
| `chercher_dans_le_dossier` | retrouve un article, une version, un amendement, un scrutin, une intervention | CivicTrace (port de lecture) |
| `verifier_citation` | compare un extrait cité au passage réel du compte rendu ou du texte | CivicTrace |
| `verifier_chiffre` | confronte un chiffre (vote, résultat, nombre d'amendements…) aux données | CivicTrace |
| `qui_a_dit` | retrouve l'orateur et le contexte d'une phrase prononcée | CivicTrace (interventions) + déclarations publiques (§6 bis) |
| `chercher_actualites` | articles sur le sujet, **datés**, dans une fenêtre temporelle (au moment du vote, ou aujourd'hui) | port Actualités (§6 bis) |
| `chiffre_insee` | série ou indicateur statistique, avec millésime, champ, territoire (code COG) | port Statistiques (§6 bis) |
| `dires_de` | ce qu'une personnalité a déclaré hors hémicycle, verbatim, avec support et date | port Déclarations (§6 bis) |
| `chercher_dans_les_sources` | recherche limitée aux domaines de la liste fermée (section 3 bis), rien d'autre | port Recherche (notre code, indépendant du fournisseur LLM) |

Les outils sont **définis et exécutés par le debatron**, jamais par un fournisseur LLM : la même
boîte à outils sert quel que soit le modèle, et chaque résultat passe par nos règles de fiabilité.
| `avertir`, `donner_la_parole`, `retirer_la_parole`, `masquer`, `clore` | actions de régulation | moteur |

### 3 bis. Sources autorisées : une liste fermée

Seules **trois familles** de sources existent pour le debatron. Tout le reste (dépôts de code,
forums, blogs, réseaux sociaux, sites de partis, wikis, agrégateurs…) n'est **jamais** consulté :

| Famille | Contenu | Usage |
|---|---|---|
| **CivicTrace** | toutes les données `canon` (jamais `analytique` ni les cas en revue) | vaut comme preuve |
| **Institutionnelles** | officielles et statistiques publiques : legifrance.gouv.fr, assemblee-nationale.fr, senat.fr, conseil-constitutionnel.fr, conseil-etat.fr, ccomptes.fr, insee.fr, vie-publique.fr, data.gouv.fr, hatvp.fr, gouvernement.fr, elysee.fr, services statistiques ministériels (DREES, DARES…), eur-lex.europa.eu, europarl.europa.eu, Eurostat… | vaut comme preuve (chiffrée : avec sa date et son millésime) |
| **Grands médias connus**, dont indépendants | presse nationale et régionale, agences, audiovisuel public et privé, médias indépendants reconnus — liste nominative à valider (critère : **pluralisme**, pour qu'aucun camp ne soit privé de ses sources) | « rapporté par <média>, <date> », jamais une vérification seule |

- La liste est une **configuration** versionnée ; un débat peut la **restreindre**, jamais
  l'étendre.
- Le verdict de vérification dit **d'où vient la preuve** et de quelle famille : un fait trouvé
  seulement dans un média n'est pas « confirmé », il est « rapporté par … ».
- Un débatteur humain qui cite une source hors liste est marqué « hors corpus » par le modérateur ;
  un agent n'y a pas accès.

Règle : les outils renvoient des **faits sourcés** (avec lien et passage) ; le modérateur ne
transforme jamais un « non trouvé » en « faux ». Seules les données 100 % fiables de CivicTrace
servent de base (cf. `opendata/docs/rapprochements.md`).

## 4. Niveaux de difficulté

La difficulté règle l'adversaire agent, le modérateur et le public, pas les règles du jeu.

| Niveau | Débatteur agent | Modérateur | Public agent |
|---|---|---|---|
| **Découverte** | arguments simples, une source à la fois, concède facilement, explique ses termes | bienveillant, aide à sourcer | indulgent, récompense la clarté |
| **Intermédiaire** | arguments structurés, sources systématiques, réponses aux objections | vérifie les chiffres cités | équilibré |
| **Expert** | argumentation serrée, exploite les failles, sources multiples, questions pièges | vérifie tout, sanctionne l'approximation | exigeant, récompense la preuve |

Côté technique, un niveau combine : l'**effort** de raisonnement du modèle, la **consigne** de
style et d'exigence, le **nombre d'appels d'outils** permis par tour, et la **sévérité** du
modérateur. Les niveaux se calibrent avec une petite batterie de débats de référence (évaluation).

## 5. Déroulé d'un débat

1. **Préparation** : choix de la question (dossier, article, amendement), du format, des
   participants et de leur nature, du niveau, du corpus autorisé (CivicTrace + liste de domaines).
2. **Dossier de contexte** remis à tous (le même pour tous) : texte en jeu, versions, amendements,
   positions et votes réels, arguments réels tirés des comptes rendus — chaque élément sourcé.
3. **Ouverture** par le modérateur, puis tours. Format retenu : la **table ronde**, N débatteurs
   (le face-à-face n'en est que le cas N = 2) : propos liminaires de chacun, échanges où le
   modérateur distribue la parole (équité de temps, droit de réponse à qui est mis en cause),
   tour de conclusion.
4. **Vérifications** : sur demande d'un débatteur ou d'office ; le verdict est affiché dans le fil.
5. **Clôture** : synthèse du modérateur (arguments par camp, sources citées, vérifications), et
   résultat du public (réactions agrégées, évolution au fil des tours).
6. **Journal** complet, consultable pendant la session. Débats **privés et éphémères** dans un
   premier temps : rien n'est conservé après la fin de la session, sauf export explicite par un
   participant (à confirmer).

## 6. Contrat de données avec CivicTrace

Le debatron lit CivicTrace par un port en lecture seule ; il n'écrit jamais dedans.

| Bloc | Contenu |
|---|---|
| Texte en jeu | versions de l'article, amendements, sort, avis (Sénat) |
| Arguments réels | interventions publiées : texte, orateur, groupe, ancre du compte rendu |
| Positions réelles | votes nominatifs, positions de groupe, écarts |
| Contexte | étapes, chronologie, décision du Conseil constitutionnel, lobbying déclaré (marqué « à vérifier ») |

Les versions d'article arriveront avec le système de navette de CivicTrace (en cours).

## 6 bis. Sources hors CivicTrace : actualités, INSEE, déclarations et témoignages

Ce sont des éléments **cruciaux** du débat : un texte se discute avec ce qui se passe dans le pays,
les chiffres qui le décrivent et ce que les personnalités en disent. Chacune a son port, ses
adaptateurs et son **statut de fiabilité** affiché à côté de chaque élément cité. Toutes puisent
**uniquement** dans la liste fermée (§3 bis).

| Source | Port | Où | Ce qui est un fait | Ce qui ne l'est pas |
|---|---|---|---|---|
| **Actualités** | `Actualites` | grands médias de la liste | qu'un média a publié tel article, à telle date, avec tel passage | le contenu de l'article : « rapporté par <média>, <date> » |
| **Statistiques** (INSEE en tête) | `Statistiques` | sources institutionnelles | la valeur publiée, avec millésime, champ, unité, territoire (code COG, déjà chargé par CivicTrace) | une interprétation ou une comparaison non publiée par l'institution |
| **Déclarations d'une personnalité** (discours, communiqués, interviews, tribunes) | `Declarations` | institutionnelles (discours et communiqués officiels), médias de la liste (interviews, tribunes publiées par le média lui-même) | le verbatim tel que publié par l'institution ou par le média qui a mené l'interview | une citation reprise par un autre média : « rapporté par … » ; une paraphrase n'est jamais une citation |
| **Témoignages** | `Temoignages` | CivicTrace (auditions en commission), médias de la liste | qui a témoigné, où, quand, verbatim | la généralisation (« les agriculteurs pensent… ») |

Conséquence de la liste fermée : réseaux sociaux et sites de partis ne sont pas consultés ; une
déclaration faite là n'entre dans un débat que si un média de la liste ou une institution l'a
publiée.

Règles communes :
- **Date et fenêtre temporelle** : chaque élément est daté ; un débat choisit sa fenêtre
  (« au moment du vote » ou « aujourd'hui ») et le modérateur signale un élément hors fenêtre.
- **Intégrité de toute source** (exigence) : chaque document porte des empreintes — du fichier brut
  (déjà le cas dans CivicTrace), du **texte normalisé** (insensible à la mise en page, aux pubs) et
  de **chaque passage cité** — et un horodatage de récupération. À chaque relecture :
  - texte identique → rien ; texte modifié → nouvelle version gardée, ancienne conservée, citation
    marquée « modifiée depuis », avec le différentiel ;
  - document disparu → marqué « retiré par la source le … » (jamais supprimé chez nous : le retrait
    est lui-même une information) ;
  - signature de l'émetteur (ex. C2PA) prise en compte quand elle existe, rare aujourd'hui.
- **Faux et piratage** : un article n'est retenu que s'il est vu par **deux canaux du même média**
  (ex. flux + site, ou API + site) ; un fait rapporté par un seul média reste « rapporté par » ;
  plusieurs médias indépendants sur un même fait = corroboration, affichée comme telle.
- **Rattachement aux personnes** : une déclaration n'est reliée à une personne de CivicTrace que
  par un identifiant certain (compte officiel déclaré, référence explicite) ; sinon le nom publié
  reste tel quel et le cas part en revue humaine — jamais par ressemblance de nom.
- **Contexte obligatoire** : `verifier_citation` montre le passage autour de la citation, pour
  repérer une phrase sortie de son contexte.
- Les agents **citent** une personnalité, ils ne parlent jamais à sa place (§7).

## 7. Garde-fous

- Une simulation est **toujours affichée comme telle** et n'est jamais réinjectée dans CivicTrace
  comme un fait.
- Pas d'agent qui parle **au nom d'une personne réelle** ; on cite ce qu'elle a dit, sourcé.
- Tout argument d'agent tiré d'une intervention réelle **cite son passage** ; un argument inventé
  est marqué comme tel.
- Le modérateur agent applique une politique écrite (ce qui est interdit, les sanctions) ; ses
  décisions sont motivées et contestables par un humain.
- Les participants humains sont informés quand ils débattent avec un agent.

## 8. Choix techniques proposés

- **Ports et adaptateurs partout**, comme CivicTrace : moteur pur (état, règles, tours), ports
  Participant / Sources / Journal / Horloge, adaptateurs humain (interface temps réel), agent
  (LLM), CivicTrace, mémoire (tests).
- **Agents : port `Modele`, aucun fournisseur imposé.** Il faut pouvoir en tester plusieurs et
  les comparer sur les mêmes débats. Le port reçoit une requête neutre (consignes, contexte stable,
  fil du débat, outils disponibles, schéma de sortie attendu, niveau d'effort) et rend une réponse
  neutre (sortie structurée ou appels d'outils demandés, modèle et version, consommation).
  - La **boucle d'outils est à nous**, pas au SDK d'un fournisseur : le moteur exécute les outils
    et renvoie les résultats, à l'identique pour tous les modèles.
  - La **sortie structurée est validée par nous** (schéma JSON) ; un modèle qui ne la respecte pas
    voit sa réponse rejetée et journalisée, pas réparée en silence.
  - Chaque adaptateur déclare ses **capacités** (appels d'outils natifs, sortie structurée, cache
    de préfixe, raisonnement réglable) ; le moteur s'adapte, le rôle ne change pas.
  - Adaptateurs : **`SansModele`** (provisoire, comme `SansSynthese` de CivicTrace : l'agent
    « passe son tour » en le disant), **factice** (réponses scriptées, déterministes, pour les
    tests), puis un adaptateur par fournisseur à évaluer.
  - Le journal enregistre pour chaque prise de parole d'agent le modèle, sa version et la version
    des consignes, pour comparer les modèles entre eux.
- **Coût** : le dossier de contexte est identique pour tous les agents d'un débat → préfixe stable
  (outils, consignes, dossier ; le fil du débat après), mis en cache quand l'adaptateur le permet.
  Un panel de public agent multiplie les appels : son modèle se choisit par configuration.
- **Éphémère d'abord** : l'état d'un débat vit en mémoire le temps de la session (port Journal en
  mémoire) ; un adaptateur persistant viendra si l'on rend les débats partageables.
- **Temps réel** pour les humains : WebSocket ou équivalent ; l'interface peut réutiliser le
  contrat et le style de l'app (Panoptique).
- **Tests** : débats 100 % agents rejoués avec des adaptateurs factices (déterministes) pour le
  moteur ; une batterie de débats de référence pour calibrer les niveaux.

## 9. Lots

1. Moteur de débat pur (état, tours, journal) + port `Modele` avec `SansModele` et adaptateur
   factice + tests.
2. Port Sources CivicTrace (lecture) + dossier de contexte d'un texte.
2 bis. Ports `Actualites`, `Statistiques` (INSEE), `Declarations`, `Temoignages` : contrats et
   adaptateurs factices, puis choix des sources réelles.
3. Débatteur agent + modérateur agent (outils de vérification) : débat 100 % agent, sur plusieurs
   modèles.
4. Public agent (panel, réactions structurées, agrégation).
5. Adaptateurs humains + interface temps réel : débat 100 % humain outillé, puis mixte.
6. Niveaux de difficulté calibrés, politique de modération, export du journal.

## 10. Décisions et questions ouvertes

| Sujet | Décision |
|---|---|
| Sources | **liste fermée** : CivicTrace (`canon`), sources institutionnelles, grands médias connus dont indépendants ; rien d'autre (§3 bis, §6 bis) |
| Liste nominative des médias | **à valider** (critère : pluralisme) |
| Modèles des agents | **port `Modele`, multi-fournisseurs** ; `SansModele` en attendant ; fournisseurs à comparer |
| Format | **table ronde** à N débatteurs (face-à-face = N = 2) |
| Visibilité | **privé et éphémère** dans un premier temps |
| Modèle du public agent | configuration du débat (port `Modele`), à calibrer |
| Export du journal en fin de session | à confirmer |
| Actualités, déclarations : qui les collecte ? | **à décider** : le debatron à la demande, ou CivicTrace (couche `analytique`, puisque non « 100 % fiables ») pour les partager avec l'app |
| Accès aux médias | **pari** : les médias ont intérêt à ce qu'on débatte avec leurs données (partenariats, accès aux articles payants) ; flux RSS pour le courant, API des médias pour l'historique |
| Déclarations : sources repérées | **discours publics vie-publique.fr** (DILA, ouvert, métadonnées + texte sur la page) ; **INA** (data.ina.fr : radio et TV 2019-2024, transcriptions automatiques) **par convention** uniquement, les CGU interdisant l'extraction et la réutilisation sans accord écrit ; transcription automatique = à vérifier sur la source, jamais un verbatim certain |
| Agrégateurs de fact-checking (Google Fact Check Tools…) | **écartés** : qualité non contrôlable |
| Démarrage | **pas avant que l'app soit prête** ; le langage se décidera à ce moment-là |
