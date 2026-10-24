"""Adaptateurs canoniques du Sénat sur des documents minimaux.

python3 -m unittest discover tests
"""

import unittest

from src.chargement import Document
from src.domaine import IdentiteNative, Systeme
from src.domaine.objets import CasRevue, Objet
from src.adaptateurs.sources.senat import debats, dossiers
from src.adaptateurs.sources.senat.commun import document_ligne
from src.domaine.objets import CasRevue

CRI = """<?xml version="1.0" encoding="ISO-8859-1"?>
<cri:cri xmlns:cri="http://senat.fr/schemas/thb/cri" xmlns="http://www.w3.org/1999/xhtml"><html><head><link rel="stylesheet" href="x.css">
<body>
<cri:titreS1 parid="par_2" libelle="Mise au point au sujet d'un vote" type="sect_autredivers"><p>Mise au point</p></cri:titreS1>
<div><cri:intervenant id="int_1" parid="par_4" mat="19683J" nom="Bernard JOMIER" civ="M." qua="pr&#233;sident de s&#233;ance" type="1">
<p id="par_4"><span class="orateur_nom"><cri:orateurnom><a><span>M.&#160;le pr&#233;sident.</span></a></cri:orateurnom></span> La s&#233;ance est ouverte.</p>
<p id="par_5"><span><cri:infoentreparentheses>(Dix heures trente.)</cri:infoentreparentheses></span></p>
</cri:intervenant></div>
<cri:pdl lecassidt="1"><cri:titreS1 parid="par_433" libelle="Acc&#232;s &#224; un panier" type="sect_pdl" signet="ppl25-940"><p>Titre</p></cri:titreS1></cri:pdl>
<cri:mentionarticle parid="par_710" type="1" num="Article 1er" info=""><p>Article 1</p></cri:mentionarticle>
<div><cri:intervenant id="int_2" parid="par_8" mat="20872D" nom="Mathieu LEF&#200;VRE" civ="M." qua="ministre d&#233;l&#233;gu&#233;. " type="2">
<p id="par_8"><span><cri:orateurnom><a><span>M.&#160;Mathieu Lef&#232;vre,</span></a></cri:orateurnom></span> Avis d&#233;favorable.</p>
</cri:intervenant></div>
</body></head></html></cri:cri>""".encode("iso-8859-1")


class Debats(unittest.TestCase):
    def analyser(self):
        return list(debats.seance(Document(debats.CRI, "cri/d20261022.xml", CRI)))

    def test_interventions(self):
        res = [e for e in self.analyser() if isinstance(e, Objet) and e.type == "intervention"]
        premier, second = (r.valeurs for r in res)
        self.assertEqual(premier["orateur_id"], IdentiteNative(Systeme.SENAT, "senateur", "19683J"))
        self.assertEqual(premier["orateur_libelle"], "M. le président")
        self.assertEqual(premier["texte"], "La séance est ouverte.\n(Dix heures trente.)")
        self.assertIsNone(premier["dossier_id"])
        self.assertEqual(second["dossier_id"], IdentiteNative(Systeme.SENAT, "dossier", "ppl25-940"))
        self.assertEqual((second["article"], second["qualite"]), ("Article 1er", "ministre délégué"))
        self.assertEqual(second["orateur_id"], IdentiteNative(Systeme.SENAT, "membre_gouvernement", "20872D"))
        self.assertEqual(res[1].identite.id_source, "d20261022#int_2")

    def test_membre_du_gouvernement_en_revue(self):
        elements = list(debats.seance(Document(debats.CRI, "cri/d20261022.xml", CRI), {"mathieu lefevre": [
            {"acteur": "PA795386", "libelle": "Mathieu Lefèvre", "depute": True, "membre_gouvernement": True}]}))
        self.assertFalse([e for e in elements if isinstance(e, Objet) and e.type == "personne"])   # pas créée d'office
        cas = [e for e in elements if isinstance(e, CasRevue)][0]
        self.assertEqual((cas.type, cas.nature, cas.sujet[1].id_source, [c.identite.id_source for c in cas.candidats]),
                         ("identite_membre_gouvernement", "identite", "20872D", ["PA795386"]))
        self.assertEqual(cas.contexte["si_aucun"]["valeurs"]["nom"], "Mathieu LEFÈVRE")

    def test_reunion_et_compte_rendu(self):
        objets = {e.type: e for e in self.analyser() if isinstance(e, Objet) and e.type in ("reunion", "document")}
        self.assertEqual(objets["reunion"].valeurs["chambre"], "SENAT")
        self.assertEqual(str(objets["document"].valeurs["date"]), "2026-10-22")


