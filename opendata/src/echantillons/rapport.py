"""Rapport de validation des échantillons, lu dans la base SQLite : par famille, chaque objet avec sa
source officielle, son format, sa livraison et ses dates, puis chacun de ses champs (type observé,
remplissage, valeurs distinctes, similarité, valeurs les plus fréquentes)."""

import json
import sqlite3
from collections import defaultdict


def _pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.0f} %".replace(".", ",")


def _types(t: str) -> str:
    d = json.loads(t)
    if not d:
        return "—"
    if len(d) == 1:
        return next(iter(d))
    return ", ".join(f"{k} {_pct(v)}" for k, v in d.items())


def _frequentes(f: str, distinctes: int, remplies: int) -> str:
    valeurs = json.loads(f)
    if not valeurs or distinctes == remplies:
        return "toutes différentes" if valeurs else "—"
    return " · ".join(f"`{v['valeur'].replace('|', '/').replace(chr(10), ' ')}` {_pct(v['part'])}" for v in valeurs[:3])


def rapport(cx: sqlite3.Connection) -> str:
    objets = cx.execute("SELECT * FROM _objets ORDER BY famille, objet").fetchall()
    noms = [d[0] for d in cx.execute("SELECT * FROM _objets LIMIT 0").description]
    par_famille: dict[str, list[dict]] = defaultdict(list)
    for o in objets:
        o = dict(zip(noms, o))
        par_famille[o["famille"]].append(o)

    lignes = ["# Échantillons de la 17e législature : objets et champs à valider", "",
              "Généré par `python -m src echantillons` depuis `data/echantillons/17e.sqlite`. Pour chaque champ :",
              "type observé, remplissage (part des lignes où il a une valeur), valeurs distinctes, similarité (part",
              "de la valeur la plus fréquente parmi les valeurs remplies : 100 % = constante), valeurs fréquentes.",
              "Les tables filles (`__`) sont les listes de l'objet, reliées par `_parent`.", "",
              "| Famille | Objet | Source | Format | Livraison | Publié le | Échantillon | Champs |", "|---|---|---|---|---|---|---|---|"]
    for f, os in sorted(par_famille.items()):
        for o in os:
            champs = cx.execute("SELECT count(*) FROM _champs WHERE objet = ?", (o["objet"],)).fetchone()[0]
            lignes.append(f"| {f} | [`{o['objet']}`](#{o['objet'].replace('.', '')}) | {o['producteur']}, {o['jeu']} | {o['format']} | "
                          f"{o['livraison']} | {o['publie_le'] or '—'} | {o['documents_lus']} / {o['documents_total']} | {champs} |")

    for famille, os in sorted(par_famille.items()):
        lignes += ["", f"## {famille}"]
        for o in os:
            lignes += ["", f"### `{o['objet']}`", "",
                       f"- **Source officielle** : {o['producteur']}, {o['jeu']} — [{o['page_officielle']}]({o['page_officielle']}) ; fichier : {o['url']}",
                       f"- **Licence** : {o['licence']}",
                       f"- **Format** : {o['format']}",
                       f"- **Livraison** : {o['livraison']} ; publié le {o['publie_le'] or 'non vérifié'} (date du serveur) ; en cache du {o['cache_du'] or '—'}",
                       f"- **Périmètre** : {o['perimetre']} ; échantillon : {o['documents_lus']} sur {o['documents_total']}"]
            if o["remarque"]:
                lignes.append(f"- **Remarque** : {o['remarque']}")
            for table in json.loads(o["tables"]):
                champs = cx.execute("SELECT colonne, n, remplies, remplissage, types, distinctes, similarite, frequentes "
                                    "FROM _champs WHERE table_ = ? ORDER BY rowid", (table,)).fetchall()
                n = cx.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
                lignes += ["", f"`{table}` — {n} lignes", "",
                           "| Champ | Type | Rempli | Distinctes | Similarité | Valeurs fréquentes |", "|---|---|---|---|---|---|"]
                lignes += [f"| `{c}` | {_types(t)} | {_pct(r)} | {d} | {_pct(s)} | {_frequentes(f, d, rem)} |"
                           for c, _, rem, r, t, d, s, f in champs]
    return "\n".join(lignes) + "\n"
