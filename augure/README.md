# augure — « Nos administrés ont du talent »

Qui vote quoi à l'Assemblée nationale, scrutin par scrutin. App Expo (iOS, Android, web) qui lit
les bases publiées par [opendata](../opendata), **une par législature** : pas d'API, des fichiers
statiques (`index.json`, puis par législature `manifest.json`, base `.db.gz`, correctifs `.sql.gz`),
vérifiés par SHA-256. Tous les scrutins publics y sont : votes finaux, articles, amendements, motions.

Design : design system [Panoptique](https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD) et
[maquettes](https://claude.ai/artifact/742v5Bx7zM9SvDnZAYGLcv). Tous les tokens sont dans
`src/ui/theme/tokens.ts`.

## Lancer

L'app lit la publication opendata hébergée : chaque législature est téléchargée à sa première
consultation, puis mise à jour par correctifs, sans republier l'app.

```bash
docker compose up -d publication extraction       # à la racine : publication sur http://localhost:8081
npx expo start                                    # en développement, l'app lit http://localhost:8081
```

Sans Docker, après `python3 -m src importer && python3 -m src publier` dans `opendata/` :

```bash
npm run publication                                          # sert opendata/publication sur :8787
EXPO_PUBLIC_PUBLICATION_URL=http://localhost:8787 npx expo start
```

En production, `EXPO_PUBLIC_PUBLICATION_URL` est obligatoire : le service Docker `web` la fixe à
`/donnees` (même origine) ; une app mobile pointe vers `https://<hôte de publication>`.
Sur l'émulateur Android, `localhost` désigne l'émulateur : utiliser `http://10.0.2.2:8081`.

```bash
npm test            # cœur + adapter SQL sur la vraie publication opendata (node:sqlite)
npm run typecheck
npm run lint
```

## Architecture

```
index.ts                 point d'entrée
src/
  App.tsx                polices, thème, démarrage, navigateurs
  navigation.ts          pages, liens web, useAller() (navigation déclarée en code)
  core/                  aucun import React Native : testable sous Node
    domain/              modèle de lecture, règles (ligne de groupe, écart, bilan, plan de MAJ)
    ports/               interfaces : SqlDatabase, LocalDatabases, PublicationSource,
                         ParlementRepository, ThemeClassifier, EnClairProvider, Logger
    partitions.ts        une base par législature, ouverte et mise à jour à la demande
    commands/            bus de commandes typé, middlewares, handlers
  infra/                 adapters
    sql/                 ExpoSqliteDatabase (app) · NodeSqlite (tests)
    locales/             FichiersSqlite (mobile, sur disque) · MemoireSqlite (web)
    publication/         HttpPublicationSource : index, manifestes, SHA-256, gzip
    onverra/             OnVerraRepository : seul fichier qui connaît le schéma opendata
    themes/              KeywordThemeClassifier (heuristique sur les titres)
    resumes/             CatalogueEnClair (en-clair.json, résumés relus à la main)
  di/                    racine de composition (choix des adapters par plateforme)
  ui/
    ecrans/              Assemblee, Scrutins, Recherche, Groupe, Depute, Scrutin
    components/          composants du design system
    hooks/               useCommand, CoreProvider
    theme/               tokens, palette
```

### Commandes

L'UI ne parle au cœur que par le bus :

```ts
const fiche = useCommand(ConsulterScrutin({ uid }));          // dans un écran
await bus.execute(Synchroniser({}));                          // ailleurs
```

Les définitions sont dans `src/core/commands/definitions.ts`. Une *query* lit, une *command*
modifie l'état. Le middleware `queryCache` garde les queries en cache, et chaque command (la
synchronisation) vide ce cache. Pour ajouter un cas d'usage : une définition, un handler,
une ligne `register` dans `src/core/index.ts`.

### Groupes dans le temps

Rien n'est codé en dur, parce que les groupes changent : renommages (AD → UDR → UDDPLR),
départs, et groupes propres à chaque législature.

- La composition est toujours calculée **à une date** à partir des appartenances. Pour l'hémicycle,
  c'est la date du dernier scrutin de la législature choisie.
- L'ordre gauche → droite vient du siège moyen des membres ce jour-là : les numéros de siège
  croissent de la droite vers la gauche.
- Un vote est rattaché au groupe du député **au moment du vote**, et un écart est mesuré par
  rapport à la ligne de ce groupe-là.
- Un groupe dissous est montré à son dernier jour d'existence.

### Limites assumées

- **Présence** : opendata ne publie pas la présence. « Absent » veut dire en fonction mais sans vote enregistré.
- **En clair** : aucun résumé n'est encore rédigé. Sans résumé, l'écran le dit et donne la
  signification littérale (POUR = adopter ce texte / cet amendement / cet article).
- **Amendements** : seul l'intitulé du scrutin est publié (« l'amendement n° 15 de M. X à
  l'article premier… »), pas son contenu.
- **Indicateurs** (présence, écarts, bilan d'un député) : calculés sur tous les scrutins publics,
  amendements compris ; beaucoup se votent en séance peu remplie, d'où des absences nombreuses.
- **Thèmes** : ils sont attribués d'après le titre, par mots-clés. C'est un adapter remplaçable.
- **Hémicycle** : la disposition des sièges reprend la maquette, ce n'est pas le plan réel de la salle.
- **Web** : chaque législature consultée est rechargée à chaque visite (17 Mo pour la 17e, ~10 s),
  faute d'adapter IndexedDB.
- **Hors connexion** : seules les législatures déjà consultées sur l'appareil sont disponibles.
