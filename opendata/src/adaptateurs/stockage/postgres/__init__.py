"""Adaptateur Postgres du port `Entrepot` et migrations du schéma canonique. Importe psycopg :
n'est chargé que si l'on choisit Postgres (`ENTREPOT=postgres`)."""

from .entrepot import EntrepotPostgres
from .migrations import migrer
from .projections import ProjecteurPostgres


def connecter(url: str):
    import psycopg
    return psycopg.connect(url, autocommit=True)


__all__ = ["EntrepotPostgres", "ProjecteurPostgres", "connecter", "migrer"]
