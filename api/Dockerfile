# Service « api » : exécute les commandes de l'app sur Postgres (base CivicTrace chargée par opendata),
# ou sur les fixtures du contrat (SOURCE_DONNEES=memoire).
# Contexte : la racine du dépôt, pour le contrat partagé avec l'app (augure/src/core) et ses fixtures
# (augure/src/infra/fixtures, adaptateur mémoire).
FROM node:22-slim AS construction
WORKDIR /depot/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY api/ ./
COPY augure/src/core ../augure/src/core
COPY augure/src/infra/fixtures ../augure/src/infra/fixtures
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=construction /depot/api/dist/serveur.mjs ./
ENV NODE_ENV=production PORT=3000 SOURCE_DONNEES=postgres
USER node
EXPOSE 3000
CMD ["node", "serveur.mjs"]
