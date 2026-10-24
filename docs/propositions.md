# Propositions produit — contexte, comparaison, « pourquoi », debatron

> Statut : propositions à discuter, aucune n'est encore implémentée côté application.
> Toutes reposent sur la règle des données : seul ce qui est **100 % fiable** (identifiant officiel,
> référence explicite, décision humaine tracée) est affiché comme un fait ; le reste passe par la
> revue humaine (`opendata/docs/rapprochements.md`).

## 1. Le principe : jamais un chiffre sans « par rapport à quoi »

Un chiffre seul trompe. « 78 % d'absences » ne dit rien tant qu'on ne sait pas si son groupe, ce
jour-là, votait à 20 %. Chaque indicateur affiché porte donc **sa référence de comparaison**, son
**dénominateur** et **ce que la donnée ne dit pas**.

| Objet regardé | Comparé à | Exemple d'affichage |
|---|---|---|
| Une personne | son groupe **à la même date**, sur les mêmes scrutins | « +12 pts de participation par rapport au groupe A sur les scrutins de 2025 (n = 214) » |
| Une personne | elle-même dans le temps (avant / après un changement de groupe, de fonction) | « depuis son passage au groupe B (03/2025), 2 écarts au lieu de 9 » |
| Une personne | l'ensemble de la chambre (médiane, quartiles) | position dans la distribution, pas un rang sec |
| Un groupe | les autres groupes, sur les mêmes scrutins | cohésion, participation, alliances de vote |
| Un groupe | lui-même dans le temps | cohésion par session, effectif, départs et arrivées |
| Un dossier | les dossiers de même nature et de même procédure | durée d'examen, nombre d'amendements, taux d'adoption, nombre de lectures |
| Un amendement | les autres amendements du même article, du même auteur, du même groupe | taux d'adoption, avis du Gouvernement (Sénat) |
| Un scrutin | la participation habituelle à cette heure, à ce type de scrutin | « 41 votants : habituel pour un scrutin sur amendement de nuit » |

### Règles de calcul (couche `lecture`, formules documentées)

- **Attendu, pas absolu** : la participation attendue d'un député sur un scrutin est celle de son
  groupe ce jour-là. Score = moyenne de (a voté − attendu). Un vote de nuit à 40 votants pèse peu.
- **Présences croisées, toutes publiées** : présence en commission (agenda : présent, excusé,
  absent) et heure des réunions. « Absent du scrutin, en réunion de commission au même moment » est
  un fait, pas une excuse supposée.
- **Ce qui n'est pas une absence** : délégation de vote, déport (registre public), mise au point
  (« voulait voter pour »), vote à main levée (pas de liste nominative), ministre (ne vote pas).
- **Écart au groupe** : seulement quand le groupe a une majorité nette ; distinguer contre et
  abstention ; montrer « 5 écarts sur 21 votes », jamais un pourcentage sans le nombre.
- **Petits échantillons** : en dessous d'un seuil, on affiche le nombre, pas le taux.

## 2. Naviguer pour étudier et comparer

### Deux axes d'entrée : institution et territoire

```
Europe ── Parlement européen ── eurodéputés FR ───────────────────────┐
France ─┬ Parlement ─┬ Assemblée ── groupes / commissions ── députés ──┤
        │            └ Sénat ───── groupes / commissions ── sénateurs ─┤──▶ Personne
        ├ Gouvernement ── ministères ── ministres ─────────────────────┤   (frise de toutes
        ├ Conseil constitutionnel                                      │    ses fonctions)
        └ Territoires ── région ── département ── EPCI ── commune ── élus locaux ┘
```

- « **Mon territoire** » : depuis une commune, tous ceux qui la représentent, à chaque niveau.
  Liens par codes officiels seulement (INSEE, SIREN, circonscription) : à inventorier, le
  Code officiel géographique et la table communes ↔ circonscriptions.
- Données européennes (Parlement européen) : notées pour plus tard.

### Comparer, partout

- **Mettre côte à côte** deux personnes, deux groupes, deux dossiers, ou une même personne à deux
  périodes : mêmes indicateurs, même période, mêmes scrutins communs.
