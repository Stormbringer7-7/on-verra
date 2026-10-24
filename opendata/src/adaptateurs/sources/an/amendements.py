"""Amendements de l'AN : texte visé, article, étape, sort, dispositif et exposé tels que publiés, auteurs.

Le dossier et le texte visé viennent du chemin dans l'archive (`json/<dossier>/<texte>/<uid>.json`)
et de `texteLegislatifRef`. Article suivi : le numéro officiel publié par `pointeurFragmentTexte/
division` et la clé de suivi du dossier (cf. `src/textes.py`). Étape : celle de la lecture qui cite
le texte visé, menée par l'organe d'examen de l'amendement, si elle est unique. Les avis du
rapporteur et du Gouvernement ne sont pas publiés en données structurées par l'AN :
`avis_amendement` reste vide pour l'AN.
"""

import re
import zipfile
from pathlib import Path

from ....chargement import Document, Flux
from ....domaine.objets import Candidat, CasRevue, Dependants, Objet
from ....textes import article_suivi, numero_article
from .commun import LICENCE, Systeme, an, documents, fichier, instant, jour, liste, lire, val

AMENDEMENTS = fichier("amendements.json.zip", "loi/amendements_div_legis/Amendements.json.zip")
CHEMIN = re.compile(r"json/([^/]+)/([^/]+)/([^/]+)\.json$")
# uid : AMANR5L17PO420120B2851P0D1N000002 -> organe d'examen, numéro du texte
UID = re.compile(r"^AMANR5L(\d+)(PO\d+)B(?:TC)?(\d+)")
SORTS = {"Adopté": "adopte", "Rejeté": "rejete", "Retiré": "retire", "Tombé": "tombe",
         "Non soutenu": "non_soutenu", "Retiré avant séance": "retire"}


def sort(a: dict) -> str:
    cycle = a.get("cycleDeVie") or {}
    publie = val(cycle.get("sort"))
    if publie:
        return SORTS.get(publie, "autre")
    # Pas de sort publié : l'état du traitement le dit (« Retiré », « Irrecevable 40 »…).
    etat = val(((cycle.get("etatDesTraitements") or {}).get("etat") or {}).get("libelle")) or ""
    if etat.startswith("Irrecevable"):
        return "irrecevable"
    return "retire" if etat.startswith("Retiré") else "en_attente"


# Désignation en capitales (« ARTICLE 3 BIS A ») : les adverbes latins se remettent en minuscules,
# les lettres d'insertion (« A », « AA ») restent capitales, comme dans les textes.
LATIN = re.compile(r"(?:bis|ter|quater|[a-z]+ies|liminaire)", re.I)


def numero_publie(libelle: str, capitales: bool) -> str | None:
    """« Article 3 bis A » -> « 3 bis A » ; « ARTICLE 64 : » -> « 64 » ; « Article 3 bi » -> None."""
    t = re.sub(r"^ART\.\s", "Article ", (libelle or "").strip()).rstrip(" :")
    if capitales:
        t = " ".join(m.lower() if LATIN.fullmatch(m) else m for m in t.split(" "))
    return numero_article(t)


def article_vise(division: dict) -> tuple[str, str | None]:
    """Ce que vise l'amendement, d'après `pointeurFragmentTexte/division` :
    - (« article », numéro) : un article existant ; une annexe, l'article auquel l'AN la rattache
      (`divisionRattachee`, « ÉTAT B » -> « ARTICLE 49 ») ;
    - (« additionnel » | « intitule » | « division » | « sans_division », None) : aucun article
      existant (insertion avant ou après un article, intitulé du texte, titre ou chapitre, pas de
      division publiée) : l'absence de suivi est voulue ;
    - (« illisible », None) : un article ou une annexe dont le numéro ne se lit pas, à revoir.
    Le numéro vient de `titre` (casse publiée : « Article 3 bi » n'est pas lu « 3 BI ») ;
    `articleDesignation` donne le même dans tous les cas lisibles."""
    if not division:
        return "sans_division", None
    if (val(division.get("articleAdditionnel")) == "true" or val(division.get("chapitreAdditionnel")) == "true"
            or val(division.get("avant_A_Apres")) in ("Avant", "Après")):
        return "additionnel", None
    type_ = val(division.get("type"))
    if type_ == "TITRE":
        return "intitule", None
    if type_ == "CHAPITRE":
        return "division", None
    numero = None
    if type_ == "ANNEXE":
        numero = numero_publie(val(division.get("divisionRattachee")) or "", True)
    elif type_ == "ARTICLE":
        titre = val(division.get("titre")) or ""
        numero = numero_publie(titre, not re.search(r"[a-z]", titre))
    return ("article", numero) if numero else ("illisible", None)