class Dump(unittest.TestCase):
    def test_apostrophe_windows_1252_restituee(self):
        # scrutin 2025-325 : « à l\x92article 5 quater A » dans le dump DOSLEG
        import tempfile
        import zipfile
        from pathlib import Path
        from src.adaptateurs.sources.senat.commun import table_dump
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "dosleg.zip"
            with zipfile.ZipFile(chemin, "w") as z:
                z.writestr("dosleg.sql", "SET client_encoding = 'UTF8';\nCOPY scr (scrnum, scrint) FROM stdin;\n"
                                         "325\tà l\u0092article 5\n\\.\n")
            (l,) = table_dump(chemin, "dosleg.sql", "scr")
        self.assertEqual(l["scrint"], "à l’article 5")


    def test_textes_sans_session_ignores(self):
        import tempfile
        import zipfile
        from pathlib import Path
        from src.adaptateurs.sources.senat import textes
        tables = {"loi": ("loicod, signet", ["1\tpjl25-689"]), "lecture": ("lecidt, loicod", ["10\t1"]),
                  "lecass": ("lecassidt, lecidt", ["100\t10"]), "oritxt": ("oritxtcod, oritxtlib", ["0\tdéposé au Sénat"]),
                  "texte": ("texurl, sesann, lecassidt, oritxtcod",
                            ["pjl25-689.html\t2025\t100\t0", "pjl98-001.html\t\\N\t100\t0"])}
        sql = "SET client_encoding = 'UTF8';\n" + "".join(
            f"COPY {t} ({c}) FROM stdin;\n" + "".join(l + "\n" for l in ls) + "\\.\n" for t, (c, ls) in tables.items())
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "dosleg.zip"
            with zipfile.ZipFile(chemin, "w") as z:
                z.writestr("dosleg.sql", sql)
            refs = list(textes.references(chemin))
        self.assertEqual([(r[0], r[2], r[3]) for r in refs], [("pjl25-689", "pjl25-689", "déposé au Sénat")])


class Dossiers(unittest.TestCase):
    def test_titre(self):
        d = document_ligne(dossiers.DOSLEG, "loi", "1", {"loicod": "1", "signet": "ppl25-940", "loient": "Proposition de loi",
                                                         "loitit": "visant à X ", "motclef": None, "proaccdat": "2026-01-01"})
        o = next(dossiers.dossier(d))
        self.assertEqual((o.valeurs["titre"], o.valeurs["procedure_acceleree"]), ("Proposition de loi visant à X", True))


if __name__ == "__main__":
    unittest.main()


