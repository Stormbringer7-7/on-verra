# Image du service « donnees » (commande « canon-en-boucle ») : base CivicTrace dans Postgres
# (DATABASE_URL), chargée depuis l'open data, projections et contrôles, chaque jour.
# Dépendances : psycopg (Postgres) ; cryptography et gnupg pour le banc de revue (service « revue » :
# signatures Ed25519 des requêtes, clés inscrites par GPG).
FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gnupg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "psycopg[binary]==3.2.10" "cryptography==50.0.2"
COPY src ./src
COPY parcours ./parcours
COPY docker/canon.sh /usr/local/bin/canon-en-boucle

# data/ : fichiers bruts (cache, data/brut) et rapports de contrôle — gardé entre les cycles.
VOLUME ["/app/data"]
ENV INTERVALLE_MAJ=86400 \
    AGE_MAX=20 \
    PYTHONUNBUFFERED=1

CMD ["canon-en-boucle"]
