"""Modèles de parcours : `opendata/parcours/*.toml` → tables `canon.parcours_*`.

Un modèle par type de dossier (versionné, daté), écrit à la main d'après le droit ; les codes
d'actes publiés par chaque source sont rattachés aux phases dans `correspondances.toml`, qui porte
aussi les déviations communes. Un modèle peut hériter d'un autre (`herite`) : il reprend ses
étapes, transitions et déviations, redéfinit une étape par sa clé (champs donnés seulement), en
retire (`retire`), en ajoute (`apres` : après quelle étape). Rechargés à chaque projection : le
parcours suivi de chaque dossier (projections 45 et 55) suit toujours les fichiers.
"""

import tomllib
from pathlib import Path

PARCOURS = Path(__file__).resolve().parents[1] / "parcours"
CORRESPONDANCES = "correspondances.toml"
NATURES = {"obligatoire", "conditionnelle", "facultative"}
EFFETS = {"rejoint", "termine", "remplace", "suspend"}


def lire(dossier: Path = PARCOURS) -> tuple[dict, list[dict]]:
    """(correspondances, modèles résolus) ; lève ValueError si un fichier est incohérent."""
    corr = tomllib.loads((dossier / CORRESPONDANCES).read_text())
    corr["fichier"] = CORRESPONDANCES
    bruts = {}
    for f in sorted(dossier.glob("*.toml")):
        if f.name != CORRESPONDANCES:
            m = tomllib.loads(f.read_text())
            m["fichier"] = f.name
            bruts[(m["cle"], m["version"])] = m
    communes = {d["cle"]: d for d in corr.get("deviation", [])}
    modeles = [resoudre(m, bruts, communes) for m in bruts.values()]
    verifier(corr, modeles)
    return corr, modeles


def resoudre(m: dict, bruts: dict, communes: dict) -> dict:
    """Le modèle avec ce qu'il hérite : étapes dans l'ordre, transitions, déviations."""
    if "herite" in m:
        parents = [p for (cle, _), p in bruts.items() if cle == m["herite"]]
        if not parents:
            raise ValueError(f"{m['fichier']} : hérite de {m['herite']}, inconnu")
        parent = resoudre(max(parents, key=lambda p: p["version"]), bruts, {})
        etapes = [dict(e) for e in parent["etape"] if e["cle"] not in m.get("retire", [])]
        propres = {t["de"] for t in m.get("transition", [])}
        transitions = [t for t in parent.get("transition", []) if t["de"] not in propres]
        deviations = {d["cle"]: d for d in parent.get("deviation", [])}
    else:
        etapes, transitions, deviations = [], [], {}
    for e in m.get("etape", []):
        deja = next((x for x in etapes if x["cle"] == e["cle"]), None)
        if deja:
            deja.update({k: v for k, v in e.items() if k != "apres"})
        elif "apres" in e:
            i = next((i for i, x in enumerate(etapes) if x["cle"] == e["apres"]), None)
            if i is None:
                raise ValueError(f"{m['fichier']} : {e['cle']} après {e['apres']}, étape inconnue")
            etapes.insert(i + 1, {k: v for k, v in e.items() if k != "apres"})
        else:
            etapes.append(e)
    cles = {e["cle"] for e in etapes}
    transitions = [t for t in transitions + m.get("transition", []) if t["de"] in cles and t["vers"] in cles | {"fin"}]
    deviations = {**communes, **deviations, **{d["cle"]: d for d in m.get("deviation", [])}}
    return {**{k: v for k, v in m.items() if k not in ("etape", "transition", "deviation", "retire")},
            "etape": etapes, "transition": transitions, "deviation": list(deviations.values())}


def verifier(corr: dict, modeles: list[dict]) -> None:
    erreurs = []
    types = {}
    for m in modeles:
        nom = f"{m['fichier']}"
        cles = [e["cle"] for e in m["etape"]]
        if len(cles) != len(set(cles)):
            erreurs.append(f"{nom} : étape en double")
        for e in m["etape"]:
            if e.get("nature") not in NATURES:
                erreurs.append(f"{nom} : {e['cle']}, nature « {e.get('nature')} »")
            if not set(e.get("conclut", e["phases"])) <= set(e["phases"]):
                erreurs.append(f"{nom} : {e['cle']}, `conclut` hors de ses phases")
        for t in m["transition"]:
            if t["de"] not in cles:
                erreurs.append(f"{nom} : transition depuis {t['de']}, étape inconnue")
        for d in m["deviation"]:
            if d["effet"] not in EFFETS or d.get("effet_si", "rejoint") not in EFFETS:
                erreurs.append(f"{nom} : déviation {d['cle']}, effet inconnu")
        for t in m["types"]:
            if (t, m["valide_du"]) in types:
                erreurs.append(f"{nom} : type « {t} » déjà pris par {types[(t, m['valide_du'])]}")
            types[(t, m["valide_du"])] = nom
    connues = {d["cle"] for m in modeles for d in m["deviation"]}
    for c in corr["correspondance"]:
        if c.get("deviation") and c["deviation"] not in connues:
            erreurs.append(f"{CORRESPONDANCES} : déviation {c['deviation']} absente de tous les modèles")
        if c["role"] == "deviation" and not c.get("deviation"):
            erreurs.append(f"{CORRESPONDANCES} : {c['motif']}, rôle deviation sans déviation")
    if erreurs:
        raise ValueError("Modèles de parcours incohérents :\n" + "\n".join(erreurs))


def charger(cx, dossier: Path = PARCOURS) -> dict[str, int]:
    """Réécrit les tables `canon.parcours_*` depuis les fichiers (dans la transaction de `cx`)."""
    corr, modeles = lire(dossier)
    for t in ("correspondance", "deviation", "transition", "etape", "type", "modele"):
        cx.execute(f"DELETE FROM canon.parcours_{t}")
    for m in modeles:
        cle, version = m["cle"], m["version"]
        cx.execute("INSERT INTO canon.parcours_modele VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                   (cle, version, m["libelle"], m["famille"], m["juridiction"], m["valide_du"], m.get("valide_au"),
                    m["fondement"], m["fichier"]))
        for t in m["types"]:
            cx.execute("INSERT INTO canon.parcours_type VALUES (%s,%s,%s)", (cle, version, t))
        for rang, e in enumerate(m["etape"], 1):
            cx.execute("INSERT INTO canon.parcours_etape VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (cle, version, e["cle"], rang, e["libelle"], e["phases"], e.get("conclut", e["phases"]),
                        e["lecture"], e["cote"], e["nature"], e.get("conclusifs", 1), e.get("issue")))
        for t in m["transition"]:
            cx.execute("INSERT INTO canon.parcours_transition VALUES (%s,%s,%s,%s,%s,%s)",
                       (cle, version, t["de"], t["vers"], t["condition"], t["libelle"]))
        for d in m["deviation"]:
            cx.execute("INSERT INTO canon.parcours_deviation VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (cle, version, d["cle"], d["libelle"], d["fondement"], d["effet"], d.get("si"), d.get("effet_si"),
                        d.get("issue")))
    for rang, c in enumerate(corr["correspondance"], 1):
        cx.execute("INSERT INTO canon.parcours_correspondance VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                   (corr["juridiction"], rang, c["systeme"], c["motif"], c["phase"], c["role"], c.get("deviation"),
                    corr["fichier"]))
    return {"modeles": len(modeles), "correspondances": len(corr["correspondance"])}