def rattachement(ident, dossier: str | None, texte: str | None, organe: str | None, division: dict, examens):
    """Article suivi et étape de l'amendement, et ce qu'il faut écrire ou revoir pour les obtenir :
    (suivi, étape, éléments). Sans index des dossiers (`examens`), ni l'un ni l'autre."""
    if examens is None:
        return None, None, []
    elements, suivi = [], None
    nature, numero = article_vise(division)
    if nature == "article" and dossier in examens.cles:
        # Identité dérivée de références officielles (clé du dossier + numéro) : l'amendement peut
        # la déclarer lui-même, l'article ne dépend pas du chargement des textes.
        suivi = article_suivi(examens.cles[dossier], numero)
        elements.append(Objet("article_suivi", suivi, {"dossier_id": an("dossier", dossier), "numero_initial": numero},
                              "/amendement/pointeurFragmentTexte/division"))
    elif nature == "illisible":
        elements.append(CasRevue(
            "article_vise_illisible", f"article_vise_illisible:{ident}", "constat",
            f"{ident.id_source} : la division visée « {val(division.get('titre'))} » n'a pas de numéro d'article lisible",
            contexte={"titre": val(division.get("titre")), "designation": val(division.get("articleDesignation")),
                      "type": val(division.get("type")), "url": val(division.get("urlDivisionTexteVise"))}))
    etapes = examens.etapes.get((dossier, texte, organe), []) if organe else []
    if len(etapes) > 1:
        elements.append(CasRevue(
            "etape_ambigue", f"etape_ambigue:{ident}", "champ",
            f"{ident.id_source} : le texte {texte} et l'organe {organe} désignent {len(etapes)} étapes du dossier {dossier}",
            champ="etape_id", cibles=(("amendement", ident),),
            candidats=tuple(Candidat("etape", an("acte", e), e) for e in etapes),
            contexte={"texte": texte, "organe": organe, "dossier": dossier}))
    return suivi, an("acte", etapes[0]) if len(etapes) == 1 else None, elements


def amendement(doc: Document, examens=None):
    a = lire(doc)["amendement"]
    m = CHEMIN.search(doc.chemin)
    dossier, texte = (m.group(1), m.group(2)) if m else (None, None)
    uid, ident = a["uid"], an("amendement", a["uid"])
    cycle, pointeur = a.get("cycleDeVie") or {}, a.get("pointeurFragmentTexte") or {}
    division = pointeur.get("division") or {}
    organe = UID.match(uid)
    corps = (a.get("corps") or {}).get("contenuAuteur") or {}
    texte = val(a.get("texteLegislatifRef")) or texte
    suivi, etape, elements = rattachement(ident, dossier, texte, organe.group(2) if organe else None, division, examens)
    yield from (e for e in elements if isinstance(e, Objet))         # l'article suivi avant l'amendement qui le cite
    yield Objet("amendement", ident, {
        "dossier_id": an("dossier", dossier), "texte_vise_id": an("document", texte),
        "article_suivi_id": suivi, "etape_id": etape,
        "parent_id": an("amendement", val(a.get("amendementParentRef"))), "chambre": "AN",
        "numero": val((a.get("identification") or {}).get("numeroLong")),
        "organe_examen_id": an("organe", organe.group(2)) if organe else None,
        "division": val(division.get("articleDesignationCourte")) or val(division.get("titre")),
        "url_division": val(division.get("urlDivisionTexteVise")),        # chemin tel que publié
        "sort": sort(a), "sort_source": val(cycle.get("sort")) or val(((cycle.get("etatDesTraitements") or {})
                                                                         .get("etat") or {}).get("libelle")),
        "date_depot": jour(cycle.get("dateDepot")), "date_sort": instant(cycle.get("dateSort")),
        "dispositif": val(corps.get("dispositif")), "expose": val(corps.get("exposeSommaire")),
        "seance_id": an("reunion", val(a.get("seanceDiscussionRef")))},
        "/amendement")                         # pas d'URL publique vérifiable : la provenance suffit
    signataires = a.get("signataires") or {}
    auteur = signataires.get("auteur") or {}
    auteurs = [an("acteur", val(auteur.get("acteurRef")))] if val(auteur.get("acteurRef")) else []
    if not auteurs and val(auteur.get("gouvernementRef")):
        auteurs = [an("organe", val(auteur["gouvernementRef"]))]
    cosignataires = [an("acteur", r) for r in dict.fromkeys(
        val(x) for x in liste((signataires.get("cosignataires") or {}).get("acteurRef"))) if r]
    for nature, cibles in (("auteur", auteurs), ("cosignataire", cosignataires),
                           ("groupe_auteur", [an("organe", g)] if (g := val(auteur.get("groupePolitiqueRef"))) else [])):
        yield Dependants("lien", {"de_id": ident, "nature": nature},
                         [{"vers_id": c, "ordre": i} for i, c in enumerate(cibles)], "/amendement/signataires",
                         ("vers_id",))
    yield from (e for e in elements if isinstance(e, CasRevue))


