#!/bin/sh
# Boucle du service « donnees » : charge la base CivicTrace (DATABASE_URL) depuis l'open data, puis
# reconstruit les projections lues par l'API, et recommence toutes les INTERVALLE_MAJ secondes.
# Le cache des fichiers bruts (/app/data/brut) est persisté hors du conteneur : seuls les fichiers
# changés à la source sont re-téléchargés, seuls les documents changés sont réécrits.
# Un échec garde la base précédente : chaque étape s'écrit dans sa propre transaction, `projeter`
# en une seule (l'ancien schéma lecture reste lu par l'API jusqu'au commit).
set -u

horodatage() { date -u +%FT%TZ; }

while true; do
  echo "$(horodatage) migrations"
  if ! python -m src migrer; then
    echo "$(horodatage) échec des migrations, nouvel essai au prochain cycle" >&2
  else
    echo "$(horodatage) chargement"
    python -m src canon --age-max "${AGE_MAX}" || echo "$(horodatage) chargement incomplet (étapes en échec : voir ci-dessus)" >&2
    echo "$(horodatage) projections"
    python -m src projeter || echo "$(horodatage) échec des projections, les précédentes restent en place" >&2
    echo "$(horodatage) contrôles"
    python -m src controles || echo "$(horodatage) CONTRÔLES EN ÉCHEC : donnée non fiable dans canon" >&2
    echo "$(horodatage) terminé"
  fi
  sleep "${INTERVALLE_MAJ}"
done
