"""Étape `textes.modifications` : ordre de la navette, version précédente d'un article, écriture.

python3 -m unittest discover tests
"""

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from src.adaptateurs.sources import modifications as m
from src.adaptateurs.stockage import EntrepotMemoire
from src.chargement import ContexteCanon
from src.domaine import IdentiteNative, Systeme
from src.domaine.objets import CasRevue, Dependants
from src.identites import RegistreIdentites
from tests.test_diffs import APRES, AVANT, amendement

# Navette DOSLEG réelle du dossier pjl25-689 (souveraineté agricole), colonnes utiles seulement.
DOSLEG = """SET client_encoding = 'UTF8';
COPY typlec (typleccod, typleclib, typlecord) FROM stdin;
1\tPremière lecture\t1
4\tCommission mixte paritaire\t100
\\.
COPY loi (loicod, signet) FROM stdin;
82340\tpjl25-689
\\.
COPY lecture (lecidt, loicod, typleccod) FROM stdin;
96153\t82340\t1
98573\t82340\t4
\\.
COPY lecass (lecassidt, lecidt, codass, ordreass) FROM stdin;
108102\t96153\tA\t1
109821\t96153\tS\t2
111042\t98573\tI\t1
\\.
COPY oritxt (oritxtcod, oritxtlib, oriordre, oritxtado) FROM stdin;
4\tdéposé à l'Assemblée Nationale\t0\tN
30\tde la commission (AN)\t2\tO
5\tadopté par l'Assemblée nationale\t1\tO
0\ttransmis au Sénat\t0\tN
29\tde la commission\t2\tO
7\tmodifié par le Sénat\t1\tO
9\tadopté définitivement par le Sénat\t1\tD
\\.
COPY texte (texcod, oritxtcod, lecassidt, typurl, texurl, texnum, txtoritxtdat) FROM stdin;
168252\t4\t108102\tE\thttps://www.assemblee-nationale.fr/dyn/17/textes/l17b2632_projet-loi#\t2632\t2026-04-08 00:00:00
166997\t30\t108102\tE\thttps://www.assemblee-nationale.fr/dyn/17/textes/l17b2765_texte-adopte-commission#\t2765\t2026-05-07 00:00:00
166972\t5\t108102\tE\thttps://www.assemblee-nationale.fr/dyn/17/textes/l17t0295_texte-adopte-seance\t295\t2026-06-02 00:00:00
166995\t0\t109821\tI\tpjl25-689.html\t689\t2026-06-03 00:00:00
167598\t29\t109821\tI\tpjl25-763.html\t763\t2026-06-17 00:00:00
168597\t7\t109821\tI\ttas25-152.html\t152\t2026-07-02 00:00:00
168912\t29\t111042\tI\tpjl25-894.html\t894\t2026-07-16 00:00:00
169032\t5\t111042\tE\thttps://www.assemblee-nationale.fr/dyn/17/textes/l17t0337_texte-adopte-seance\t337\t2026-07-20 00:00:00
169614\t9\t111042\tI\ttas25-166.html\t166\t2026-07-21 00:00:00
\\.
"""

# Article 1er de pjl25-689 (Akoma Ntoso), condensé : le `content` du « 1° » vient après ses « a) ».
AKN = """<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"><bill><body>
<article eId="art_1er"><num>Article 1er</num>
<alinea eId="al_1"><content><p>Le code rural et de la pêche maritime est ainsi modifié :</p></content></alinea>
<alinea eId="al_2"><num>1°</num>
  <alinea eId="al_3"><num>a)</num><content><p><i>a)</i> Au début du premier alinéa, est ajoutée la mention : « I. – » ;</p></content></alinea>
  <content><p>1° L’article L. 611‑1‑1 est ainsi modifié :</p></content></alinea>
</article></body></bill></akomaNtoso>"""


def an(type_, uid):
    return IdentiteNative(Systeme.AN, type_, uid)


def suivi(numero):
    return IdentiteNative(Systeme.CIVICTRACE, "article_suivi", f"SENAT:dossier:ppl24-661#{numero}")


