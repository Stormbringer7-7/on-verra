#!/bin/sh
# Boucle du service d'extraction. Le cache (/app/data) et la publication (/srv/publication)
# sont persistés hors du conteneur : un redémarrage ou un rebuild ne re-télécharge rien.
set -u

# Base déjà compilée mais rien de publié (publication effacée, premier lancement après migration) :
# on publie tout de suite depuis le cache, sans attendre un cycle complet.
if [ -f /app/data/on_verra.db ] && [ ! -f /srv/publication/index.json ]; then
  echo "$(date -u +%FT%TZ) publication depuis le cache"
  python -m src publier --dossier /srv/publication || echo "$(date -u +%FT%TZ) échec de la publication" >&2
fi

# Postgres vide ou en retard sur la publication (premier lancement, volume recréé) : on charge
# tout de suite ce qui est publié. Rien n'est rechargé si Postgres est déjà à jour.
if [ -f /srv/publication/index.json ] && [ -n "${DATABASE_URL:-}" ]; then
  python -m src charger --dossier /srv/publication || echo "$(date -u +%FT%TZ) échec du chargement Postgres" >&2
fi

while true; do
  echo "$(date -u +%FT%TZ) mise à jour"
  # Fichiers redemandés au plus une fois par AGE_MAX heures, et seulement s'ils ont changé (HTTP 304 sinon).
  if python -m src mettre-a-jour --dossier /srv/publication --age-max "${AGE_MAX}"; then
    echo "$(date -u +%FT%TZ) terminé"
  else
    echo "$(date -u +%FT%TZ) échec, publication précédente conservée" >&2
  fi
  sleep "${INTERVALLE_MAJ}"
done