class Travaux(unittest.TestCase):
    from src.adaptateurs.sources.senat import travaux as module

    def referentiel(self):
        ref = self.module.Referentiel.__new__(self.module.Referentiel)
        ref.textes = {"T1": {"doslegsignet": "ppl25-940"}}
        ref.subdivisions, ref.sorts = {"S1": "Article 3"}, {"A": "Adopté", "J": "Rejeté"}
        ref.divisions, ref.signets, ref.delegations, ref.examens = {}, set(), set(), None   # cf. test_amendements_articles
        ref.matricules = {"E1": "19683J", "E2": "20126Y"}
        ref.auteurs = {"A1": [{"senid": "E2", "rng": "2"}, {"senid": "E1", "rng": "1"}]}
        ref.dossier_de_seance = {"31500": "ppl25-940"}
        ref.amendements_de_scrutin = {("2026", "8"): ["12"]}
        ref.votes = {("2026", "8"): [{"senmat": "19683J", "posvotcod": "1", "stavotidt": "0", "senmatdel": None},
                                     {"senmat": "20126Y", "posvotcod": "2", "stavotidt": "12", "senmatdel": None}]}
        ref.statuts = {"12": "Déport"}
        ref.amendement_par_numero = {}
        ref.indexer([{"id": "A1", "txtid": "T1", "num": "12 rect."}])
        return ref

    def test_amendement_avis_auteurs(self):
        ref = self.referentiel()
        a = {"id": "A1", "txtid": "T1", "num": "12 rect.", "subid": "S1", "sorid": "A", "avcid": "F", "avgid": "D",
             "datdep": "2026-10-01 10:00:00", "dis": "<body><p>Alin&#233;a 3</p></body>", "obj": None}
        elements = list(self.module.amendement(document_ligne(self.module.AMELI, "amd", "A1", a), ref))
        v = elements[0].valeurs
        self.assertEqual((v["dossier_id"].id_source, v["division"], v["sort"], v["dispositif"]),
                         ("ppl25-940", "Article 3", "adopte", "<body><p>Alinéa 3</p></body>"))
        self.assertEqual({l["emetteur"]: l["avis"] for l in elements[1].lignes},
                         {"commission": "favorable", "gouvernement": "defavorable"})
        self.assertEqual([l["vers_id"].id_source for l in elements[2].lignes], ["19683J"])     # rang 1
        self.assertEqual([l["vers_id"].id_source for l in elements[3].lignes], ["20126Y"])

    def test_scrutin_dossier_amendement_votes(self):
        ref = self.referentiel()
        s = {"sesann": "2026", "scrnum": "8", "code": "31500", "scrint": "sur l'amendement n° 12", "scrdat": "2026-10-19 00:00:00",
             "scrpou": "144", "scrcon": "184", "scrvot": "343"}
        elements = list(self.module.scrutin(document_ligne(self.module.DOSLEG, "scr", "2026-8", s), ref))
        v = elements[0].valeurs
        self.assertEqual((v["dossier_id"].id_source, v["amendement_id"].id_source, v["nature"]),
                         ("ppl25-940", "A1", "amendement"))
        self.assertEqual(sorted((l["personne_id"].id_source, l["position"], l["cause"]) for l in elements[1].lignes),
                         [("19683J", "pour", None), ("20126Y", "contre", "Déport")])

    def test_numero_ambigu_en_revue(self):
        ref = self.referentiel()
        ref.indexer([{"id": "A2", "txtid": "T1", "num": "12"}])     # même numéro dans une autre lecture
        s = {"sesann": "2026", "scrnum": "8", "code": "31500", "scrint": "x", "scrdat": "2026-10-19 00:00:00",
             "scrpou": "1", "scrcon": "2", "scrvot": "3"}
        elements = list(self.module.scrutin(document_ligne(self.module.DOSLEG, "scr", "2026-8", s), ref))
        self.assertIsNone(elements[0].valeurs["amendement_id"])
        cas = [e for e in elements if isinstance(e, CasRevue)][0]
        self.assertEqual((cas.type, len(cas.candidats)), ("amendement_ambigu", 2))


