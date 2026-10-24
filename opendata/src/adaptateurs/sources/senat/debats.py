"""Comptes rendus intégraux de séance du Sénat (`cri.zip` : un XML par jour, depuis 2003).

Une intervention par `cri:intervenant`, texte tel que publié, sans le nom d'orateur en tête.
- orateur : `@mat`, matricule Sénat (référence officielle). `@type` 1 = sénateur. `@type` 2 = membre
  du Gouvernement, sans fiche sénateur : un cas de revue propose les acteurs AN homonymes ; tant
  qu'une personne n'a pas décidé, ses interventions gardent le nom publié sans orateur relié ;
- dossier : `cri:titreS1@signet` des sections de texte (`sect_pdl`), clé DOSLEG, reliée au dossier
  AN quand l'AN la cite ;
- article : `cri:mentionarticle@num` ;
- amendements : ancre `amd_<session>_<texte>_<numéro>` de l'intervention, sinon numéro cité dans
  le texte, cherché dans les textes AMELI de la lecture (`cri:titreS1@lecassidt`) du dossier
  (cf. `amendements_cites`). Un seul : `amendement_id` ; plusieurs : un lien vers chacun ; un
  numéro qui en désigne plusieurs, ou aucun : cas `amendement_ambigu` / `amendement_introuvable`.
Seules les séances de la 17e législature de l'AN (depuis le 18/07/2024) sont chargées.
"""

import hashlib
import re
import zipfile
from datetime import datetime
from html.parser import HTMLParser

from ....chargement import Document, Flux, charger
from ....domaine import IdentiteNative
from ....domaine.objets import Candidat, CasRevue, Dependants, Objet
from ....noms import normaliser
from ....etl import Etape
from ..an.cas import amendement_cite
from . import amendements_cites
from .commun import LICENCE, Systeme, senat
from .dossiers import DOSLEG
from .resultats import CRI
from .travaux import AMELI

DEPUIS = "20240718"
JOUR = re.compile(r"cri/d(\d{8})\.xml$")
# « PRÉSIDENCE DE M. Alain Marc » : section de forme au changement de président, la discussion continue
PRESIDENCE = re.compile(r"^\s*présidence de\b", re.I)


