"""Diagrammes entité-relation (Mermaid) du schéma canonique, lus dans la base migrée elle-même.

Les blocs de `docs/uml.md` encadrés par `<!-- uml:<domaine> -->` et `<!-- /uml -->` sont
régénérés depuis le catalogue Postgres (colonnes, clés primaires, clés étrangères) : le
diagramme ne peut pas diverger du schéma réel, migrations comprises (vérifié par
`tests/test_uml.py`). Toute table doit appartenir à un domaine.

    DATABASE_URL=postgres://…/civictrace python -m src uml
"""

import re
from pathlib import Path

DOC = Path(__file__).resolve().parents[1] / "docs" / "uml.md"
SCHEMAS = ("brut", "canon", "analytique")

DOMAINES = {
    "socle": ["brut.enregistrement_source", "canon.entite", "canon.correspondance", "canon.provenance",
              "canon.historique", "canon.fusion", "analytique.cas_revue", "analytique.affirmation", "analytique.preuve",
              "analytique.signalement"],
    "personnes": ["canon.personne", "canon.organisation", "canon.fonction", "canon.lien", "canon.mandat_rne"],
    "dossiers": ["canon.dossier", "canon.etape", "canon.document", "canon.version_texte", "canon.article_suivi",
                 "canon.version_article", "canon.modification_article", "canon.evenement_agenda",
                 "canon.decision_cc", "canon.texte_publie"],
    "votes": ["canon.amendement", "canon.avis_amendement", "canon.scrutin", "canon.vote", "canon.position_groupe"],
    "discussions": ["canon.reunion", "canon.point_odj", "canon.intervention", "canon.participation",
                    "canon.audition", "canon.question"],
    "transparence": ["canon.declaration", "canon.rubrique_declaree", "canon.representant_interets",
                     "canon.exercice_representation", "canon.action_representation"],
}

TYPES = {"int4": "int", "_text": "text_array"}
BLOC = re.compile(r"(<!-- uml:(\w+) -->\n)(.*?)(<!-- /uml -->)", re.S)


def structure(cx) -> dict:
    """{table: {"colonnes": [(nom, type, nullable)], "pk": {col}, "fk": {col: table}}}."""
    tables: dict = {}
    for schema, table, col, udt, nullable in cx.execute(
            "SELECT c.table_schema, c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES'"
            " FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)"
            " WHERE t.table_type = 'BASE TABLE' AND c.table_schema = ANY(%s)"
            " ORDER BY 1, 2, c.ordinal_position", (list(SCHEMAS),)):
        t = tables.setdefault(f"{schema}.{table}", {"colonnes": [], "pk": set(), "fk": {}})
        t["colonnes"].append((col, TYPES.get(udt, udt), nullable))
    for schema, table, nature, col, cible in cx.execute(
            "SELECT n.nspname, cl.relname, con.contype, a.attname, fn.nspname || '.' || fcl.relname"
            " FROM pg_constraint con"
            " JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace"
            " CROSS JOIN LATERAL unnest(con.conkey) k(attnum)"
            " JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum"
            " LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid LEFT JOIN pg_namespace fn ON fn.oid = fcl.relnamespace"
            " WHERE con.contype IN ('p', 'f') AND n.nspname = ANY(%s)", (list(SCHEMAS),)):
        t = tables[f"{schema}.{table}"]
        if nature == "p":
            t["pk"].add(col)
        else:
            t["fk"][col] = cible
    return tables


def court(table: str) -> str:
    return table.split(".", 1)[1]


def diagramme(tables: dict, domaine: str) -> str:
    """erDiagram d'un domaine. L'héritage `entite_id` → `canon.entite` (racine commune) n'est
    pas tracé : il vaut pour toutes les tables d'entités."""
    lignes, relations = ["```mermaid", "erDiagram"], []
    for nom in DOMAINES[domaine]:
        t = tables[nom]
        lignes.append(f"    {court(nom)} {{")
        for col, type_, _ in t["colonnes"]:
            cles = [c for c, oui in (("PK", col in t["pk"]), ("FK", col in t["fk"])) if oui]
            lignes.append(f"        {type_} {col}{' ' + ', '.join(cles) if cles else ''}")
        lignes.append("    }")
        nullable = {col: n for col, _, n in t["colonnes"]}
        for col, cible in sorted(t["fk"].items()):
            if col == "entite_id" and cible == "canon.entite" and col in t["pk"] and nom != "canon.entite":
                continue
            relations.append(f"    {court(nom)} }}o--{'o|' if nullable[col] else '||'} {court(cible)} : \"{col}\"")
    return "\n".join(lignes + relations + ["```"]) + "\n"


def sans_domaine(tables: dict) -> list[str]:
    classees = {t for noms in DOMAINES.values() for t in noms}
    return sorted(set(tables) - classees)


def regenerer(texte: str, tables: dict) -> str:
    return BLOC.sub(lambda m: m.group(1) + diagramme(tables, m.group(2)) + m.group(4), texte)


def ecrire(cx, doc: Path = DOC) -> bool:
    """Réécrit les blocs du document ; True s'il a changé."""
    tables = structure(cx)
    if manquantes := sans_domaine(tables):
        raise SystemExit(f"Tables sans domaine dans src/uml.py : {', '.join(manquantes)}")
    texte = doc.read_text(encoding="utf-8")
    nouveau = regenerer(texte, tables)
    if nouveau != texte:
        doc.write_text(nouveau, encoding="utf-8")
    return nouveau != texte
