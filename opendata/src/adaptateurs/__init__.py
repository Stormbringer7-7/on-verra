"""Adaptateurs de sources : un sous-paquet par producteur de données (an = Assemblée nationale).

Un adaptateur expose `ETAPES` (liste d'`etl.Etape`) : extraction de ses fichiers bruts, mise en
forme et chargement dans les tables du schéma commun. Il ne connaît ni la publication ni
l'interface ; les transformations communes à toutes les sources vivent dans `transformations/`.
"""
