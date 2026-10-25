# opendata

ETL de CivicTrace (app « Nos politiques ont du talent ») : télécharge l'open data officiel du
Parlement et des autorités publiques, et construit une base Postgres où **chaque fait porte sa
source** et **chaque rapprochement son statut**. Seul ce qui est 100 % fiable (identifiant officiel,
référence explicite, décision humaine tracée) entre dans `canon` comme un fait ; tout le reste
devient un cas de revue humaine, jamais tranché par le code.

Python 3.10+, bibliothèque standard et `psycopg` 3. 17e législature d'abord.

Documentation principale (architecture, déploiement) : [docs/README.md](../docs/README.md).

## Démarrage

```bash
python3 -m venv .venv && .venv/bin/pip install "psycopg[binary]"
docker compose up -d postgres                      # depuis la racine du dépôt (port 5433)
export DATABASE_URL=postgres://big-brother:big-brother@127.0.0.1:5433/civictrace

.venv/bin/python -m src migrer       # schéma (src/schema_pg/NNNN_*.sql), idempotent
.venv/bin/python -m src canon        # télécharge et charge ce qui a changé (complet ≈ 40 min, incrémental ≈ 6 min)
.venv/bin/python -m src projeter     # reconstruit le schéma lecture (barre de parcours, indicateurs)
.venv/bin/python -m src controles    # vérifie les invariants « 100 % fiable » ; échoue sinon
.venv/bin/python -m src revue rapport  # écrit docs/revue/rapport.md et un CSV par type de cas
```

Options de `canon` :

| Option | Effet |
|---|---|
| `--etapes senat.travaux,an.textes` | seulement ces étapes (et celles dont elles dépendent) |
| `--relire` | réanalyse les documents inchangés sans re-télécharger (avec `--etapes` : ces étapes seulement) |
| `--forcer` | re-télécharge et réanalyse tout |
| `--age-max 20` | heures avant de revérifier un fichier distant |

## Sources

| Source | Contenu | Fiche |
|---|---|---|
| Assemblée nationale | acteurs et organes (AMO), dossiers et étapes, textes, amendements, scrutins et votes, comptes rendus de séance et de commission, agenda, questions | [an.md](docs/sources/an.md) |
| Sénat | sénateurs, dossiers (DOSLEG), amendements et avis (AMELI), scrutins, textes Akoma Ntoso, comptes rendus, agenda | [senat.md](docs/sources/senat.md) |
| DILA | décisions du Conseil constitutionnel (CONSTIT) ; JORF et LEGI à venir | [legifrance.md](docs/sources/legifrance.md) |
| HATVP | déclarations d'intérêts et de patrimoine, répertoire des représentants d'intérêts | [hatvp.md](docs/sources/hatvp.md) |
| RNE | élus locaux, une fiche par mandat publié | [rne.md](docs/sources/rne.md) |
| INSEE | code officiel géographique | [insee.md](docs/sources/insee.md) |

Chaque fiche montre des exemples réels de la donnée brute, ce qu'elle devient dans la base, et les
lignes de code qui la lisent ; `tests/test_docs.py` vérifie ces liens. Volumes chargés : section
« Ce qui est chargé » de [modele.md](docs/modele.md).

## Architecture

Ports et adaptateurs : les adaptateurs de source lisent, n'écrivent jamais de SQL ; seul
l'`Entrepot` persiste ; la composition se fait à un seul endroit.

```
src/
  domaine/                 objets sans I/O : IdentiteNative, Provenance, Correspondance, Affirmation…
  ports.py                 Entrepot, Synthetiseur, ArchiveBrute
  identites.py             règles d'identité (officiel = VERIFIED, nom + dates = revue, fusions)
  chargement.py            document brut → empreinte → analyse → écriture ; inchangé = sauté
  adaptateurs/sources/     an/, senat/, constit/, hatvp/, rne/, insee/ : lecture des fichiers bruts
  adaptateurs/stockage/    memoire.py (tests) et postgres/ : même contrat
  adaptateurs/synthese.py  SansSynthese : aucun LLM branché, « Pas de synthèse disponible »
  textes.py, diffs.py      découpage par article, suivi d'article, diff mot à mot
  schema_pg/               migrations versionnées (brut, canon, analytique, lecture)
  projections/             requêtes du schéma lecture, rejouées par `projeter`
  revue.py, controles.py   cas de revue humaine, invariants
  compilation.py           racine de composition (ENTREPOT=postgres|memoire)
```

| Document | Contenu |
|---|---|
| [modele.md](docs/modele.md) | modèle canonique, étapes chargées, règles de rattachement |
| [uml.md](docs/uml.md) | diagrammes : du fichier source à la colonne (`python -m src uml` les régénère) |
| [rapprochements.md](docs/rapprochements.md) | ce qui est relié automatiquement, ce qui ne l'est jamais, revue |
| [modifications.md](docs/modifications.md) | changements article par article et amendement à l'origine |
| [indicateurs.md](docs/indicateurs.md) | projections `lecture` : barre de parcours, indicateurs et leurs limites |
| [TODO.md](../docs/TODO.md) | en cours, à faire et idées (tout le dépôt) |

**Ajouter une source** : un module sous `src/adaptateurs/sources/<source>/` qui produit des
`Objet`, `Dependants` et `Rapprochement` (domaine) avec leur provenance, sans écrire en base ; une
étape déclarée dans `compilation.py` ; une fiche `docs/sources/<source>.md` avec des exemples
réels ; des tests sur ces exemples. Un lien qui n'est pas une référence explicite devient un cas de
revue, pas une jointure.

**Modifier le schéma** : nouvelle migration `src/schema_pg/NNNN_*.sql`, jamais de réécriture
d'une migration appliquée ; puis `python -m src uml` pour mettre `docs/uml.md` à jour.

## Revue humaine

```bash
.venv/bin/python -m src revue rapport                          # docs/revue/rapport.md + CSV
.venv/bin/python -m src revue lister <type>                    # cas d'un type et leurs candidats
.venv/bin/python -m src revue decider <cle> --choix <n|aucun> --par <nom> [--motif …]
.venv/bin/python -m src revue fusionner <absorbee> <absorbante> --type <type> --par <nom> --motif …  # même objet
```

Une décision est tracée (qui, quand, motif) et rejouée à chaque chargement. Un cas dont la source
s'est corrigée devient `CADUC`. Le RNE n'est jamais relié à une personne sans décision humaine, et
la date de naissance n'est pas utilisée pour rapprocher.

## Tests

```bash
.venv/bin/python -m unittest discover tests      # tout ; les tests Postgres sont ignorés sans base
.venv/bin/python -m tests.test_docs --corriger   # recale les numéros de ligne cités par les docs
```

Les tests Postgres utilisent une base jetable : `DATABASE_URL_ESSAIS` (par défaut
`civictrace_essais` sur le Postgres du compose). Son nom doit finir par `_essais`.