class Lecteur(HTMLParser):
    """Lecture tolérante : le « XML » du Sénat embarque du HTML mal formé (aucun des 244 jours de
    la législature ne passe un analyseur XML strict). Les balises `cri:*` portent la structure ;
    tout le reste n'est que du texte."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        # ("section"|"article", attrs) ; ("intervention", attrs, nom, texte, ancres, texte hors dispositif)
        self.evenements = []
        self._intervenant, self._nom, self._paragraphes, self._dans_nom, self._ancres = None, [], [], 0, []
        self._dans_dispositif, self._debat = 0, []

    def handle_starttag(self, balise, attributs):
        a = dict(attributs)
        if balise == "cri:titres1":
            self.evenements.append(("section", a))
        elif balise == "cri:mentionarticle":
            self.evenements.append(("article", a))
        elif balise == "cri:intervenant":
            self._fermer()
            self._intervenant, self._nom, self._paragraphes, self._ancres, self._debat = a, [], [[]], [], []
        elif balise == "cri:amendements":
            self._dans_dispositif += 1
        elif balise == "a" and self._intervenant is not None and (ancre := amendements_cites.ancre(a.get("name"))):
            self._ancres.append(ancre)
        elif balise == "cri:orateurnom":
            self._dans_nom += 1
        elif balise == "p" and self._intervenant is not None:
            self._paragraphes.append([])

    def handle_endtag(self, balise):
        if balise == "cri:orateurnom":
            self._dans_nom = max(0, self._dans_nom - 1)
        elif balise == "cri:amendements":
            self._dans_dispositif = max(0, self._dans_dispositif - 1)
        elif balise == "cri:intervenant":
            self._fermer()

    def handle_data(self, donnees):
        if self._intervenant is not None:
            (self._nom if self._dans_nom else self._paragraphes[-1]).append(donnees)
            if not self._dans_nom and not self._dans_dispositif:
                self._debat.append(donnees)

    def _fermer(self):
        if self._intervenant is None:
            return
        nom = re.sub(r"\s+", " ", "".join(self._nom)).strip().rstrip(" .,")
        paragraphes = [re.sub(r"\s+", " ", "".join(p)).strip().lstrip(" .,") for p in self._paragraphes]
        self.evenements.append(("intervention", self._intervenant, nom, "\n".join(p for p in paragraphes if p),
                                list(dict.fromkeys(self._ancres)), re.sub(r"\s+", " ", "".join(self._debat))))
        self._intervenant, self._dans_nom, self._dans_dispositif = None, 0, 0

    def close(self):
        super().close()
        self._fermer()


def discussions(evenements) -> list[dict]:
    """La discussion de chaque section, dans l'ordre : son dossier et sa lecture (section de
    texte), les ancres d'amendement de ses interventions. Une section de changement de présidence
    prolonge la discussion en cours."""
    sections = []
    for evenement, a, *reste in evenements:
        if evenement == "section":
            if not (sections and PRESIDENCE.match(a.get("libelle") or "")):
                signet = a.get("signet") if a.get("type") == "sect_pdl" else None
                discussion = {"signet": signet, "lecture": a.get("lecassidt") if signet else None, "ancres": []}
            sections.append(discussion)
        elif evenement == "intervention" and sections:
            sections[-1]["ancres"] += reste[2]
    return sections


def seance(doc: Document, annuaire: dict | None = None, index: amendements_cites.Index | None = None):
    jour = JOUR.search(doc.chemin).group(1)
    date = datetime.strptime(jour, "%Y%m%d")
    lecteur = Lecteur()
    lecteur.feed(doc.octets.decode("iso-8859-1"))
    lecteur.close()
    reunion, compte_rendu = senat("seance", f"d{jour}"), senat("compte_rendu", f"d{jour}")
    yield Objet("document", compte_rendu, {"type": "compte_rendu", "type_source": "CRI", "numero": f"d{jour}",
                                           "titre": f"Compte rendu intégral du {date:%d/%m/%Y}", "date": date.date()},
                "/cri")
    yield Objet("reunion", reunion, {"type": "seance", "chambre": "SENAT", "debut": date,
                                     "compte_rendu_id": compte_rendu}, "/cri")
    section, signet, article, ordre = None, None, None, 0
    sections, bloc, textes = discussions(lecteur.evenements), {"signet": None, "lecture": None}, ([], [])
    gouvernement_vus = set()
    problemes: dict[tuple[str, str], tuple] = {}     # (où, numéro) -> (candidats, interventions, dossier, motif)
    for evenement, a, *reste in lecteur.evenements:
        if evenement == "section":
            section = a.get("libelle")
            signet = a.get("signet") if a.get("type") == "sect_pdl" else None
            article = None
            if (suivante := sections.pop(0)) is not bloc:
                bloc = suivante
                textes = index.en_discussion(bloc["signet"], bloc["lecture"], bloc["ancres"]) if index else ([], [])
        elif evenement == "article":
            article = a.get("num") or None
        else:
            nom, contenu, ancres, debat = reste
            mat, genre = a.get("mat"), a.get("type")
            if mat and genre == "2" and mat not in gouvernement_vus:
                gouvernement_vus.add(mat)
                yield membre_du_gouvernement(mat, a, annuaire or {}, jour)
            orateur = senat("senateur" if genre == "1" else "membre_gouvernement", mat) \
                if mat and genre in ("1", "2") else None
            intervention = senat("intervention", f"d{jour}#{a.get('id')}")
            numeros = amendements_cites.numeros_cites(debat)
            ou = f"lecture {bloc['lecture']}" if bloc["lecture"] else "hors lecture"
            discutes, manques = index.chercher(ancres, numeros, *textes, ou) if index else ([], [])
            for lieu, numero, candidats, motif in manques:
                problemes.setdefault((lieu, numero), (candidats, [], bloc["signet"], motif))[1].append(
                    ("intervention", intervention))
            yield Objet("intervention", intervention, {
                "reunion_id": reunion, "ordre": ordre, "orateur_id": orateur,
                "orateur_libelle": nom or a.get("nom") or "", "qualite": (a.get("qua") or "").strip(" .") or None,
                "role": f"type_{genre}" if genre else None, "texte": contenu,
                "empreinte": hashlib.sha256(contenu.encode()).hexdigest(), "point_titre": section,
                "dossier_id": senat("dossier", signet) if signet else None, "article": article,
                "amendements": ", ".join(dict.fromkeys([n for *_, n in ancres] + numeros)) or None,
                "amendement_id": senat("amendement", discutes[0]) if len(discutes) == 1 else None},
                f"/cri//intervenant[@id='{a.get('id')}']")
            if len(discutes) > 1:
                yield Dependants("lien", {"de_id": intervention, "nature": "amendement"},
                                 [{"vers_id": senat("amendement", u), "ordre": i} for i, u in enumerate(discutes)],
                                 requis=("vers_id",))
            ordre += 1
    for (ou, numero), (candidats, cibles, dossier, motif) in problemes.items():
        yield amendement_cite(f"amendement_cite:SENAT:d{jour}:{ou.replace(' ', ':')}:{numero}", numero, candidats,
                              cibles, {"ou": f"séance du {date:%d/%m/%Y}, {ou}", "dossier": dossier,
                                       **({"motif": motif} if motif else {})},
                              lambda u: senat("amendement", u))


def membre_du_gouvernement(mat: str, a: dict, annuaire: dict, jour: str) -> CasRevue:
    """Ministre cité par le Sénat sous un matricule propre : quel acteur AN est-ce ?"""
    nom = a.get("nom") or mat
    candidats = tuple(Candidat("personne", IdentiteNative(Systeme.AN, "acteur", c["acteur"]), c["libelle"],
                               {"depute": c["depute"], "membre_gouvernement": c["membre_gouvernement"]})
                      for c in annuaire.get(normaliser(nom), []))
    return CasRevue(
        "identite_membre_gouvernement", f"identite_membre_gouvernement:{mat}", "identite",
        f"« {nom} » ({(a.get('qua') or '').strip(' .') or 'membre du Gouvernement'}) parle au Sénat sous le "
        f"matricule {mat} : {len(candidats)} acteur(s) AN homonyme(s)",
        sujet=("personne", senat("membre_gouvernement", mat)), candidats=candidats,
        # décision « aucun » : la personne est créée telle que le Sénat la publie
        contexte={"premiere_seance": jour, "si_aucun": {"type": "personne", "valeurs": {
            "civilite": a.get("civ"), "nom": nom, "nom_affiche": nom}}})


def documents(chemin):
    with zipfile.ZipFile(chemin) as z:
        for nom in sorted(z.namelist()):
            m = JOUR.search(nom)
            if m and m.group(1) >= DEPUIS:
                yield Document(CRI, nom, z.read(nom), f"d{m.group(1)}")


def executer(ctx):
    from ..an import travaux                    # annuaire des noms de l'AMO : candidats de revue
    chemin = ctx.fichier(CRI.nom)
    annuaire = travaux.annuaire(ctx)
    index = amendements_cites.Index.lire(ctx.fichier(AMELI.nom), ctx.fichier(DOSLEG.nom))
    charger(ctx, Flux(Systeme.SENAT, LICENCE, lambda: documents(chemin), lambda d: seance(d, annuaire, index)))


# Après `senat.travaux` : les amendements cités existent avant les interventions qui les citent.
ETAPE = Etape("senat.debats", executer, apres=("an.acteurs", "senat.senateurs", "senat.dossiers", "senat.travaux"),
              sources=lambda p: [CRI, AMELI, DOSLEG],
              description="comptes rendus intégraux de séance du Sénat depuis le 18/07/2024 : interventions")
