"""Attribution d'un siège de l'hémicycle à chaque député en fonction le jour d'un scrutin.

Deux modes :
- "reel"        : au moins SEUIL_REEL des députés ont un siège connu (numéro publié avec le vote,
                  ou dernière place connue du mandat). Les autres prennent le siège libre le plus
                  proche des membres de leur groupe.
- "reconstitue" : les sièges sont trop rarement connus (15e, 16e législatures). Chaque groupe
                  reçoit un secteur contigu de l'hémicycle, dans l'ordre gauche-droite observé
                  sur les sièges connus de ses membres.
"""

import math

SEUIL_REEL = 0.9
ANGLE_CENTRE = 90.0


def placer(deputes: list[dict], sieges: list[dict]) -> tuple[dict[str, int], str]:
    """deputes : [{"acteur": ..., "groupe": ..., "place": int | None}] ; retourne ({acteur: siège}, mode)."""
    par_num = {s["num"]: s for s in sieges}
    connus, pris = {}, set()
    for d in deputes:
        if d["place"] in par_num and d["place"] not in pris:
            connus[d["acteur"]] = d["place"]
            pris.add(d["place"])

    if deputes and len(connus) / len(deputes) >= SEUIL_REEL:
        return completer(deputes, connus, par_num), "reel"
    return reconstituer(deputes, connus, sieges), "reconstitue"


def completer(deputes: list[dict], places: dict[str, int], par_num: dict[int, dict]) -> dict[str, int]:
    places = dict(places)
    libres = set(par_num) - set(places.values())
    for d in deputes:
        if d["acteur"] in places or not libres:
            continue
        membres = [par_num[places[m["acteur"]]] for m in deputes
                   if m["groupe"] == d["groupe"] and m["acteur"] in places]
        if membres:
            cx = sum(s["x"] for s in membres) / len(membres)
            cy = sum(s["y"] for s in membres) / len(membres)
            # sorted() : à distance égale, le plus petit numéro gagne (même résultat qu'en Kotlin).
            choix = min(sorted(libres), key=lambda n: math.hypot(par_num[n]["x"] - cx, par_num[n]["y"] - cy))
        else:
            choix = min(sorted(libres), key=lambda n: abs(par_num[n]["angle"] - ANGLE_CENTRE))
        places[d["acteur"]] = choix
        libres.discard(choix)
    return places


def reconstituer(deputes: list[dict], connus: dict[str, int], sieges: list[dict]) -> dict[str, int]:
    angle = {s["num"]: s["angle"] for s in sieges}
    groupes: dict[str, list[dict]] = {}
    for d in deputes:
        groupes.setdefault(d["groupe"], []).append(d)

    def position(groupe: str) -> float:
        angles = [angle[connus[m["acteur"]]] for m in groupes[groupe] if m["acteur"] in connus]
        return sum(angles) / len(angles) if angles else ANGLE_CENTRE

    # Sièges de gauche à droite ; dans un secteur, du premier rang vers le haut.
    ordre_sieges = sorted(sieges, key=lambda s: s["angle"])
    places, i = {}, 0
    for groupe in sorted(groupes, key=position):
        membres = sorted(groupes[groupe], key=lambda m: m.get("nom") or "")
        secteur = sorted(ordre_sieges[i:i + len(membres)], key=lambda s: (s["rayon"], s["angle"]))
        for m, s in zip(membres, secteur):
            places[m["acteur"]] = s["num"]
        i += len(membres)
    return places