class EchappementsCopy(unittest.TestCase):
    """Format texte de COPY : « \\r », « \\n », « \\t », « \\\\ » décodés en un seul passage."""

    def test_dispositif_ameli_retour_chariot(self):
        # AMELI, amendement COM-154 (`amd.id` 1324544, pjl25-689 / DLR5L17N54085), début de `dis` tel
        # que dans le dump (LATIN1) : « </p>\r\n<p> » est un retour chariot et un saut de ligne échappés.
        import tempfile
        import zipfile
        from pathlib import Path
        from src.adaptateurs.sources.senat.commun import table_dump
        dis = ('<body><p style="text-align: justify;">I. &#8211; Alin&#233;as 21 et 22</p>\\r\\n'
               '<p style="text-align: justify;">Supprimer ces alin&#233;as.</p>\\r\\n')
        sql = ("SET client_encoding = 'LATIN1';\nCOPY amd (id, num, dis, obj) FROM stdin;\n"
               f"1324544\tCOM-154\t{dis}\t\\N\n\\.\n")
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "ameli.zip"
            with zipfile.ZipFile(chemin, "w") as z:
                z.writestr("var/opt/opendata/ameli.sql", sql.encode("latin-1"))
            (l,) = table_dump(chemin, "var/opt/opendata/ameli.sql", "amd")
        self.assertEqual(l["dis"], '<body><p style="text-align: justify;">I. &#8211; Alin&#233;as 21 et 22</p>\r\n'
                                   '<p style="text-align: justify;">Supprimer ces alin&#233;as.</p>\r\n')
        self.assertNotIn("\\", l["dis"])
        self.assertIsNone(l["obj"])

    def test_un_seul_passage(self):
        from src.adaptateurs.sources.senat.commun import valeur_copy
        self.assertEqual(valeur_copy("a\\\\nb"), "a\\nb")             # barre oblique échappée, puis « n »
        self.assertEqual(valeur_copy("a\\tb\\\\\\r"), "a\tb\\\r")
        self.assertEqual(valeur_copy("caf\\351"), "café")             # octal (dump LATIN1)
        self.assertEqual(valeur_copy("sans échappement"), "sans échappement")


# Compte rendu intégral du 21/07/2026 (`cri/d20260721.xml`, par_6406 à par_6411), tel que publié.
CRI_340 = """<p id="par_6406">Voici, compte tenu de l&#8217;ensemble des d&#233;l&#233;gations de vote accord&#233;es par les s&#233;nateurs aux groupes politiques et notifi&#233;es &#224; la pr&#233;sidence, le r&#233;sultat du scrutin n&#176;&#160;340&#160;:</p>

<cri:scrutin1><table class="scrutin1" summary="" width="70%"><tr>
<td class="scrutin1_0">Nombre de votants</td>
<td class="scrutin1_1">345</td></tr></table></cri:scrutin1>

<cri:scrutin1><table class="scrutin1" summary="" width="70%"><tr>
<td class="scrutin1_0">Nombre de suffrages exprim&#233;s</td>
<td class="scrutin1_1">325</td></tr></table></cri:scrutin1>

<cri:scrutin2><table class="scrutin2" summary="" width="70%"><tr>
<td class="scrutin2_0">Pour l&#8217;adoption</td>
<td class="scrutin2_1">214</td></tr></table></cri:scrutin2>

<cri:scrutin2><table class="scrutin2" summary="" width="70%"><tr>
<td class="scrutin2_0">Contre </td>
<td class="scrutin2_1">111</td></tr></table></cri:scrutin2>

<p id="par_6411">Le S&#233;nat a adopt&#233; d&#233;finitivement. <span class="info_entre_parentheses"><cri:infoentreparentheses>(Applaudissements</cri:infoentreparentheses></span> <span class="info_entre_parentheses"><cri:infoentreparentheses>sur les trav&#233;es du groupe Les&#160;R&#233;publicains.)</cri:infoentreparentheses></span></p>
"""


