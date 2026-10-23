# Service « extraction » : compile la base opendata depuis l'open data de l'Assemblée nationale,
# la publie par législature (index.json + <leg>/…) dans le volume /srv/publication, puis recommence
# périodiquement, et charge chaque nouvelle version dans Postgres (DATABASE_URL) pour l'API.
# Seule dépendance : psycopg, pour Postgres.
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir "psycopg[binary]==3.2.10"
COPY src ./src
COPY docker/mettre-a-jour.sh /usr/local/bin/mettre-a-jour

# data/ : fichiers bruts de l'AN (cache), base complète et partitions — un volume, gardé entre les cycles.
VOLUME ["/app/data", "/srv/publication"]
ENV INTERVALLE_MAJ=86400 \
    AGE_MAX=20 \
    PYTHONUNBUFFERED=1

CMD ["mettre-a-jour"]
