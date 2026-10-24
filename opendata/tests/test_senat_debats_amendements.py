"""Interventions de séance du Sénat reliées aux amendements qu'elles citent (extraits réels condensés).

Comptes rendus `cri.zip` des 29/06/2026 (pjl25-689, CMP ppl23-431), 30/01/2025 (haie, ancre
erronée), 17/10/2024 (mise au point) et 25/11/2024 (PLF 2025) ; lignes AMELI et DOSLEG réelles.

python3 -m unittest tests.test_senat_debats_amendements
"""

import unittest

from src.chargement import Document
from src.domaine import IdentiteNative, Systeme
from src.domaine.objets import CasRevue, Dependants, Objet
from src.adaptateurs.sources.senat import debats
from src.adaptateurs.sources.senat.amendements_cites import Index, ancre, numeros_cites

ENTETE = """<?xml version="1.0" encoding="ISO-8859-1"?>
<cri:cri xmlns:cri="http://senat.fr/schemas/thb/cri" xmlns="http://www.w3.org/1999/xhtml"><html><body>"""
FIN = "</body></html></cri:cri>"


def cri(corps: str) -> bytes:
    return (ENTETE + corps + FIN).encode("iso-8859-1")


def president(id_, texte, mat="14111D", nom="Alain MARC"):
    return (f'<div><cri:intervenant id="{id_}" parid="par_{id_}" mat="{mat}" nom="{nom}" civ="M." '
            f'qua="pr&#233;sident de s&#233;ance" type="1"><p><span class="orateur_nom"><cri:orateurnom><a>'
            f'<span>M.&#160;le pr&#233;sident.</span></a></cri:orateurnom></span> {texte}</p></cri:intervenant></div>')


# d20260629 : la CMP du textile (ppl23-431, texte 766), puis la protection agricole (pjl25-689)
JOUR = cri(
    '<cri:titreS1 parid="par_17" libelle="Impact environnemental de l&#8217;industrie textile" type="sect_pdl" '
    'lecassidt="110201" signet="ppl23-431"><p>Impact</p></cri:titreS1>'
    + president("int_11", "L&#8217;amendement n&#176;&#160;2, pr&#233;sent&#233; par Mme&#160;Valente Le Hir, est "
                "ainsi libell&#233;&#160;:</p><cri:amendements><a name=\"ameli_amendement_cra_contenu\"> </a>"
                "<p class=\"amendements\">I. &#8211; &#192; l&#8217;alin&#233;a&#160;2, substituer aux mots&#160;:"
                "</p></cri:amendements><p>La parole est &#224; Mme&#160;Sylvie Valente Le Hir.")
    + '<div><cri:intervenant id="int_12" parid="par_262" mat="21061D" nom="Sylvie VALENTE LE HIR" civ="Mme" qua="" '
      'type="1"><a name="amd_2025_766_2"> </a><a name="ameli_amendement_cra_objet"> </a><p><span class="orateur_nom">'
      '<cri:orateurnom><a><span>Mme&#160;Sylvie Valente Le Hir.</span></a></cri:orateurnom></span> Cet amendement, '
      'qui a &#233;t&#233; adopt&#233; en des termes identiques&#8230;</p></cri:intervenant></div>'
    + '<cri:titreS1 parid="par_1037" libelle="Protection et souverainet&#233; agricoles" type="sect_pdl" '
      'lecassidt="109821" signet="pjl25-689"><p>Protection</p></cri:titreS1>'
    + '<cri:mentionarticle parid="par_1400" type="1" num="Article 1er" info=""><p>Article 1er</p></cri:mentionarticle>'
    + '<div><cri:intervenant id="int_328" parid="par_1468" mat="19563B" nom="Franck MENONVILLE" civ="M." qua="" '
      'type="1"><p><span class="orateur_nom"><cri:orateurnom><a><span>M.&#160;Franck Menonville, </span></a>'
      '</cri:orateurnom></span><span class="orateur_qualite"><cri:orateurqualite>rapporteur.</cri:orateurqualite>'
      '</span> Les amendements identiques n<sup>os</sup>&#160;272 rectifi&#233; et&#160;743, ainsi que '
      'l&#8217;amendement n<sup>os</sup>&#160;448 tendent &#224; garantir l&#8217;articulation des projets '
      'd&#8217;avenir agricole avec les documents strat&#233;giques locaux.</p></cri:intervenant></div>'
    + '<cri:titreS1 parid="par_1654" libelle="PR&#201;SIDENCE DE Mme&#160;Sylvie Robert" type="sect_autredivers">'
      '<p>PR&#201;SIDENCE</p></cri:titreS1>'
    + president("int_331", "Je mets aux voix les amendements identiques n<sup>os&#160;</sup>272 rectifi&#233; et 743.")
    + president("int_333", "Je mets aux voix l&#8217;amendement n&#176;&#160;448.</p><p><span><cri:infoentreparentheses>"
                "(L&#8217;amendement n&#8217;est pas adopt&#233;.)</cri:infoentreparentheses></span>"))