class Index:
    """Retrouver un amendement par ce que citent les comptes rendus et les scrutins :
    (séance, numéro) en séance publique, sinon (dossier, numéro) s'il n'y désigne qu'un amendement
    (discussion poursuivie dans une autre séance) ; (organe, numéro du texte, numéro) en commission."""

    def __init__(self, chemin: Path):
        self.seance: dict[tuple[str, str], str] = {}
        self.dossier: dict[str, str] = {}                  # amendement -> dossier (chemin de l'archive)
        self.par_dossier: dict[tuple[str, str], list[str]] = {}
        self.commission: dict[tuple[str, str, str], list[str]] = {}
        with zipfile.ZipFile(chemin) as z:
            for nom in z.namelist():
                if not nom.endswith(".json"):
                    continue
                a = lire(Document(AMENDEMENTS, nom, z.read(nom)))["amendement"]
                if m := CHEMIN.search(nom):
                    self.dossier[a["uid"]] = m.group(1)
                numero = val((a.get("identification") or {}).get("numeroLong"))
                seance = val(a.get("seanceDiscussionRef"))
                if numero and seance:
                    self.seance[(seance, numero)] = a["uid"]
                if numero and numero.isdigit() and a["uid"] in self.dossier:
                    self.par_dossier.setdefault((self.dossier[a["uid"]], numero), []).append(a["uid"])
                if numero and (m := UID.match(a["uid"])):
                    self.commission.setdefault((m.group(2), m.group(3), numero), []).append(a["uid"])

    def chercher(self, reunion: str, numeros: list[str], dossier: str | None = None
                 ) -> tuple[list[str], list[tuple[str, list[str]]]]:
        """Amendements trouvés, et problèmes à revoir : (numéro, candidats) — plusieurs candidats
        (ambigu) ou aucun (introuvable). Le code ne choisit jamais entre candidats."""
        trouves, problemes = [], []
        for n in numeros:
            if u := self.seance.get((reunion, n)):
                trouves.append(u)
                continue
            candidats = self.par_dossier.get((dossier, n), []) if dossier else []
            if len(candidats) == 1:
                trouves.append(candidats[0])
            else:
                problemes.append((n, candidats))
        return trouves, problemes

    def en_seance(self, reunion: str, numeros: list[str], dossier: str | None = None) -> list[str]:
        return self.chercher(reunion, numeros, dossier)[0]


def flux(chemin, examens=None) -> list[Flux]:
    """`examens` : index des dossiers (`dossiers.Examens`) pour l'article suivi et l'étape."""
    return [Flux(Systeme.AN, LICENCE, lambda: documents(AMENDEMENTS, chemin), lambda doc: amendement(doc, examens),
                 # l'uid est le nom du fichier : pas besoin de relire le JSON pour l'identifier
                 lambda doc: [("amendement", an("amendement", doc.id_source))])]
