"""Travaux parlementaires de l'AN chargés ensemble : dossiers, agenda, amendements, scrutins, séances.

Une seule transaction, parce que ces flux se citent les uns les autres (une étape cite ses
réunions, un point d'ordre du jour son dossier, un scrutin son étape et son amendement, une
intervention sa réunion, son dossier et les amendements discutés) : toutes les entités sont
identifiées avant la première écriture.
"""

from ....chargement import charger
from ....etl import Etape
from . import acteurs, agenda, amendements, dossiers, scrutins, seances


def annuaire(ctx):
    """Annuaire des noms de l'AMO (pour proposer des candidats en revue), construit une fois."""
    if "an.annuaire" not in ctx.artefacts:
        ctx.artefacts["an.annuaire"] = acteurs.annuaire(ctx.fichier(acteurs.ACTEURS.nom))
    return ctx.artefacts["an.annuaire"]


def executer(ctx):
    chemin_dossiers = ctx.fichier(dossiers.DOSSIERS.nom)
    dossier_du_texte = dossiers.numeros_de_texte(chemin_dossiers)
    index_amendements = amendements.Index(ctx.fichier(amendements.AMENDEMENTS.nom))
    ctx.artefacts["an.amendements"] = index_amendements
    # Clés de suivi et étapes d'examen : pour les amendements de l'AN, et ceux du Sénat (senat.travaux).
    examens = ctx.artefacts["an.examens"] = dossiers.lire_examens(chemin_dossiers)
    charger(ctx, *dossiers.flux(chemin_dossiers), *agenda.flux(ctx.fichier(agenda.AGENDA.nom)),
            *amendements.flux(ctx.fichier(amendements.AMENDEMENTS.nom), examens),
            *scrutins.flux(ctx.fichier(scrutins.SCRUTINS.nom), dossiers.actes_des_scrutins(chemin_dossiers),
                           index_amendements.chercher, index_amendements.dossier.get),
            *seances.flux(ctx.fichier(seances.SEANCES.nom), dossier_du_texte, index_amendements.chercher,
                          annuaire(ctx)))


ETAPE = Etape("an.travaux", executer, apres=("an.acteurs",),
              sources=lambda p: [dossiers.DOSSIERS, agenda.AGENDA, amendements.AMENDEMENTS, scrutins.SCRUTINS,
                                 seances.SEANCES],
              description="dossiers et étapes, documents, réunions, amendements, scrutins et votes, interventions")
