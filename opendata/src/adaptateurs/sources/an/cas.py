"""Cas de revue propres à l'AN : amendements cités ambigus ou introuvables, orateurs à identifier.

Le code ne choisit jamais : il liste les candidats (avec des indices) et laisse décider une
personne (cf. docs/rapprochements.md).
"""

from ....domaine.objets import Candidat, CasRevue
from ....noms import nom_d_orateur
from .commun import an


def amendement_cite(cle: str, numero: str, candidats: list[str], cibles, contexte: dict,
                     identite=lambda u: an("amendement", u)) -> CasRevue:
    """Numéro d'amendement cité qui désigne plusieurs amendements, ou aucun (`identite` : uid ->
    identité native, celle du Sénat pour ses comptes rendus). `contexte["motif"]` : un candidat
    unique mais contesté (deux références en désaccord), à confirmer comme un choix."""
    ambigu = len(candidats) > 1 or bool(candidats and contexte.get("motif"))
    return CasRevue(
        "amendement_ambigu" if ambigu else "amendement_introuvable", cle, "champ" if ambigu else "constat",
        f"amendement n° {numero} cité ({contexte.get('ou', '')}) : "
        + (contexte["motif"] if contexte.get("motif") and len(candidats) == 1
           else f"{len(candidats)} amendements portent ce numéro" if ambigu else "aucun amendement connu ne porte ce numéro"),
        champ="amendement_id", cibles=tuple(cibles),
        candidats=tuple(Candidat("amendement", identite(u), u) for u in candidats),
        contexte={"numero": numero, **contexte})


def candidats_orateur(libelle: str, annuaire: dict[str, list[dict]], presents: dict[str, str] | None = None
                      ) -> tuple[Candidat, ...]:
    """Personnes de l'AMO qui portent le nom d'un orateur ; la présence à la réunion est un indice."""
    nom = nom_d_orateur(libelle)
    if not nom:
        return ()
    return tuple(Candidat("personne", an("acteur", a["acteur"]), a["libelle"], {
        **({"presence": (presents or {}).get(a["acteur"], "non listé")} if presents is not None else {}),
        "depute": a["depute"], "membre_gouvernement": a["membre_gouvernement"]}) for a in annuaire.get(nom, []))
