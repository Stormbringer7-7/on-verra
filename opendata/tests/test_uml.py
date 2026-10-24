"""Les diagrammes de docs/uml.md sont ceux du schéma migré : une migration qui ajoute une table ou
une colonne sans régénérer le document fait échouer ce test.

    DATABASE_URL=postgres://…/civictrace_essais python -m src uml     # régénère les blocs
"""

import unittest

from tests.test_postgres import CX, remettre_a_zero


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class DiagrammesDeLaBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        remettre_a_zero(CX)

    def test_toute_table_a_un_domaine(self):
        from src.uml import sans_domaine, structure
        self.assertEqual(sans_domaine(structure(CX)), [], "ajouter ces tables à DOMAINES dans src/uml.py")

    def test_le_document_suit_le_schema(self):
        from src.uml import DOC, regenerer, structure
        texte = DOC.read_text(encoding="utf-8")
        self.assertEqual(regenerer(texte, structure(CX)), texte,
                         "docs/uml.md n'est plus à jour : DATABASE_URL=…/civictrace_essais python -m src uml")

    def test_une_cle_etrangere_devient_une_relation(self):
        from src.uml import diagramme, structure
        votes = diagramme(structure(CX), "votes")
        self.assertIn('vote }o--|| personne : "personne_id"', votes)       # obligatoire
        self.assertIn('scrutin }o--o| amendement : "amendement_id"', votes)  # facultatif
        self.assertNotIn(": \"entite_id\"", votes)                           # racine commune non tracée


if __name__ == "__main__":
    unittest.main()
