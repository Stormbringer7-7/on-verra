# Service « extraction » : compile la base opendata depuis l'open data de l'Assemblée nationale,
# la publie par législature (index.json + <leg>/…) dans le volume /srv/publication, puis recommence
# périodiquement. Le service « publication » (Dockerfile.nginx) sert ce volume.
# Bibliothèque standard uniquement : aucune dépendance à installer.
FROM python:3.12-slim

WORKDIR /app
COPY src ./src
COPY docker/mettre-a-jour.sh /usr/local/bin/mettre-a-jour

# data/ : fichiers bruts de l'AN (cache), base complète et partitions — un volume, gardé entre les cycles.
VOLUME ["/app/data", "/srv/publication"]
ENV INTERVALLE_MAJ=86400 \
    PYTHONUNBUFFERED=1

CMD ["mettre-a-jour"]
