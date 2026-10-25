# Image du service « donnees » (commande « canon-en-boucle ») : base CivicTrace dans Postgres
# (DATABASE_URL), chargée depuis l'open data, projections et contrôles, chaque jour.
# Seule dépendance : psycopg, pour Postgres.
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir "psycopg[binary]==3.2.10"
COPY src ./src
COPY docker/canon.sh /usr/local/bin/canon-en-boucle

# data/ : fichiers bruts (cache, data/brut) et rapports de contrôle — gardé entre les cycles.
VOLUME ["/app/data"]
ENV INTERVALLE_MAJ=86400 \
    AGE_MAX=20 \
    PYTHONUNBUFFERED=1

CMD ["canon-en-boucle"]
