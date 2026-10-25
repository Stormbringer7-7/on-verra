-- Premier démarrage de Postgres (volume vide) : la base CivicTrace, à côté de la base par défaut « big-brother »
-- (vide, base de maintenance). Le schéma est posé par `python -m src migrer` (service « donnees »).
CREATE DATABASE civictrace OWNER "big-brother";