- **Filtrer par la même chose** : « sur les scrutins où les deux étaient présents », « sur le thème
  énergie », « pendant la 17e législature ».
- **Les deux chambres sur un même texte** : ce que le Sénat change, ce que l'AN rétablit, article
  par article (la navette est déjà reliée).
- **Un fil d'Ariane qui garde la comparaison** : on peut passer d'un député à son groupe, puis à un
  autre groupe, sans perdre la période ni le thème choisis.

## 3. Le « pourquoi » — ce qu'on peut montrer sans rien supposer

On ne peut pas savoir pourquoi quelqu'un a voté : on peut **rassembler les faits publics** autour
du vote et laisser lire (c'est l'écran « Pourquoi ce vote » du design). Sans LLM :

| Fait rassemblé | Source fiable |
|---|---|
| ce que la personne **a dit** avant le vote, dans la même séance ou en commission | interventions reliées (orateur, amendement, dossier) |
| ce qu'elle **a fait** sur le dossier : rapporteure, amendements déposés, cosignés, adoptés | liens explicites |
| la **position de son groupe** ce jour-là, et si elle s'en écarte d'habitude sur ce thème | scrutins, positions de groupe |
| l'**avis du Gouvernement** et de la commission sur l'amendement (Sénat) | AMELI |
| ses **déclarations d'intérêts** publiées, rubriques par rubrique | HATVP |
| les **actions de lobbying déclarées** sur le même sujet, à la même période | HATVP (rapprochement analytique, toujours marqué « à vérifier ») |
| sa **trajectoire** : fonctions passées, mandats locaux, ancien ministre… | fonctions datées |
| la **chronologie** : dépôt, avis, débat, vote, ce qui a changé ensuite | étapes, versions |

Règle d'affichage : chaque élément porte sa source ; un rapprochement analytique porte son statut ;
aucune phrase ne relie deux faits par une causalité (« parce que »).

### Avec un LLM (port `Synthetiseur`, seulement après validation de la couche de données)

- **Résumer une intervention** en gardant les citations exactes, et **extraire ses arguments** (pour,
  contre, conditions), chacun pointant vers le passage du compte rendu.
- **Cartographier un débat** : arguments par camp, qui les porte, lesquels ont été repris ou
  contredits, sur un article donné.
- **Expliquer un changement de texte** entre deux versions d'un article.
- Toujours : modèle, version du prompt, date, passages cités, statut `GENERE` → `RELU` ; rien n'est
  affiché comme un fait ; « Pas de synthèse disponible » tant que rien n'est relu.

## 4. Debatron : ce que CivicTrace peut lui fournir

Le debatron (agents qui simulent des débats, avec ou sans humains) a besoin d'un **contexte fiable
et cité**. CivicTrace peut le lui donner sous forme d'un contrat de données, pour un dossier, un
article ou un amendement :

| Bloc | Contenu |
|---|---|
| Le texte en jeu | versions de l'article, amendements déposés, sort, avis |
| Les arguments réels | interventions publiées (texte intégral, orateur, groupe, ancre du compte rendu) |
| Les positions réelles | votes nominatifs, positions de groupe, écarts |
| Le contexte | étapes, chronologie, décision du Conseil constitutionnel, actions de lobbying déclarées |

Garde-fous proposés :
- les agents incarnent des **positions** (« groupe A en 1re lecture », « défenseur de
  l'amendement CE123 »), pas des personnes réelles qui parleraient à leur place ;
- tout argument d'agent tiré d'une intervention réelle **cite son passage** ; un argument inventé
  est **marqué comme tel** ;
- une simulation n'est jamais présentée comme un débat réel, ni réinjectée dans CivicTrace comme
  un fait ;
- l'export vers le debatron passe par un port (lecture seule), comme le reste.

## 5. Prochaines étapes proposées

1. Couche `lecture` : indicateurs « attendu vs réalisé » (participation, écarts) par personne, groupe et période, avec leurs formules.
2. Référentiel territorial officiel (INSEE, circonscriptions) pour l'entrée « mon territoire ».
3. Maquettes : comparaison côte à côte et « par rapport à quoi » sur les fiches personne, groupe et dossier.
4. Contrat de données CivicTrace → debatron (format et port de lecture).
