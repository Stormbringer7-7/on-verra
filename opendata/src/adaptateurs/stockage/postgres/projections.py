"""Projections de lecture sur Postgres : les fichiers `src/projections/NN_*.sql`, exécutés dans
l'ordre, reconstruisent le schéma `lecture`. Elles ne lisent que `canon` : des données 100 % fiables.
Formules : docs/indicateurs.md.

Sans couper la lecture : tout est construit dans un schéma à part, `lecture_nouveau` (les fichiers
écrivent `lecture.<table>`, redirigé à l'exécution), pendant que l'API continue de lire l'ancien
`lecture`. À la fin seulement, dans la même transaction, l'ancien est supprimé et le nouveau
renommé : le verrou exclusif ne dure que le temps de l'échange, pas toute la reconstruction (qui
prend plusieurs minutes et faisait expirer chaque requête de l'API pendant ce temps).

Statistiques rafraîchies avant (`canon`, que le chargement vient de réécrire) et après (`lecture`) :
périmées, elles faussent les plans de l'API (jointures estimées à 7 000 lignes pour 1,4 million)."""

import re
from pathlib import Path

PROJECTIONS = Path(__file__).resolve().parents[3] / "projections"
SCHEMA = "lecture"
CHANTIER = "lecture_nouveau"

_REFERENCE = re.compile(rf"\b{SCHEMA}\.")


def vers_chantier(sql: str) -> str:
    """Le texte d'une projection, ses `lecture.<table>` redirigés vers le schéma en construction."""
    return _REFERENCE.sub(f"{CHANTIER}.", sql)


class ProjecteurPostgres:
    def __init__(self, connexion, dossier: Path = PROJECTIONS):
        self.cx, self.dossier = connexion, dossier

    def projeter(self) -> dict[str, int]:
        with self.cx.transaction():
            self.analyser("canon")
            self.cx.execute(f"DROP SCHEMA IF EXISTS {CHANTIER} CASCADE")
            self.cx.execute(f"CREATE SCHEMA {CHANTIER}")
            for f in sorted(self.dossier.glob("*.sql")):
                self.cx.execute(vers_chantier(f.read_text()))
            self.analyser(CHANTIER)
            # Échange : seul moment où les lectures attendent (quelques millisecondes).
            self.cx.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
            self.cx.execute(f"ALTER SCHEMA {CHANTIER} RENAME TO {SCHEMA}")
            tables = [t for (t,) in self.cx.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = %s ORDER BY 1", (SCHEMA,))]
            return {t: self.cx.execute(f"SELECT count(*) FROM {SCHEMA}.{t}").fetchone()[0] for t in tables}

    def analyser(self, schema: str) -> None:
        tables = self.cx.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s AND table_type = 'BASE TABLE'",
            (schema,)).fetchall()
        for (t,) in tables:
            self.cx.execute(f'ANALYZE "{schema}"."{t}"')