class Resultats(unittest.TestCase):
    from src.adaptateurs.sources.senat import resultats, travaux

    def test_annonce_du_scrutin_340(self):
        (a,) = self.resultats.annonces(CRI_340)
        self.assertEqual((a["numero"], a["sort"]), ("340", "adopté"))
        self.assertEqual(a["decompte"], {"votants": 345, "suffrages": 325, "pour": 214, "contre": 111})
        self.assertTrue(a["phrase"].startswith("Le Sénat a adopté définitivement."))

    def test_phrases_publiees(self):
        # phrases relevées dans les comptes rendus de 2024 à 2026 (jour, scrutin)
        for phrase, attendu in (("Le Sénat n’a pas adopté.", "rejeté"),                        # d20241010 n° 1
                                ("Le Sénat n'a pas adopté.", "rejeté"),                        # d20261020 n° 13
                                ("(La proposition de loi est adoptée.) – (Applaudissements", "adopté"),  # d20241016 n° 10
                                ("L'article 3 n'est pas adopté.", "rejeté"),                   # d20260611 n° 302
                                ("La proposition de loi n'est pas adoptée.", "rejeté"),        # d20260128 n° 169
                                ("Le projet de loi est définitivement adopté.", "adopté"),     # d20260507 n° 249
                                ("Le Sénat a approuvé la déclaration du Gouvernement.", "adopté"),  # d20241127 n° 91
                                ("Le Sénat a adopté à l'unanimité.", "adopté"),                # d20261020 n° 23
                                ("Mes chers collègues, je constate…", None)):
            self.assertEqual(self.resultats.sort(phrase), attendu, phrase)

    def lire(self, membres):
        import tempfile
        import zipfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "cri.zip"
            with zipfile.ZipFile(chemin, "w") as z:
                for nom, publie in membres:
                    z.writestr(zipfile.ZipInfo(nom, publie), CRI_340.encode("iso-8859-1"))
            return self.resultats.lire(chemin)

    def test_compte_rendu_date_avant_sa_seance_ecarte(self):
        # `cri/d20261204.xml` est daté du 06/01/2026 dans l'archive du Sénat
        index = self.lire([("cri/d20260721.xml", (2026, 7, 22, 5, 30, 0)), ("cri/d20261204.xml", (2026, 1, 6, 6, 8, 0))])
        self.assertEqual(list(index), [("2026-07-21", "340")])

    def scr_340(self, annonces):
        # DOSLEG `scr`, session 2025, scrutin 340, tel que dans le dump
        s = {"sesann": "2025", "scrnum": "340", "code": "31420",
             "scrint": "sur l'ensemble du projet de loi d'urgence pour la protection et la souveraineté agricoles",
             "scrdat": "2026-07-21 00:00:00", "scrpou": "214", "scrcon": "111", "scrvot": "345", "scrsuf": "325",
             "scrmaj": "0", "soslib": None, "resultat_seance": annonces}
        ref = Travaux().referentiel()
        return list(self.travaux.scrutin(document_ligne(self.travaux.DOSLEG, "scr", "2025-340", s), ref))

    def test_sort_du_scrutin_340(self):
        annonces = self.lire([("cri/d20260721.xml", (2026, 7, 22, 5, 30, 0))])[("2026-07-21", "340")]
        elements = self.scr_340(annonces)
        self.assertEqual((elements[0].valeurs["sort"], elements[0].valeurs["nature"]), ("adopté", "ensemble"))
        self.assertFalse([e for e in elements if isinstance(e, CasRevue)])

    def test_sans_annonce_pas_de_sort(self):
        elements = self.scr_340([])
        self.assertIsNone(elements[0].valeurs["sort"])                 # jamais déduit de 214 pour / 111 contre
        self.assertFalse([e for e in elements if isinstance(e, CasRevue)])

    def test_annonce_illisible_en_revue(self):
        elements = self.scr_340([{"compte_rendu": "d20260721", "phrase": "Le scrutin est annulé.", "sort": None}])
        self.assertIsNone(elements[0].valeurs["sort"])
        (cas,) = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual((cas.type, cas.nature), ("resultat_scrutin_illisible", "constat"))
