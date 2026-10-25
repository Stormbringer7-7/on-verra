"""Adaptateurs de l'ETL, derrière les ports de `ports.py` :
- sources/   un sous-paquet par producteur (an, senat, constit, hatvp, rne, insee) : chacun expose
             `ETAPES` (liste d'`etl.Etape`) et analyse ses documents bruts en objets du domaine,
             sans écrire de SQL ;
- stockage/  l'Entrepot (Postgres, mémoire pour les essais) et le Projecteur ;
- synthese   le port Synthetiseur : seul `SansSynthese` est branché.
"""
