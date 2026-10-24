"""Adaptateurs de sources du modèle canonique : un sous-paquet par producteur.

Un adaptateur lit ses fichiers bruts et produit des objets du domaine (`domaine.objets`) dont
les références sont des identités natives. Il n'écrit jamais en base : `chargement` s'en charge
via le port `Entrepot`. Les anciens adaptateurs (`adaptateurs/an`) alimentent encore la base
SQLite publiée, jusqu'à la bascule de l'API.
"""
