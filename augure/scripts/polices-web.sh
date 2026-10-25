#!/bin/sh
# Polices web de l'app (assets/polices/*.woff2) : les TTF de @expo-google-fonts réduites aux
# caractères utilisés (latin, ponctuation, €, flèches, symboles mathématiques et pictogrammes),
# en woff2. À relancer si une police change ou si l'app affiche un caractère hors de ces plages.
# Prérequis : pip install fonttools brotli
set -eu
cd "$(dirname "$0")/.."
PLAGES="U+0000-024F,U+02B0-036F,U+2000-206F,U+20AC,U+2100-22FF,U+2460-27BF"
for police in \
  ibm-plex-sans-condensed/400Regular/IBMPlexSansCondensed_400Regular \
  ibm-plex-sans-condensed/600SemiBold/IBMPlexSansCondensed_600SemiBold \
  ibm-plex-sans-condensed/700Bold/IBMPlexSansCondensed_700Bold \
  ibm-plex-mono/400Regular/IBMPlexMono_400Regular \
  ibm-plex-mono/500Medium/IBMPlexMono_500Medium; do
  pyftsubset "node_modules/@expo-google-fonts/$police.ttf" --unicodes="$PLAGES" --layout-features='*' \
    --flavor=woff2 --output-file="assets/polices/$(basename "$police").woff2"
done
