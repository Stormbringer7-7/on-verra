# augure — Nos politiques ont du talent

Suivre une loi du dépôt au Journal officiel : le **dossier législatif** est l'objet central ;
amendements, votes, débats et intérêts déclarés y sont rangés, et les personnes et institutions y
mènent toujours. App Expo (iOS, Android, web), sans base ni SQL : elle envoie chaque commande à
l'[API](../api), qui lit Postgres (schémas `canon` et `lecture`).

Design : canevas [Panoptique v2 — Parcours législatifs](https://claude.ai/artifact/R33Yw8dE34vLyY9rbaRhDC)
et design system [Panoptique](https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD). Tous les tokens
sont dans `src/ui/theme/tokens.ts`.

## Sources de données

`EXPO_PUBLIC_SOURCE` choisit le bus de commandes (`src/di/container.ts`) :

| Valeur | Bus | Données |
|---|---|---|
| `api` (défaut) | `ApiBus` | l'API, à l'adresse `EXPO_PUBLIC_API_URL` (en développement : `http://localhost:8082`) |
| `fixtures` | `FixturesBus` | les fixtures du contrat (`src/infra/fixtures`) : les deux dossiers **fictifs** du canevas, sans réseau ; un bandeau « Données fictives de maquette » est affiché sur chaque écran |

Avec `fixtures`, une commande répond par l'exemple dont l'entrée est égale (JSON, clés triées).
Entrée inconnue : en développement, la première fixture de la commande (signalée dans la console) ;
dans une version publiée, une erreur « Pas de donnée de maquette pour … ».

```bash
EXPO_PUBLIC_SOURCE=fixtures npx expo start --web   # maquette, sans API
docker compose up -d api && npx expo start         # données réelles (API locale sur :8082)
```

En production, `EXPO_PUBLIC_API_URL` est obligatoire : l'image Docker `web` la fixe à `/api`
(même origine, derrière Caddy) ; une app mobile pointe vers `https://<hôte de l'API>`. Sur
l'émulateur Android, `localhost` désigne l'émulateur : utiliser `http://10.0.2.2:8082`. Les
variables `EXPO_PUBLIC_*` sont lues à la compilation (fichier `.env` ou environnement).

```bash
npm test            # contrat, fixtures, bus (API, fixtures), rendu des composants partagés
npm run typecheck
npm run lint
```

## Architecture

```
index.ts                 point d'entrée
src/
  App.tsx                polices, thème, bus, navigateurs (pile + 5 onglets)
  navigation.ts          pages, liens web et profonds, useAller() (navigation déclarée en code)
  core/                  contrat partagé avec l'API (alias @contrat) : aucun import React Native
    domain/              DTO par contexte (dossiers, parcours, scrutins, personnes…)
    commands/            bus typé, middlewares, definitions.ts (une query par écran + SignalerErreur)
  infra/
    ApiBus.ts            chaque commande en POST <API>/<type>
    FixturesBus.ts       chaque commande répond par ses fixtures
    fixtures/            exemples { entrée, sortie } par commande (données fictives du canevas)
  di/container.ts        racine de composition (EXPO_PUBLIC_SOURCE)
  ui/
    ecrans/              un écran par page ou onglet (Accueil, Dossiers, Dossier, Etape…)
    components/          Ecran (gabarit, navigation, fil d'Ariane, colonnes), base (typographie,
                         cartes, puces), LigneScrutin
      commun/            Source, LienStatut, IndicateurVue, SyntheseVue, BarreParcours, Signaler
      dossiers/          composants des écrans du dossier
      personnes/         composants des écrans personnes et institutions
    hooks/               useCommand (useRequete), useEnvoi, CoreProvider, titres du fil d'Ariane
    theme/               tokens, palette
    format.ts            dates, nombres, sources, indicateurs (fonctions pures)
```

### Navigation

Cinq onglets toujours visibles — Accueil, Dossiers, Personnes, Institutions, Recherche — en bas en
portrait, en en-tête en paysage et sur grand écran (`useLarge`). Chaque fiche (Dossier, Étape,
Article, Amendement, Scrutin, Pourquoi ce vote, Personne, Institution, Représentant, Discussions)
s'empile au-dessus des onglets : la navigation reste affichée, avec l'onglet d'origine actif, et un
fil d'Ariane (« Dossiers › Programmation énergétique › Commission AN › Amendement CE123 »)
construit depuis la pile. Chaque écran donne son maillon : `<Ecran titre="Amendement CE123">`.

### Commandes

L'UI ne parle au cœur que par le bus :

```ts
const fiche = useCommand(ConsulterDossier({ id }));            // une query par écran
const { envoyer } = useEnvoi<AccuseSignalement>();             // la seule command
envoyer(SignalerErreur({ cible, message, ecran }));
```

Une *query* lit et passe par le cache (`queryCache`) ; une *command* (`SignalerErreur`) n'est
jamais mise en cache et vide le cache des queries.

### Règles d'affichage

- **Chaque fait porte sa source** : `<Source provenance={…} />` (« Source : AN · DLR5L17N54085 »,
  lien vers la page officielle si elle existe ; jamais d'URL inventée).
- **Chaque rapprochement porte son statut** : `<LienStatut lien={…} rendu={…} />`. Un lien à
  vérifier n'a pas de cible dans le type ; son candidat n'est montré que dans un encadré « À
  vérifier », avec ce que le rapprochement n'établit pas.
- **Jamais un chiffre sans « par rapport à quoi »** : `<IndicateurVue indicateur={…} />` (valeur,
  dénominateur, référence, période, calcul, « ce que la donnée ne dit pas »).
- **Pas de LLM** : `<SyntheseVue synthese={…} />` affiche « Pas de synthèse disponible » quand le
  port `Synthetiseur` rend null (toujours, pour l'instant) ; une synthèse est marquée comme telle.
- **Barre de parcours** : `<BarreParcours parcours={…} />` (cases sans objet masquées ; faite,
  en cours, à venir, inconnu) ; `BarreCompacte` dans les listes, `BarreDossierVue` en tête des
  sous-écrans d'un dossier.

### Limites assumées

- **17e législature** seulement pour l'instant.
- **Thèmes** : aucun thème n'est attribué aux dossiers ; les filtres par thème sont masqués.
- **Recherche** : plein texte côté API (Postgres, configuration `french`) ; au moins 2 lettres.
  Les « organisations » ouvrent la fiche de représentant d'intérêts.
- **Hémicycle** : `components/disposition.ts` garde la géométrie de la maquette (ce n'est pas le
  plan réel de la salle).
