# Essai : synthèses « en clair » par un LLM local

> Essai, rien de branché : aucune synthèse n'entre dans la base ni dans l'app. La règle
> « Aucun LLM branché » (docs/README.md) reste en vigueur ; ce dossier sert à décider s'il faut la
> faire évoluer.

## Question

Un petit modèle open source, sur une carte graphique grand public, peut-il rédiger les synthèses
prévues par le port `Synthetiseur` (`resume_dossier`, `expose_amendement`) sans coût d'API ?

## Protocole

- **Sujets** : le dossier « Protéger l'eau potable » (17e) et ses 16 amendements adoptés, soit 17
  textes extraits de `canon` par `exporter.py` (texte le plus avancé du dossier ; dispositif et
  exposé des motifs de chaque amendement, HTML retiré) → `lot-eau-potable.jsonl`.
- **Modèle** : `qwen2.5:7b` (Ollama), sur une RTX 3060 Ti 8 Go sous Windows (`rediger.py`,
  `lancer.bat`). Consignes : seulement les documents fournis, neutre, positions attribuées à
  l'auteur, `PAS_ASSEZ_D_INFORMATION` sinon (prompt `syntheses-v1`, dans `rediger.py`).
- **Contrôle** : `controle.py`, sans IA : chaque référence d'article, nombre, sigle, nom propre et
  passage entre guillemets d'un résumé doit se trouver dans le texte source, sinon « à revoir ».
  Puis relecture manuelle des 17 résumés contre les sources.

## Résultats

**Vitesse** : 3,6 s par amendement une fois le modèle chargé (52 s pour le premier). Les 26 053
amendements adoptés de la base prendraient environ 26 h sur une carte, 13 h sur deux (chaque
machine traite son lot ; voir LISEZMOI.md).

**Qualité** (détail : [RESUMES.md](RESUMES.md)) :

| | Nombre | Détail |
|---|---|---|
| Justes et sourcés | 14 | groupes des auteurs, Grenelle, entrée en vigueur… tous présents dans la source |
| Invention | 2 | CD33 : « M. Dupont » (aucun nom dans la source) ; CD28 : « article L. 2224-7-7 » (absent) |
| Citation inexacte | 1 | CD34 : mots entre guillemets reformulés (sens juste) |

Le contrôle automatique signale ces 3 résumés, et seulement eux.

**Défauts que le contrôle ne voit pas** (sens et style) : « Son auteur, selon l'auteur » (AN 4) ;
reprise trop littérale (« substitue le mot "Le" par "Au" », CD28) ; dans le résumé du dossier, le
gage (« taxe additionnelle sur les tabacs ») présenté comme une mesure réelle.

## Conclusions proposées

1. Utilisable comme **premier jet**, jamais comme fait : état `GENERE` dans
   `analytique.affirmation`, montré seulement après relecture (`RELU`), comme le prévoit le schéma.
2. Le **contrôle automatique** passe avant la relecture : un résumé « à revoir » est écarté ou
   relu en premier.
3. À ajouter aux consignes : ignorer le gage financier, ne jamais nommer un auteur absent du texte.
4. À comparer : un autre modèle 7-8B (`mistral:7b`) sur le même lot, avec le même contrôle.

## Fichiers

| Fichier | Rôle |
|---|---|
| `exporter.py` | extrait un lot de la base (PC serveur, `DATABASE_URL`, lecture seule) |
| `rediger.py`, `lancer.bat` | rédige les résumés d'un lot avec Ollama (PC à GPU, Python seul) |
| `controle.py`, `test_controle.py` | contrôle automatique et ses tests (`python3 -m unittest test_controle`) |
| `lot-eau-potable.jsonl` | les 17 textes source |
| `resultats/resultats-qwen.jsonl` | les résumés bruts (modèle, machine, temps, jetons) |
| `resultats/resultats-qwen-controle.jsonl` | les mêmes, avec leur contrôle |
| `RESUMES.md` | les 17 résumés lisibles, avec le contrôle |
| `LISEZMOI.md` | mode d'emploi sur le PC Windows |
