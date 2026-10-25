"""Mises au point des scrutins AN (« voulait voter… ») : un fait distinct, qui ne modifie jamais
le vote enregistré. Extrait réel condensé : scrutins.json.zip › json/VTANR5L17V1992.json.

python3 -m unittest discover tests
"""

import json
import unittest

from src.adaptateurs.sources.an import scrutins
from src.chargement import Document
from src.domaine.objets import Dependants

VOTANT = lambda pa, pm, place, delegation="false": {"acteurRef": pa, "mandatRef": pm, "parDelegation": delegation,
                                                     "numPlace": place}
# Tel que publié : listes de `null` pour les catégories vides, objet seul quand un seul votant.
V1992 = {"scrutin": {
    "uid": "VTANR5L17V1992", "numero": "1992", "legislature": "17", "dateScrutin": "2025-05-22",
    "seanceRef": "RUANR5L17S2025IDS29397",
    "titre": "l'amendement n° 52 de M. Hetzel et les amendements identiques suivants de suppression de l'article 7 "
             "de la proposition de loi relative au droit à l'aide à mourir (première lecture).",
    "typeVote": {"codeTypeVote": "SPO", "libelleTypeVote": "scrutin public ordinaire"},
    "sort": {"code": "rejeté"}, "objet": {"dossierLegislatif": None},
    "syntheseVote": {"nombreVotants": "151", "decompte": {"nonVotants": "1", "pour": "56", "contre": "94",
                                                           "abstentions": "1"}},
    "ventilationVotes": {"organe": {"groupes": {"groupe": [{
        "organeRef": "PO845425", "nombreMembresGroupe": "47",
        "vote": {"decompteVoix": {"pour": "0", "contre": "1", "abstentions": "0"},
                 "decompteNominatif": {"contres": {"votant": VOTANT("PA793342", "PM842345", "204", "true")}}}}]}}},
    "miseAuPoint": {
        "nonVotants": [None, None], "pours": None, "abstentions": [None, None], "nonVotantsVolontaires": [None, None],
        "contres": {"votant": VOTANT("PA721750", "PM843647", "374")},
        "dysfonctionnement": {"nonVotants": None, "pour": None, "abstentions": None,
                              "contre": {"votant": VOTANT("PA342384", "PM842771", "637")},
                              "nonVotantsVolontaires": {"votant": VOTANT("PA793342", "PM842345", "204")}}}}}


def analyser(s):
    return list(scrutins.scrutin(Document(scrutins.SCRUTINS, "json/x.json", json.dumps(s).encode()), {},
                                 lambda reunion, numeros, dossier=None: ([], [])))


def dependants(elements, table, nature=None):
    return next(e for e in elements if isinstance(e, Dependants) and e.table == table
                and (nature is None or e.parent.get("nature") == nature))


class MisesAuPoint(unittest.TestCase):
    def test_telles_que_publiees(self):
        m = dependants(analyser(V1992), "lien", "mise_au_point")
        self.assertEqual(m.parent["de_id"].id_source, "VTANR5L17V1992")
        self.assertEqual([(l["vers_id"].id_source, l["attributs"]["position"], l["attributs"]["cle_publiee"],
                           l["attributs"]["dysfonctionnement"]) for l in m.lignes],
                         [("PA721750", "contre", "contres", False), ("PA342384", "contre", "contre", True),
                          ("PA793342", "non_votant_volontaire", "nonVotantsVolontaires", True)])

    def test_vote_enregistre_inchange(self):
        """PA793342 a voté contre (par délégation) ; sa mise au point dit « non-votant volontaire » :
        le vote reste « contre ». Les auteurs de mises au point absents du décompte n'y entrent pas."""
        votes = dependants(analyser(V1992), "vote")
        self.assertEqual([(l["personne_id"].id_source, l["position"], l["par_delegation"]) for l in votes.lignes],
                         [("PA793342", "contre", True)])

    def test_sans_mise_au_point_liste_vide(self):
        """Une relecture sans mise au point remplace les anciennes par rien (liens en bloc)."""
        sans = {"scrutin": {**V1992["scrutin"], "miseAuPoint": None}}
        self.assertEqual(dependants(analyser(sans), "lien", "mise_au_point").lignes, [])

    def test_une_ligne_par_personne(self):
        """Clé du lien (scrutin, nature, personne) : une personne citée deux fois garde sa première mention."""
        s = json.loads(json.dumps(V1992))
        s["scrutin"]["miseAuPoint"]["pours"] = {"votant": VOTANT("PA721750", "PM843647", "374")}
        lignes = dependants(analyser(s), "lien", "mise_au_point").lignes
        self.assertEqual([(l["vers_id"].id_source, l["attributs"]["position"]) for l in lignes][:1], [("PA721750", "pour")])
        self.assertEqual(len(lignes), 3)


if __name__ == "__main__":
    unittest.main()
