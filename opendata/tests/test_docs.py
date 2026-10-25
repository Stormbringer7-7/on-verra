"""Les docs citent le code qui implémente chaque règle : chaque lien doit tomber sur la bonne fonction.

Un lien `[acteur()](../../src/adaptateurs/sources/an/acteurs.py#L80)` ou
`[test_scrutin](../../tests/test_sources_an.py#L270)` est vérifié : le fichier existe et la ligne
citée définit bien `acteur` (ou `test_scrutin`). Après un déplacement de code, recaler les numéros :

    python3 -m tests.test_docs --corriger

python3 -m unittest discover tests
"""

import re
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOCS = RACINE / "docs"
# [`nom()`](chemin.py#L12) ou [nom](chemin.py#L12) ; le nom peut être qualifié (Classe.methode)
LIEN = re.compile(r"\[`?([A-Za-z_][\w.]*)(?:\(\))?`?\]\(((?:\.\./)+(?:src|tests)/[^)#]+\.py)#L(\d+)\)")


def definition(chemin: Path, nom: str) -> int | None:
    """Ligne (1-indexée) où `nom` est défini (`def nom`, `class nom`, ou `NOM =` au niveau module)."""
    dernier = nom.rsplit(".", 1)[-1]
    motif = re.compile(rf"^\s*(?:def|class)\s+{re.escape(dernier)}\b|^{re.escape(dernier)}\s*[:=]")
    for i, ligne in enumerate(chemin.read_text(encoding="utf-8").splitlines(), 1):
        if motif.search(ligne):
            return i
    return None


def liens():
    for doc in sorted(DOCS.rglob("*.md")):
        for m in LIEN.finditer(doc.read_text(encoding="utf-8")):
            yield doc, m


def corriger():
    for doc in sorted(DOCS.rglob("*.md")):
        texte = doc.read_text(encoding="utf-8")

        def recaler(m):
            cible = (doc.parent / m.group(2)).resolve()
            ligne = definition(cible, m.group(1)) if cible.exists() else None
            return m.group(0) if ligne is None else m.group(0).replace(f"#L{m.group(3)})", f"#L{ligne})")
        nouveau = LIEN.sub(recaler, texte)
        if nouveau != texte:
            doc.write_text(nouveau, encoding="utf-8")
            print(f"recalé : {doc.relative_to(RACINE)}")


class LiensVersLeCode(unittest.TestCase):
    def test_il_y_a_des_liens(self):
        self.assertGreater(sum(1 for _ in liens()), 50)

    def test_chaque_lien_pointe_sur_sa_definition(self):
        erreurs = []
        for doc, m in liens():
            nom, chemin, ligne = m.group(1), (doc.parent / m.group(2)).resolve(), int(m.group(3))
            if not chemin.exists():
                erreurs.append(f"{doc.name} : {m.group(2)} n'existe pas")
                continue
            attendue = definition(chemin, nom)
            if attendue is None:
                erreurs.append(f"{doc.name} : {nom} introuvable dans {m.group(2)}")
            elif attendue != ligne:
                erreurs.append(f"{doc.name} : {nom} est ligne {attendue}, pas {ligne} (python3 -m tests.test_docs --corriger)")
        self.assertEqual(erreurs, [])


if __name__ == "__main__":
    if "--corriger" in sys.argv:
        corriger()
    else:
        unittest.main()
