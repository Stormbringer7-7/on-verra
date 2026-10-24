"""Projections de lecture sur Postgres : les fichiers `src/projections/NN_*.sql`, exécutés dans
l'ordre, reconstruisent le schéma `lecture` en une transaction (l'ancien reste lisible jusqu'au
commit). Elles ne lisent que `canon` : des données 100 % fiables. Formules : docs/indicateurs.md.

Statistiques rafraîchies avant (`canon`, que le chargement vient de réécrire) et après (`lecture`) :
périmées, elles faussent les plans de l'API (jointures estimées à 7 000 lignes pour 1,4 million)."""

from pathlib import Path

PROJECTIONS = Path(__file__).resolve().parents[3] / "projections"


class ProjecteurPostgres:
    def __init__(self, connexion, dossier: Path = PROJECTIONS):
        self.cx, self.dossier = connexion, dossier

    def projeter(self) -> dict[str, int]:
        with self.cx.transaction():
            self.analyser("canon")
            self.cx.execute("DROP SCHEMA IF EXISTS lecture CASCADE")
            self.cx.execute("CREATE SCHEMA lecture")
            for f in sorted(self.dossier.glob("*.sql")):
                self.cx.execute(f.read_text())
            self.analyser("lecture")
            tables = [t for (t,) in self.cx.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'lecture' ORDER BY 1")]
            return {t: self.cx.execute(f"SELECT count(*) FROM lecture.{t}").fetchone()[0] for t in tables}

    def analyser(self, schema: str) -> None:
        tables = self.cx.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s AND table_type = 'BASE TABLE'",
            (schema,)).fetchall()
        for (t,) in tables:
            self.cx.execute(f'ANALYZE "{schema}"."{t}"')
