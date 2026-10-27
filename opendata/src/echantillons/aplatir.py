"""Un document (JSON, ou XML converti) → des lignes de tables, sans rien perdre : chaque feuille
devient une colonne (chemin pointé), chaque liste une table fille (`_parent`, `_rang`).

Dans les JSON de l'AN (convertis depuis XML), un même chemin est une liste dans un document et un
objet seul dans un autre (liste d'un élément) : `normaliser` relève les chemins qui sont une liste
au moins une fois et y met l'objet seul dans une liste, jusqu'à ce que plus rien ne change.
`xsi:nil` (valeur absente publiée par l'AN) devient NULL. Fonctions pures."""

from collections import defaultdict

from ..textes import texte_html

SEPARATEUR_TABLE = "__"


def nul(v) -> bool:
    """Valeur absente : None, ou le `{"@xsi:nil": "true"}` des JSON de l'AN."""
    return v is None or (isinstance(v, dict) and v.get("@xsi:nil") == "true"
                         and all(k.startswith("@xmlns") or k == "@xsi:nil" for k in v))


def _listes(v, c: str, trouves: set[str]) -> None:
    """Chemins des listes ; dans une liste, les chemins des éléments sont « liste[]sous.chemin »."""
    if nul(v):
        return
    if isinstance(v, dict):
        for k, x in v.items():
            _listes(x, f"{c}.{k}" if c else k, trouves)
    elif isinstance(v, list):
        trouves.add(c)
        for x in v:
            if isinstance(x, dict):
                for k, y in x.items():
                    _listes(y, f"{c}[]{k}", trouves)


def _envelopper(v, c: str, listes: set[str]):
    """Le document, avec un objet seul mis en liste là où le chemin est une liste ailleurs."""
    if nul(v):
        return None
    if isinstance(v, dict):
        if c in listes:
            return [_envelopper(v, c + "\0", listes)]
        base = c[:-1] if c.endswith("\0") else c
        return {k: _envelopper(x, f"{base}[]{k}" if c.endswith("\0") else (f"{base}.{k}" if base else k), listes)
                for k, x in v.items()}
    if isinstance(v, list):
        return [_envelopper(x, c + "\0", listes) if isinstance(x, dict) else x for x in v]
    return v


def normaliser(docs: list[dict]) -> tuple[list[dict], set[str]]:
    """Les documents normalisés et les chemins de listes (point fixe : quelques passes au plus)."""
    listes: set[str] = set()
    for _ in range(10):
        trouves: set[str] = set()
        for d in docs:
            _listes(d, "", trouves)
        nouveaux = not trouves <= listes
        listes |= trouves
        # Toujours au moins une passe : elle remplace aussi les `xsi:nil` par None.
        docs = [_envelopper(d, "", listes) for d in docs]
        if not nouveaux:
            break
    return docs, listes


def nom_table(table: str, chemin: str) -> str:
    return f"{table}{SEPARATEUR_TABLE}{chemin.replace('.', '_')}"


def aplatir(doc: dict, table: str, tables: dict[str, list[dict]], parent: int | None = None, rang: int | None = None) -> int:
    """Ajoute `doc` (normalisé) à `tables[table]`, ses listes aux tables filles ; rend l'identifiant de la ligne."""
    ligne: dict = {"_id": len(tables[table]) + 1}
    if parent is not None:
        ligne["_parent"], ligne["_rang"] = parent, rang
    tables[table].append(ligne)

    def visiter(v, c):
        if v is None:
            ligne.setdefault(c, None)
        elif isinstance(v, list):
            fille = nom_table(table, c)
            for i, x in enumerate(v):
                if isinstance(x, dict):
                    aplatir(x, fille, tables, ligne["_id"], i)
                else:
                    tables[fille].append({"_id": len(tables[fille]) + 1, "_parent": ligne["_id"], "_rang": i,
                                          "valeur": texte_html(x) if isinstance(x, str) else x})
        elif isinstance(v, dict):
            if not v:
                ligne.setdefault(c, None)
            for k, x in v.items():
                visiter(x, f"{c}.{k}")
        else:
            ligne[c] = texte_html(v) if isinstance(v, str) else v

    for k, x in doc.items():
        visiter(x, k)
    return ligne["_id"]


def tables_de(docs: list[dict], table: str) -> tuple[dict[str, list[dict]], set[str]]:
    """Tous les documents d'un objet → ses tables (racine et filles), et les chemins de listes."""
    docs, listes = normaliser(docs)
    tables: dict[str, list[dict]] = defaultdict(list)
    tables[table]  # la racine existe même sans document
    for d in docs:
        aplatir(d, table, tables)
    return dict(tables), listes