# Lignes réelles : txt_ameli (session de dépôt, numéro, dossier), amd (id, texte, numéro), DOSLEG texte.
TEXTES = [
    {"id": "107086", "ann": "2025", "num": "689", "signet": "pjl25-689", "charge": True},    # commission
    {"id": "107100", "ann": "2025", "num": "763", "signet": "pjl25-689", "charge": True},    # séance
    {"id": "107102", "ann": "2025", "num": "766", "signet": "ppl23-431", "charge": True},    # CMP
    {"id": "106254", "ann": "2022", "num": "839", "signet": "ppl22-839", "charge": False},   # haie, déposé en 2023
    {"id": "106314", "ann": "2024", "num": "189", "signet": "ppl22-839", "charge": True},
    {"id": "106324", "ann": "2024", "num": "254", "signet": "ppl23-735", "charge": True},
    {"id": "106201", "ann": "2024", "num": "143", "signet": "pjlf2025", "charge": True},    # PLF 2025
    {"id": "106243", "ann": "2024", "num": "143", "signet": None, "charge": False},         # une mission
    {"id": "106462", "ann": "2024", "num": "370 rect.", "signet": "ppl24-199", "charge": True},
]
AMENDEMENTS = [
    {"id": "1325635", "txtid": "107086", "num": "COM-448"}, {"id": "1327464", "txtid": "107100", "num": "448"},
    {"id": "1328968", "txtid": "107100", "num": "272"}, {"id": "1327708", "txtid": "107100", "num": "743"},
    {"id": "1328518", "txtid": "107102", "num": "2"},
    {"id": "1284526", "txtid": "106314", "num": "3"}, {"id": "1285544", "txtid": "106314", "num": "8"},
    {"id": "1285359", "txtid": "106324", "num": "3"}, {"id": "1285274", "txtid": "106324", "num": "8"},
    {"id": "1279819", "txtid": "106201", "num": "I-2222"}, {"id": "1275719", "txtid": "106201", "num": "I-655"},
    {"id": "1279694", "txtid": "106243", "num": "II-36"},
]
DOSLEG = [{"lecassidt": l, "sesann": a, "texnum": n} for l, a, n in (
    ("109821", "2025", "689"), ("109821", "2025", "763"), ("109821", "2025", "152"),
    ("110201", "2025", "766"), ("110201", "2025", "150"), ("110201", "0", "321"),
    ("96040", "2022", "839"), ("96040", "2024", "189"), ("96040", "2024", "43"),
    ("99367", "2024", "143"), ("99367", "2024", "39"), ("99631", "2024", "370"))]
INDEX = Index(TEXTES, AMENDEMENTS, DOSLEG)


def amendement(u):
    return IdentiteNative(Systeme.SENAT, "amendement", u)


def analyser(octets, jour):
    elements = list(debats.seance(Document(debats.CRI, f"cri/d{jour}.xml", octets), {}, INDEX))
    interventions = {e.identite.id_source.split("#")[1]: e.valeurs for e in elements
                     if isinstance(e, Objet) and e.type == "intervention"}
    liens = {e.parent["de_id"].id_source.split("#")[1]: [l["vers_id"].id_source for l in e.lignes]
             for e in elements if isinstance(e, Dependants) and e.parent.get("nature") == "amendement"}
    return interventions, liens, [e for e in elements if isinstance(e, CasRevue)]


