"""Registre des objets de revue : chaque type de cas a son objet, chaque objet est complet, et les
modes par défaut sont ceux décidés le 31/10/2026. python3 -m unittest discover tests
"""

import unittest

from src import revue
from src.banc.objets import IDENTITES, NATURES, OBJETS, Mode, objet, objet_du_cas


class RegistreDesObjets(unittest.TestCase):
    def test_un_objet_par_type_de_cas(self):
        self.assertEqual({k for k in OBJETS if k.startswith("rapprochement.")},
                         {f"rapprochement.{t}" for t in revue.TYPES})
        self.assertLessEqual(IDENTITES, set(revue.TYPES))

    def test_modes_par_defaut(self):
        self.assertEqual(objet("synthese.expose_amendement").mode_defaut, Mode.ONLY_ONE)
        self.assertNotEqual(objet("synthese.resume_dossier").mode_defaut, Mode.ONLY_ONE)   # textes : plus compliqués
        self.assertEqual(objet("rapprochement.elu_local").mode_defaut, Mode.MAJORITY)
        self.assertEqual(objet("rapprochement.amendement_introuvable").mode_defaut, Mode.ONLY_ONE)

    def test_objets_complets(self):
        for o in OBJETS.values():
            with self.subTest(o.cle):
                self.assertIn(o.source, ("affirmation", "cas_revue"))
                self.assertTrue(o.champs and o.reponses and o.titre)
                self.assertTrue({c.nature for c in o.champs} <= set(NATURES))
                self.assertEqual(len({r.cle for r in o.reponses}), len(o.reponses))
                self.assertNotIn("je_ne_sais_pas", {r.cle for r in o.reponses})   # un doute va dans la note
                if o.source == "affirmation":
                    self.assertTrue(o.predicat and o.generation)
                    self.assertIn("genere", {c.nature for c in o.champs})

    def test_type_de_cas_inconnu_reste_relisible(self):
        o = objet_du_cas("nouveau_type")
        self.assertEqual((o.cle, o.mode_defaut, o.source), ("rapprochement.nouveau_type", Mode.ONLY_ONE, "cas_revue"))
        with self.assertRaises(KeyError):
            objet("synthese.inconnue")


if __name__ == "__main__":
    unittest.main()
