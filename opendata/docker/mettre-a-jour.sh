#!/bin/sh
# Boucle du service « extraction » : retélécharge l'open data, reconstruit la base et publie une
# nouvelle version des législatures qui ont changé, toutes les INTERVALLE_MAJ secondes.
# Un échec (AN indisponible…) laisse la publication précédente en place : nouvel essai au cycle suivant.
set -u

while true; do
  echo "$(date -u +%FT%TZ) mise à jour"
  if python -m src mettre-a-jour --dossier /srv/publication; then
    echo "$(date -u +%FT%TZ) terminé"
  else
    echo "$(date -u +%FT%TZ) échec, publication précédente conservée" >&2
  fi
  sleep "${INTERVALLE_MAJ}"
done
