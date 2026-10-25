# Légifrance (JORF, LEGI) et Conseil constitutionnel (CONSTIT) — DILA

- **Licence** : Licence Ouverte / Etalab 2.0.
- **Accès** : `https://echanges.dila.gouv.fr/OPENDATA/{JORF,LEGI,CONSTIT}/`, sans clé. Un stock global `Freemium_*_global_*.tar.gz` (plusieurs Go) et des incréments quotidiens `<STOCK>_AAAAMMJJ-HHMMSS.tar.gz`. L'API PISTE (OAuth) n'est pas nécessaire à ce stade.
- **Format** : tar.gz de fichiers XML, un par texte, article, section ou conteneur, rangés par identifiant. `liste_suppression_*.dat` liste les suppressions.
- **Inventorié** : le dernier incrément de chaque stock (JORF du 24/10, 635 fichiers ; LEGI du 23/10, 2 278 ; CONSTIT du 19/10, 15).

## JORF : texte publié au Journal officiel

- `TEXTE@nor`, `TEXTE@num` (numéro de loi, ex. `2026-979`), `TEXTE@nature` (`LOI`, `DECRET`…), `TEXTE@date_publi`, `TEXTE@date_signature`, `TEXTE@num_parution_jo`, `TEXTE@cid` (`JORFTEXT…`).
- Articles : `META_COMMUN/ID` (`JORFARTI…`), `ID_ELI`, `META_ARTICLE/NUM`.
- **Lien avec l'AN** : `PROM-PUB/infoJO/referenceNOR` = `TEXTE@nor`. Avec le Sénat : `loi.loinumjo` = `TEXTE@num`.

## LEGI : versions consolidées

- Articles `LEGIARTI…` avec `VERSIONS/VERSION/LIEN_ART@{debut, fin, etat}`, rattachés à leur texte `LEGITEXT…`/`JORFTEXT…` et à leur section (`LEGISCTA…`).
- Sert à l'étape « versions consolidées et modifications ultérieures », à relier sans la confondre avec le texte adopté.

## CONSTIT : décisions du Conseil constitutionnel

- `META_COMMUN/ID` (`CONSTEXT…`), `URL`, `META_JURI/NUMERO`, `META_JURI_CONSTIT/{NOR, URL_CC}`.
- **`LOI_DEF@nor` et `LOI_DEF@num`** : la loi déférée. C'est un lien explicite décision → loi.
- **Lien avec l'AN** : acte `CC-*` `numDecision` et `urlConclusion` (`…/decision/2026/2026910D`).
- Le type (DC, QPC) et la solution (conforme, partiellement conforme…) sont à lire dans `NUMERO` et le dispositif ; à confirmer sur le stock global.

## Exemples réels : de la source au canon

Relevés le 24/10/2026 sur le dossier prototype DLR5L17N54085. Liens vers le code vérifiés par `tests/test_docs.py`.

### Décision du Conseil constitutionnel — `CONSTIT:decision:2026-914`

Brut : `CONSTIT_20261005-214539.tar.gz` › `…/constit/global/CONS/TEXT/00/00/54/95/29/CONSTEXT000054952980.xml`
(seuls les membres `/CONS/TEXT/` sont lus ; stock global puis incréments dans l'ordre) :

```xml
<ID>CONSTEXT000054952980</ID>
<TITRE>Loi d’urgence pour la protection et la souveraineté agricoles</TITRE>
<NATURE>DC</NATURE>
<NUMERO>2026-914</NUMERO>
<DATE_DEC>2026-08-14</DATE_DEC>
<SOLUTION>Non conformité partielle - réserve</SOLUTION>
<LOI_DEF date="2026-08-18" nor="SUPPRIME" num="2026-796">Loi d’urgence pour la protection et la souveraineté agricoles</LOI_DEF>
<URL_CC>https://www.conseil-constitutionnel.fr/decision/2026/2026914DC.htm</URL_CC>
```

Canon (`canon.decision_cc`) : `{"numero": "2026-914", "type": "DC", "date": "2026-08-14",
"solution": "Non conformité partielle - réserve", "nor_loi": null, "url": "…/2026914DC.htm"}`.
`nor_loi` est vide : le NOR publié vaut « SUPPRIME », il n'est pas gardé. Le lien vers le dossier
vient de l'AN : l'acte `CC-CONCLUSION` cite `numDecision` 914 et `anneeDecision` 2026, donc
`CONSTIT:decision:2026-914` (référence explicite), d'où `dossier_id` = DLR5L17N54085. Le Sénat cite
la même décision (`loi.num_decision` « 2026-914 DC ») : contrôle croisé.

Code : [analyser()](../../src/adaptateurs/sources/constit/__init__.py#L44), [decision()](../../src/adaptateurs/sources/constit/__init__.py#L23),
[dossier()](../../src/adaptateurs/sources/an/dossiers.py#L96) (acte CC) ·
Tests : [test_decision](../../tests/test_sources_constit.py#L24), [test_nor_supprime_ignore](../../tests/test_sources_constit.py#L31),
[test_membres_du_stock](../../tests/test_sources_constit.py#L37), [test_decision_et_texte_publie](../../tests/test_sources_constit.py#L56)

### Loi publiée au JO — `LEGIFRANCE:nor:AGRS2603566L`

Brut : l'acte AN `PROM-PUB` du dossier (pas encore le stock JORF) :

```json
{"codeActe": "PROM-PUB", "codeLoi": "2026-796", "titreLoi": "d'urgence pour la protection et la souveraineté agricoles",
 "infoJO": {"typeJO": "JO_LOI_DECRET", "dateJO": "2026-08-19+02:00", "numJO": "192",
            "referenceNOR": "AGRS2603566L",
            "urlLegifrance": "http://www.legifrance.gouv.fr/WAspad/UnTexteDeJorf?numjo=AGRS2603566L"}}
```

Canon (`canon.texte_publie`) : nature LOI, numéro 2026-796, NOR `AGRS2603566L`, JO n° 192 du
2026-08-19, `dossier_id` = le dossier de l'acte. Le Sénat publie le même NOR dans `loi.url_jo` et le
même numéro de JO (`loinumjo` 192) : contrôle croisé. Exemple d'une loi déjà chargée :
`{"nature": "LOI", "numero": "2021-1018", "nor": "SSAX2103845L", "numero_jo": "178", "date_publication": "2021-08-03"}`.

Code : [dossier()](../../src/adaptateurs/sources/an/dossiers.py#L96) · Test : [test_decision_et_texte_publie](../../tests/test_sources_constit.py#L56)

## À faire au lot Légifrance

- Charger les stocks JORF et LEGI (textes de nature `LOI` reliés à un dossier par leur NOR, et les
  articles qu'ils modifient) ; la renumérotation de la loi promulguée viendra de LEGI.
