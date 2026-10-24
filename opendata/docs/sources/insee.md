# INSEE — Code officiel géographique (COG), millésime 2026

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Accès** : `https://www.insee.fr/fr/statistiques/fichier/8740222/v_{region,departement,commune,comer}_2026.csv`.
- **Fréquence** : un millésime par an (au 1er janvier).
- **Format** : CSV UTF-8, séparateur `,`.
- **Rôle** : le référentiel des territoires pour l'entrée « mon territoire ». Tous les liens vers
  un territoire passent par un **code officiel** publié par la source elle-même (département
  d'élection d'un député dans l'AMO, code commune et SIREN de l'EPCI dans le RNE), jamais par un nom.

## Fichiers et identités

| Fichier | Lignes | Identité | Parent |
|---|---|---|---|
| `v_region_2026.csv` | 18 | `INSEE:region:<REG>` | — |
| `v_departement_2026.csv` | 101 | `INSEE:departement:<DEP>` | sa région |
| `v_comer_2026.csv` | 9 | `INSEE:collectivite_outre_mer:<COMER>` (975, 977, 978, 984, 986…) | — |
| `v_commune_2026.csv` | 37 496 | `INSEE:<type>:<COM>`, type = commune, commune_deleguee, commune_associee, arrondissement_municipal | commune : son département ; les autres : leur commune (`COMPARENT`) |

Le type fait partie de l'identité : une commune déléguée peut porter le même code que sa commune
nouvelle (`INSEE:commune:01033` Valserhône, `INSEE:commune_deleguee:01033` Bellegarde-sur-Valserine).
Les communes des collectivités d'outre-mer (codes 975…, 986…, 987…) ne sont pas dans ce fichier.

## Exemples réels : de la source au canon

Relevés le 24/10/2026. Liens vers le code vérifiés par `tests/test_docs.py`.

### Commune — `INSEE:commune:01001`

Brut : `v_commune_2026.csv`

```text
TYPECOM=COM  COM=01001  REG=84  DEP=01  CTCD=01D  ARR=012  TNCC=5  NCC=ABERGEMENT CLEMENCIAT
NCCENR=Abergement-Clémenciat  LIBELLE=L'Abergement-Clémenciat  CAN=0108  COMPARENT=
```

Canon (`canon.organisation`) : `{"type": "commune", "type_source": "COM", "nom": "L'Abergement-Clémenciat", "abrege": "01001"}`,
`parent_id` = `INSEE:departement:01` (Ain), lui-même rattaché à `INSEE:region:84`.

Utilisée par : la fiche RNE du maire de la commune (`organisation_id`, cf. [rne.md](rne.md)) et le
rattachement des conseillers communautaires (`commune_id`).

Code : [commune()](../../src/adaptateurs/sources/insee/__init__.py#L56), [departement()](../../src/adaptateurs/sources/insee/__init__.py#L42),
[outre_mer()](../../src/adaptateurs/sources/insee/__init__.py#L49) ·
Tests : [test_commune_et_commune_deleguee_meme_code](../../tests/test_sources_insee.py#L14),
[test_departement_dans_sa_region](../../tests/test_sources_insee.py#L23)

### Département d'élection d'un député — lien `territoire`

Brut (AMO, mandat `PM796323`) : `"election": {"lieu": {"numDepartement": "13", "numCirco": "12"}}`.
Canon : `canon.lien` (mandat → `INSEE:departement:13`, `attributs: {"circonscription": "12"}`).
Les codes 975 à 989 vont vers `INSEE:collectivite_outre_mer:<code>` ; le code 099 (Français établis
hors de France) n'est pas un territoire du COG : la référence reste vide et un constat
`lien_ecarte` part en revue.

Code : [acteur()](../../src/adaptateurs/sources/an/acteurs.py#L82)

## Limites

- Les circonscriptions législatives ne sont pas dans le COG : la table communes ↔ circonscriptions
  reste à inventorier.
- Les EPCI ne sont pas dans le COG : ils viennent du RNE, identifiés par leur SIREN
  (`INSEE:siren:<SIREN>`, l'identifiant Sirene de l'INSEE, publié tel quel par le RNE).
