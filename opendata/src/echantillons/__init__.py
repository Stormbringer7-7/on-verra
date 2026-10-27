"""Échantillons de la 17e législature en SQLite, pour étudier et partager les données brutes :
chaque objet de chaque source officielle avec tous ses champs tels que publiés, et le profil de
chaque champ (type, remplissage, valeurs distinctes, similarité). Ne lit que le cache
`data/brut` ; n'écrit que dans `data/echantillons/`.

python -m src echantillons [objet|préfixe ...] [--reseau]

- `data/echantillons/17e.sqlite` : une table par objet et par liste de l'objet, plus `_objets`
  (source, famille, format, livraison, dates) et `_champs` (profil de chaque colonne) ;
- `data/echantillons/rapport.md` : la même chose à lire et à valider, objet par objet.
"""

import email.utils
import json
import time
import urllib.request
from pathlib import Path

from .aplatir import tables_de
from .base import ecrire, ouvrir
from .catalogue import DUMPS, OBJETS, SENAT_PAGE, LICENCE
from .lecture import tables_dump
from .rapport import rapport

__all__ = ["construire"]


def publie_le(url: str) -> str | None:
    """Date de dernière modification annoncée par le serveur (HEAD), si l'URL est un fichier."""
    if "<" in url or url.endswith("/"):
        return None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as r:
            d = r.headers.get("Last-Modified")
            return email.utils.parsedate_to_datetime(d).strftime("%Y-%m-%d %H:%M") if d else None
    except Exception:  # noqa: BLE001 — une source injoignable ne bloque pas l'échantillon
        return None


def date_cache(chemin: Path) -> str | None:
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(chemin.stat().st_mtime)) if chemin.exists() else None


def _retenu(cle: str, choix: list[str]) -> bool:
    return not choix or any(cle == c or cle.startswith(c + ".") for c in choix)


def _noter(cx, cle, famille, producteur, jeu, page, url, licence, format_, livraison, publie, cache, perimetre, total, lus, tables, remarque):
    cx.execute("INSERT OR REPLACE INTO _objets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (cle, famille, producteur, jeu, page, url, licence, format_, livraison, publie, cache, perimetre, total, lus,
                json.dumps(tables), remarque))
    cx.commit()


def construire(brut: Path, sortie: Path, choix: list[str] | None = None, reseau: bool = False) -> Path:
    choix = choix or []
    cx = ouvrir(sortie / "17e.sqlite")
    for o in OBJETS:
        if not _retenu(o.cle, choix):
            continue
        chemin = brut / o.fichier
        if not chemin.exists():
            print(f"  {o.cle} : absent du cache ({chemin}), sauté")
            continue
        debut = time.time()
        if o.lire:
            docs, total = o.lire(chemin, o.n)
        else:
            docs, total = [], sum(1 for _ in chemin.iterdir()) if chemin.is_dir() else 1
        tables, _ = tables_de(docs, o.cle.replace(".", "_"))
        ecrire(cx, o.cle, tables if docs else {})
        _noter(cx, o.cle, o.famille, o.producteur, o.jeu, o.page, o.url, o.licence, o.format, o.livraison,
               publie_le(o.url) if reseau else None, date_cache(chemin), o.perimetre, total, len(docs), sorted(tables) if docs else [],
               o.remarque)
        print(f"  {o.cle} : {len(docs)} sur {total}, {len(tables) if docs else 0} tables, {time.time() - debut:.1f} s")
    for d in DUMPS:
        if choix and not any(_retenu(d.cle + ".", [c]) or c.startswith(d.cle + ".") for c in choix):
            continue
        chemin = brut / d.fichier
        publie = publie_le(d.url) if reseau else None
        debut = time.time()
        for table, lignes, total in tables_dump(chemin, d.membre, d.n, d.filtres):
            cle = f"{d.cle}.{table}"
            if not _retenu(cle, choix):
                continue
            nom = cle.replace(".", "_")
            ecrire(cx, cle, tables_de(lignes, nom)[0])
            filtre = table in d.filtres
            _noter(cx, cle, d.familles.get(table, d.familles["*"]), "Sénat", d.jeu, SENAT_PAGE, d.url, LICENCE,
                   "dump PostgreSQL (bloc COPY) dans une archive ZIP", "stock complet", publie, date_cache(chemin),
                   "lignes datées depuis la 17e" if filtre else "toute la table", total, len(lignes), [nom],
                   "" if filtre else "Table sans date retenue : échantillon sur toute la période.")
        print(f"  {d.cle} : {time.time() - debut:.1f} s")
    (sortie / "rapport.md").write_text(rapport(cx))
    return sortie / "17e.sqlite"
