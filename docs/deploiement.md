# Déploiement : passer le serveur à CivicTrace

Le serveur fait tourner la chaîne historique : le service `extraction` publie des bases SQLite des
scrutins AN, l'API lit la base Postgres `big-brother` (schémas `lNN`). La nouvelle version lit la
base `civictrace`, chargée chaque jour par le service `donnees`.

Pour ne pas attendre le premier chargement complet (≈ 40 min, tout re-télécharger), on envoie un
**dump de la base** et le **cache des fichiers bruts** préparés en local. Le service `donnees`
reprend ensuite en incrémental (seuls les fichiers changés à la source sont relus).

L'ancienne base `big-brother` n'est ni modifiée ni supprimée : le retour arrière reste possible.

## 1. En local : préparer

```bash
# Base chargée, projections à jour, contrôles OK (python -m src controles).
mkdir -p opendata/data/dumps
docker exec big-brother-postgres-1 pg_dump -U big-brother -d civictrace -Fc -Z zstd:5 \
  > opendata/data/dumps/civictrace-$(date +%F).dump
docker run --rm -v "$PWD/opendata/data/dumps:/d:ro" postgres:17.6-alpine \
  pg_restore -l /d/civictrace-$(date +%F).dump | head      # le dump se relit
```

Le code est déployé par git : commiter et pousser la branche avant de continuer.

## 2. Envoyer au serveur

```bash
SERVEUR=utilisateur@hote          # à adapter
DOSSIER=/chemin/vers/big-brother  # dépôt sur le serveur

rsync -a --info=progress2 opendata/data/dumps/civictrace-AAAA-MM-JJ.dump "$SERVEUR:$DOSSIER/opendata/data/dumps/"
rsync -a --info=progress2 opendata/data/brut/ "$SERVEUR:$DOSSIER/opendata/data/brut/"   # ≈ 2,3 Go
```

## 3. Sur le serveur : basculer

```bash
cd "$DOSSIER"
git pull                                         # la branche déployée

# Ancienne chaîne arrêtée (ses services sont maintenant dans le profil « historique »).
docker compose --profile historique stop extraction publication
docker compose --profile historique rm -f extraction publication

# Postgres redémarré avec /dev/shm à 256 Mo ; la base « big-brother » est conservée.
docker compose up -d postgres
docker compose exec postgres sh -c 'psql -U big-brother -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '\''civictrace'\''" | grep -q 1 || createdb -U big-brother civictrace'

# Restauration (≈ 10 min, 4 tâches en parallèle).
docker compose cp opendata/data/dumps/civictrace-AAAA-MM-JJ.dump postgres:/tmp/civictrace.dump
docker compose exec postgres pg_restore -U big-brother -d civictrace --no-owner -j 4 /tmp/civictrace.dump
docker compose exec postgres sh -c 'rm /tmp/civictrace.dump && psql -U big-brother -d civictrace -c "ANALYZE"'

# Nouvelles images : donnees, api, web.
docker compose up -d --build
```

Le service `donnees` démarre aussitôt un cycle : migrations (aucune si le dump est à jour),
chargement incrémental depuis le cache, projections, contrôles. Suivi :
`docker compose logs -f donnees`.

## 4. Vérifier

```bash
curl -s https://$DOMAINE/api/sante                                       # {"ok":true}
curl -s -XPOST https://$DOMAINE/api/dossiers/lister -H 'content-type: application/json' -d '{}' | head -c 300
docker compose logs --tail 50 api
```

Dans l'app : Accueil, un dossier (barre de parcours), un scrutin (hémicycle), l'annuaire.

## Retour arrière

L'ancienne base `big-brother` n'a pas bougé :

```bash
git checkout <commit précédent>
docker compose --profile historique up -d --build
```

## Reste à faire avant une exposition large

- Rôle Postgres dédié à l'API (`SELECT` sur `canon` et `lecture`, `INSERT` sur
  `analytique.signalement`), avec des droits qui survivent au `DROP SCHEMA lecture` de `projeter`.
- Limite de débit sur `/api/signalement/envoyer`.
- Suppression de la base `big-brother` et de la chaîne historique, une fois la nouvelle version
  validée en production.
