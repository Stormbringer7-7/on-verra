# Image des services opendata :
#   donnees     (commande « canon-en-boucle ») : base CivicTrace dans Postgres (DATABASE_URL), chargée
#               depuis l'open data, projections et contrôles, chaque jour ;
#   extraction  (commande par défaut, chaîne historique) : bases SQLite par législature publiées
#               dans /srv/publication, puis chargées dans Postgres (schémas lNN).
# Seule dépendance : psycopg, pour Postgres.
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir "psycopg[binary]==3.2.10"
COPY src ./src
COPY docker/mettre-a-jour.sh /usr/local/bin/mettre-a-jour
COPY docker/canon.sh /usr/local/bin/canon-en-boucle

# data/ : fichiers bruts (cache, data/brut), rapports de contrôle, base SQLite et partitions — gardé entre les cycles.
VOLUME ["/app/data", "/srv/publication"]
ENV INTERVALLE_MAJ=86400 \
    AGE_MAX=20 \
    PYTHONUNBUFFERED=1

CMD ["mettre-a-jour"]