def version(uid, nature, articles):
    v = m.Version(an("version_texte", uid), "AN", nature, uid)
    v.articles = [m.Article(an("article", f"{uid}#{n}"), n, suivi(n), statut, texte) for n, statut, texte in articles]
    return v


class Navette(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.chemin = Path(self.dossier.name) / "dosleg.zip"
        with zipfile.ZipFile(self.chemin, "w") as z:
            z.writestr("dosleg.sql", DOSLEG)

    def tearDown(self):
        self.dossier.cleanup()

    def test_ordre_dosleg_exemple_reel(self):
        noeuds = m.ordonner(m.navettes_dosleg(self.chemin)["pjl25-689"])
        cles = [n.cle if isinstance(n.cle, str) else n.cle[1].rsplit("/", 1)[1][:8] for n in noeuds]
        self.assertEqual(cles, ["l17b2632", "l17b2765", "l17t0295", "pjl25-689", "pjl25-763", "tas25-152",
                                "pjl25-894", "l17t0337", "tas25-166"])
        par_cle = {c: n for c, n in zip(cles, noeuds)}
        self.assertTrue(par_cle["pjl25-894"].cmp)                     # texte de la CMP (lecture 4, commission)
        self.assertFalse(par_cle["l17t0337"].cmp)
        self.assertIsNone(par_cle["l17t0337"].incertain)              # même place que tas25-166, dates distinctes
        self.assertIn("renumérotés", par_cle["tas25-166"].incertain)  # adopté définitivement
        self.assertEqual(par_cle["tas25-152"].numero, "152")

    def test_uid_an_cite_par_dosleg(self):
        uids = {("B", 2632): "PRJLANR5L17B2632", ("BTC", 2765): "PRJLANR5L17BTC2765", ("BTA", 295): "PRJLANR5L17BTA0295"}
        url = "https://www.assemblee-nationale.fr/dyn/17/textes/l17b2765_texte-adopte-commission#"
        self.assertEqual(m.an_uid(url, True, uids), "PRJLANR5L17BTC2765")
        self.assertEqual(m.an_uid(url.replace("2765", "2632"), False, uids), "PRJLANR5L17B2632")
        self.assertEqual(m.an_uid("https://www.assemblee-nationale.fr/dyn/17/textes/l17t0295_texte-adopte-seance",
                                  False, uids), "PRJLANR5L17BTA0295")
        self.assertIsNone(m.an_uid(url.replace("/17/", "/16/").replace("l17", "l16"), True, uids))

    def test_meme_place_sans_dates_distinctes_incertain(self):
        a, b = m.Noeud("a", (1, 1, 1), "2026-05-07", "AN"), m.Noeud("b", (1, 1, 1), "2026-05-07", "AN")
        self.assertTrue(all(n.incertain for n in m.ordonner([a, b])))
        c, d = m.Noeud("c", (1, 1, 0), "2026-06-01", "AN"), m.Noeud("d", (1, 1, 1), "2026-05-01", "AN")
        self.assertIn("avant c", m.ordonner([c, d])[1].incertain)

    def test_corps_akn_sans_doublon_dans_l_ordre(self):
        self.assertEqual(m.corps_akn(AKN.encode())["art_1er"],
                         "Le code rural et de la pêche maritime est ainsi modifié :\n"
                         "1° L’article L. 611‑1‑1 est ainsi modifié :\n"
                         "a) Au début du premier alinéa, est ajoutée la mention : « I. – » ;")


class Precedent(unittest.TestCase):
    def test_remonte_conforme_et_s_arrete_sur_l_incertain(self):
        v1 = version("B1", "depose", [("13", "present", AVANT)])
        v2 = version("BTC2", "commission", [("13", "conforme", "")])
        v3 = version("BTA3", "adopte", [("13", "present", APRES)])
        noeuds = [m.Noeud("B1", (1, 1, 0), "2025-03-11", "AN", version=v1),
                  m.Noeud("BTC2", (1, 1, 1), "2025-05-02", "AN", version=v2),
                  m.Noeud("BTA3", (1, 1, 2), "2025-05-27", "AN", version=v3)]
        p, raison, saut = m.precedent(noeuds, 2, suivi("13"))
        self.assertEqual((p.identite.id_source, raison, saut), ("B1#13", None, False))
        noeuds[1] = m.Noeud("BTC2", (1, 1, 1), "2025-05-02", "AN")               # texte non chargé
        self.assertIn("non chargé", m.precedent(noeuds, 2, suivi("13"))[1])
        noeuds[1] = m.Noeud("BTC2", (1, 1, 1), "2025-05-02", "AN", navette=False, version=v2)
        self.assertIn("rejeté", m.precedent(noeuds, 2, suivi("13"))[1])


def dossier_exemple(texte_14="I. – Version deux."):
    """Article 13 modifié par le seul amendement adopté AS1162, 14 modifié sans amendement, 15 inchangé."""
    v1 = version("PIONANR5L17B1100", "depose", [("13", "present", AVANT), ("14", "present", "I. – Version un."),
                                                 ("15", "present", "Inchangé.")])
    v2 = version("PIONANR5L17BTC1364", "commission", [("13", "present", APRES), ("14", "present", texte_14),
                                                      ("15", "present", "Inchangé.")])
    d = m.Dossier("SENAT:dossier:ppl24-661", [m.Noeud(v1.cle, (1, 1, 0), "2025-03-11", "AN", version=v1),
                                               m.Noeud(v2.cle, (1, 1, 1), "2025-05-02", "AN", version=v2)])
    d.etapes[v2.cle] = [amendement("AS1162"), amendement("AS9", sort="rejete")]
    return d


class Analyse(unittest.TestCase):
    def test_lignes_et_cas(self):
        elements = list(m.analyser(dossier_exemple()))
        lignes = {e.parent["version_article_id"].id_source: e.lignes for e in elements if isinstance(e, Dependants)}
        self.assertEqual(lignes["PIONANR5L17B1100#13"], [])                       # première version
        self.assertEqual(lignes["PIONANR5L17BTC1364#15"], [])                     # inchangé
        l13, l14 = lignes["PIONANR5L17BTC1364#13"][0], lignes["PIONANR5L17BTC1364#14"][0]
        self.assertEqual((l13["origine"], l13["statut"], l13["amendement_id"].id_source),
                         ("amendement", "VERIFIED", "AMAS1162"))
        self.assertEqual(l13["version_precedente_id"].id_source, "PIONANR5L17B1100#13")
        self.assertEqual((l14["origine"], l14["statut"], l14["amendement_id"]), ("inconnue", "NEEDS_REVIEW", None))
        cas = [e for e in elements if isinstance(e, CasRevue)]
        self.assertEqual([(c.type, c.cle) for c in cas], [
            ("modification_sans_amendement",
             "modification_sans_amendement:SENAT:dossier:ppl24-661/AN:article:PIONANR5L17BTC1364#14")])

    def test_version_hors_navette_en_revue(self):
        d = dossier_exemple()
        d.hors_navette = [version("PRJLANR5L17BTC3067", "commission", [("1", "present", "x")])]
        cas = [e for e in m.analyser(d) if isinstance(e, CasRevue) and e.type == "navette_incertaine"]
        self.assertEqual(cas[0].cle, "navette_incertaine:SENAT:dossier:ppl24-661/PRJLANR5L17BTC3067")


class Etape(unittest.TestCase):
    """L'étape écrit par le port `Entrepot`, saute un calcul aux entrées inchangées, classe les cas caducs."""

    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        racine = Path(self.dossier.name)
        fichiers = {}
        for nom in ("dossiers.json.zip", "dosleg.zip", "amendements.json.zip", "ameli.zip"):
            (racine / nom).write_bytes(nom.encode())
            fichiers[nom] = racine / nom
        self.entrepot = EntrepotMemoire()
        self.registre = RegistreIdentites(self.entrepot)
        self.ctx = ContexteCanon(self.entrepot, self.registre, fichiers, {})
        d = dossier_exemple()
        with self.registre.transaction():
            for n in d.noeuds:
                for a in n.version.articles:
                    self.registre.identifier("version_article", a.identite)
            self.amendement = self.registre.identifier("amendement", amendement("AS1162").identite)

    def tearDown(self):
        self.dossier.cleanup()

    def executer(self, dossier):
        with mock.patch.object(m, "dossiers_suivis", return_value=[dossier]):
            m.executer(self.ctx)

    def lignes(self, uid):
        return self.entrepot.dependants("modification_article", {
            "version_article_id": self.registre.resoudre(an("article", uid))})

    def test_ecrit_saute_puis_classe_les_caducs(self):
        self.executer(dossier_exemple())
        (l13,) = self.lignes("PIONANR5L17BTC1364#13")
        self.assertEqual((l13["statut"], l13["amendement_id"]), ("VERIFIED", self.amendement))
        self.assertEqual(l13["version_precedente_id"], self.registre.resoudre(an("article", "PIONANR5L17B1100#13")))
        self.assertEqual(l13["diff"]["operations"][1], ["-", "du présent chapitre"])
        self.assertEqual(len(self.lignes("PIONANR5L17BTC1364#14")), 1)
        self.assertEqual([c["statut"] for c in self.entrepot.cas_revue("modification_sans_amendement")], ["A_REVOIR"])
        # Mêmes entrées : rien n'est recalculé.
        self.executer(None)
        self.assertEqual(self.ctx.bilan["documents_inchanges"], 1)
        # Relu (règle ou texte corrigé) : l'article 14 n'a plus changé, sa ligne et son cas disparaissent.
        self.ctx.forcer = True
        self.executer(dossier_exemple(texte_14="I. – Version un."))
        self.assertEqual(self.lignes("PIONANR5L17BTC1364#14"), [])
        self.assertEqual([c["statut"] for c in self.entrepot.cas_revue("modification_sans_amendement")], ["CADUC"])


from tests.test_postgres import CX, remettre_a_zero  # noqa: E402


@unittest.skipIf(CX is None, "Postgres d'essais indisponible")
class EtapePostgres(unittest.TestCase):
    """Même calcul écrit dans `canon.modification_article` (diff en JSONB, clés étrangères différées)."""

    def test_ligne_ecrite(self):
        from src.adaptateurs.stockage.postgres import EntrepotPostgres
        from src.chargement import ecrire
        from src.domaine import EnregistrementSource
        from src.domaine.objets import Objet
        remettre_a_zero(CX)
        e = EntrepotPostgres(CX)
        with tempfile.TemporaryDirectory() as d:
            fichiers = {}
            for nom in ("dossiers.json.zip", "dosleg.zip", "amendements.json.zip", "ameli.zip"):
                (Path(d) / nom).write_bytes(nom.encode())
                fichiers[nom] = Path(d) / nom
            ctx = ContexteCanon(e, RegistreIdentites(e), fichiers, {})
            dossier = dossier_exemple()
            with ctx.registre.transaction():
                source, _ = e.enregistrer_source(EnregistrementSource(Systeme.AN, "essai", "", "x"))
                ecrire(ctx, Objet("dossier", an("dossier", "DLR5L17N51670"), {"titre": "Aide à mourir"}), source, None)
                ecrire(ctx, Objet("amendement", amendement("AS1162").identite, {"chambre": "AN", "numero": "AS1162"}),
                       source, None)
                for n in dossier.noeuds:
                    ecrire(ctx, Objet("version_texte", n.version.identite, {
                        "dossier_id": an("dossier", "DLR5L17N51670"), "nature": n.version.nature}), source, None)
                    for i, a in enumerate(n.version.articles):
                        ecrire(ctx, Objet("version_article", a.identite, {
                            "version_texte_id": n.version.identite, "numero": a.numero, "ordre": i, "texte": a.texte,
                            "empreinte": "x"}), source, None)
            with mock.patch.object(m, "dossiers_suivis", return_value=[dossier]):
                m.executer(ctx)
        (ligne,) = CX.execute("SELECT origine, statut, diff->'operations'->1, amendement_id IS NOT NULL "
                              "FROM canon.modification_article WHERE statut = 'VERIFIED'").fetchall()
        self.assertEqual(ligne, ("amendement", "VERIFIED", ["-", "du présent chapitre"], True))
        self.assertEqual(CX.execute("SELECT count(*) FROM canon.modification_article").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
