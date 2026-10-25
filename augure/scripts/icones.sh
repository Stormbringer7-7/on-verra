#!/bin/sh
# Icônes de l'app (assets/*.png) et sièges de l'ouverture animée depuis assets/logo.svg, état au repos du logo. Sur Android, le
# logo tient dans la zone sûre de l'icône adaptative (≈ 60 % du côté) ; splash-icon.png garde le
# cadrage du SVG pour que l'ouverture animée (ui/components/Ouverture.tsx) parte de la même image.
# À relancer si le logo change. Prérequis : brew install librsvg imagemagick
set -eu
cd "$(dirname "$0")/../assets"
FOND="#0b0d0c"
transparent=$(mktemp -t logo).svg
grep -v "fill=\"$FOND\"" logo.svg > "$transparent"

rsvg-convert -w 1024 -h 1024 logo.svg | magick - -alpha off icon.png
rsvg-convert -w 1024 -h 1024 "$transparent" -o splash-icon.png
rsvg-convert -w 48 -h 48 logo.svg -o favicon.png
magick -size 512x512 "xc:$FOND" android-icon-background.png
rsvg-convert -w 386 -h 386 "$transparent" | magick - -background none -gravity center -extent 512x512 android-icon-foreground.png
rsvg-convert -w 326 -h 326 "$transparent" | magick - -background none -gravity center -extent 432x432 \
  -fill white -colorize 100 android-icon-monochrome.png
# Sièges seuls, même cadrage : la barre et la pupille sont des vues animées par-dessus.
grep -v -e 'id="barre"' -e 'id="pupille"' "$transparent" | rsvg-convert -w 600 -h 600 -o sieges.png
rm "$transparent"
