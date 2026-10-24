-- Premier démarrage de Postgres (volume vide) : la base CivicTrace, à côté de « big-brother »
-- (chaîne historique). Le schéma est posé par `python -m src migrer` (service « donnees »).
CREATE DATABASE civictrace OWNER "big-brother";