class Citations(unittest.TestCase):
    def test_numeros_cites(self):
        self.assertEqual(numeros_cites("Les amendements identiques nos 272 rectifié et 743, ainsi que "
                                       "l’amendement nos 448 tendent"), ["272", "743", "448"])
        self.assertEqual(numeros_cites("L’amendement n° 183 rectifié quater de Vincent Louault"), ["183"])
        self.assertEqual(numeros_cites("Le sous-amendement n° I-2222, présenté par M. Iacovelli"), ["I-2222"])
        self.assertEqual(numeros_cites("lors du scrutin n° 15 sur l’article 7"), [])

    def test_ancre(self):
        self.assertEqual(ancre("amd_2025_766_2"), ("2025", "766", "2"))
        self.assertEqual(ancre("amd_2024_370_10_rect_1"), ("2024", "370", "10"))
        self.assertEqual(ancre("amd_2024_143_II_36"), ("2024", "143", "II-36"))
        self.assertIsNone(ancre("ameli_amendement_cra_objet"))


class Seance(unittest.TestCase):
    def test_numero_cite_resolu_dans_la_lecture(self):
        interventions, liens, cas = analyser(JOUR, "20260629")
        # 448 existe dans le texte de la commission (COM-448) et dans celui de la séance : 448 seul
        self.assertEqual(interventions["int_333"]["amendements"], "448")
        self.assertEqual(interventions["int_333"]["amendement_id"], amendement("1327464"))
        self.assertEqual(cas, [])

    def test_plusieurs_amendements_un_lien_chacun(self):
        interventions, liens, _ = analyser(JOUR, "20260629")
        self.assertIsNone(interventions["int_328"]["amendement_id"])
        self.assertEqual(liens["int_328"], ["1328968", "1327708", "1327464"])
        # après « PRÉSIDENCE DE Mme Sylvie Robert », la discussion du même texte continue
        self.assertEqual(liens["int_331"], ["1328968", "1327708"])

    def test_ancre_de_l_intervention(self):
        interventions, _, _ = analyser(JOUR, "20260629")
        self.assertEqual(interventions["int_12"]["amendement_id"], amendement("1328518"))
        # le dispositif lu par le président n'est pas une citation ; sa phrase d'annonce, oui
        self.assertEqual(interventions["int_11"]["amendement_id"], amendement("1328518"))

    def test_ancre_hors_de_la_lecture_en_revue(self):
        # d20250130 : débat sur la haie (texte 189) ; l'ancre « amd_2024_254_3 » désigne le texte 254
        # d'un autre dossier. Deux références en désaccord : revue, et le n° 8 cité devient ambigu.
        octets = cri(
            '<cri:titreS1 parid="par_343" libelle="Gestion durable et reconqu&#234;te de la haie" type="sect_pdl" '
            'lecassidt="96040" signet="ppl22-839"><p>Haie</p></cri:titreS1>'
            '<cri:titreS1 parid="par_482" libelle="PR&#201;SIDENCE DE Mme&#160;Sylvie Robert" type="sect_autredivers">'
            '<p>PR&#201;SIDENCE</p></cri:titreS1>'
            + president("int_124", "Quel est l&#8217;avis du Gouvernement sur l&#8217;amendement n&#176;&#160;8&#160;?",
                        "14229S", "Sylvie ROBERT")
            + '<div><cri:intervenant id="int_135" parid="par_696" mat="20092G" nom="Daniel SALMON" civ="M." qua="" '
              'type="1"><a name="amd_2024_254_3"> </a><p><span class="orateur_nom"><cri:orateurnom><a><span>'
              'M.&#160;Daniel Salmon.</span></a></cri:orateurnom></span> Cet amendement tend &#224; ajouter un objectif '
              'selon nous essentiel</p></cri:intervenant></div>')
        interventions, liens, cas = analyser(octets, "20250130")
        self.assertIsNone(interventions["int_124"]["amendement_id"])
        self.assertIsNone(interventions["int_135"]["amendement_id"])
        par_cle = {c.cle: c for c in cas}
        huit = par_cle["amendement_cite:SENAT:d20250130:lecture:96040:8"]
        self.assertEqual((huit.type, huit.champ, sorted(c.identite.id_source for c in huit.candidats)),
                         ("amendement_ambigu", "amendement_id", ["1285274", "1285544"]))
        trois = par_cle["amendement_cite:SENAT:d20250130:texte:2024-254:3"]
        self.assertEqual(sorted(c.identite.id_source for c in trois.candidats), ["1284526", "1285359"])
        self.assertIn("hors de la lecture", trois.contexte["motif"])

    def test_hors_lecture_introuvable(self):
        # d20241017 : mise au point sur le vote d'un amendement d'une autre séance
        octets = cri(
            '<cri:titreS1 parid="par_929" libelle="Mise au point au sujet d&#8217;un vote" type="sect_autredivers">'
            '<p>Mise au point</p></cri:titreS1>'
            + president("int_216", "Monsieur le pr&#233;sident, ce matin, lors du scrutin n&#176;&#160;15 sur "
                        "l&#8217;amendement n&#176;&#160;2 rectifi&#233; <i>quinquies</i>, pr&#233;sent&#233; &#224; "
                        "l&#8217;article&#160;7"))
        interventions, _, cas = analyser(octets, "20241017")
        self.assertIsNone(interventions["int_216"]["amendement_id"])
        self.assertEqual([(c.type, c.nature, c.candidats, [x[1].id_source for x in c.cibles]) for c in cas],
                         [("amendement_introuvable", "constat", (), ["d20241017#int_216"])])

    def test_plf_dispositif_et_mission_non_chargee(self):
        # d20241125 : le sous-amendement I-2222 cite « Amendement n° 655 » dans son dispositif
        octets = cri(
            '<cri:titreS1 parid="par_5000" libelle="Loi de finances pour 2025" type="sect_pdl" lecassidt="99367" '
            'signet="pjlf2025"><p>PLF</p></cri:titreS1>'
            + president("int_527", "Le sous-amendement n&#176;&#160;I-2222, pr&#233;sent&#233; par M.&#160;Iacovelli, "
                        "est ainsi libell&#233;&#160;:</p><cri:amendements><p class=\"amendements\">Amendement "
                        "n&#176;&#160;655</p></cri:amendements><p>", "19301E", "Dominique TH&#201;OPHILE")
        )
        interventions, _, cas = analyser(octets, "20241125")
        self.assertEqual(interventions["int_527"]["amendements"], "I-2222")
        self.assertEqual(interventions["int_527"]["amendement_id"], amendement("1279819"))
        self.assertEqual(cas, [])
        # d20241202 : une mission de la seconde partie, texte AMELI sans dossier, non chargé
        octets = cri(
            '<cri:titreS1 parid="par_3255" libelle="Loi de finances pour 2025" type="sect_pdl" lecassidt="99367" '
            'signet="pjlf2025"><p>PLF</p></cri:titreS1>'
            '<div><cri:intervenant id="int_412" parid="par_3499" mat="14329V" nom="Anne CHAIN-LARCH&#201;" civ="Mme" '
            'qua="pr&#233;sident de s&#233;ance" type="1"><a name="amd_2024_143_II_36"> </a><p> L&#8217;amendement '
            'n&#176;&#160;II-36 est pr&#233;sent&#233; par M.&#160;Delahaye, au nom de la commission des finances.</p>'
            '</cri:intervenant></div>')
        interventions, _, cas = analyser(octets, "20241202")
        self.assertEqual((interventions["int_412"]["amendements"], interventions["int_412"]["amendement_id"]),
                         ("II-36", None))
        self.assertEqual(cas, [])                  # connu d'AMELI : ni lien, ni revue

    def test_texte_rectifie(self):
        # AMELI numérote « 370 rect. » le texte que l'ancre et DOSLEG appellent 370
        self.assertEqual(INDEX.en_discussion("ppl24-199", "99631"), (["106462"], []))


if __name__ == "__main__":
    unittest.main()
