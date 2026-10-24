"""Comptes rendus intégraux de séance publique (Syceron) : une intervention par tour de parole.

Un tour de parole = les paragraphes consécutifs d'un même orateur (`@id_acteur`). Les
paragraphes sans orateur (« La séance est suspendue », applaudissements…) forment leur propre
intervention, sans orateur. Le texte est gardé tel que publié.

Rattachement au dossier, seulement par référence explicite : le point du compte rendu cite les
numéros des textes en discussion (`@valeur` « (n° 2406, 2401) »), qui sont les `numNotice` des
projets et propositions de la législature. Un seul dossier : `dossier_id` ; discussion commune
de plusieurs dossiers : un lien vers chacun, sans en choisir un. Le numéro d'ordre du point
(`@valeur_ptsodj`) ne concorde pas assez avec l'agenda (42 %) pour servir de lien.
"""

import hashlib
import re
from xml.etree import ElementTree

from ....chargement import Document, Flux
from ....domaine.objets import CasRevue, Dependants, Objet
from .cas import amendement_cite, candidats_orateur
from .commun import DOCUMENT, LICENCE, Systeme, an, documents, fichier, instant

SEANCES = fichier("comptes_rendus.xml.zip", "vp/syceronbrut/syseron.xml.zip")
NUMEROS = re.compile(r"\d+")
# « PA0 » : voix collective (« Un député du groupe RN ») : pas une personne, nom publié seul.
# « PA-125869 » : identifiant hors référentiel (M. François Bayrou) : une personne, à identifier
# en revue humaine (cas « orateur_sans_identifiant ») ; la décision s'applique à toutes ses interventions.
ACTEUR_OFFICIEL = re.compile(r"^PA[1-9]\d*$")
HORS_REFERENTIEL = re.compile(r"^PA-\d+$")


def texte(element) -> str:
    return re.sub(r"\s+", " ", "".join(element.itertext())).strip() if element is not None else ""


def numeros_cites(valeur: str | None) -> list[str]:
    """« (n[[os]] 2406, 2401) » -> ["2406", "2401"]."""
    return NUMEROS.findall(valeur or "")


class Tour:
    def __init__(self, paragraphe, point_titre, dossiers):
        self.paragraphes = [paragraphe]
        self.point_titre, self.dossiers = point_titre, dossiers

    @property
    def acteur(self):
        """Identité de l'orateur : officielle (PA), hors référentiel (en revue), ou aucune (voix collective)."""
        a = self.paragraphes[0].get("id_acteur") or ""
        if ACTEUR_OFFICIEL.match(a):
            return an("acteur", a)
        return an("acteur_hors_referentiel", a) if HORS_REFERENTIEL.match(a) else None


def seance(doc: Document, ns: str, dossier_du_texte: dict[tuple[str, str], set[str]],
           chercher_amendements=lambda reunion, numeros, dossier=None: ([], []), annuaire=None):
    racine = ElementTree.fromstring(doc.octets)
    q = lambda nom: f"{ns}{nom}"
    uid = racine.findtext(q("uid"))
    reunion_uid = racine.findtext(q("seanceRef"))
    reunion = an("reunion", reunion_uid)
    meta = racine.find(q("metadonnees"))
    legislature = (meta.findtext(q("legislature")) if meta is not None else None) or "17"
    debut = instant(meta.findtext(q("dateSeance"))) if meta is not None else None
    yield Objet("document", an("document", uid), {
        "type": "compte_rendu", "type_source": "CRS", "numero": uid,
        "titre": f"Compte rendu intégral, {meta.findtext(q('dateSeanceJour'))}" if meta is not None else None,
        "date": debut.date() if debut else None, "url": f"{DOCUMENT}/{uid}.html"}, "/compteRendu")
    # L'heure de début vient de l'agenda : deux sources pour un même champ, ce serait le dernier
    # écrivain qui gagne. Le compte rendu n'apporte que son propre rattachement.
    yield Objet("reunion", reunion, {"type": "seance", "chambre": "AN", "compte_rendu_id": an("document", uid)},
                "/compteRendu/seanceRef")

    tours: list[Tour] = []
    point_titre, dossiers = None, []
    for element in racine.iter():
        balise = element.tag.removeprefix(ns)
        if balise == "point" and element.get("nivpoint") == "1":
            point_titre = texte(element.find(q("texte"))) or None
            dossiers = sorted(set().union(set(), *(dossier_du_texte.get((legislature, n), set())
                                                   for n in numeros_cites(element.get("valeur")))))
        elif balise == "paragraphe":
            p = element
            if tours and p.get("id_acteur") and p.get("id_acteur") == tours[-1].paragraphes[0].get("id_acteur") \
                    and tours[-1].point_titre == point_titre:
                tours[-1].paragraphes.append(p)
            else:
                tours.append(Tour(p, point_titre, dossiers))

    # Les identités à revoir d'abord : les interventions qui les citent ne sont pas des « références
    # inconnues » de plus.
    hors_referentiel = {}
    for t in tours:
        if t.acteur and t.acteur.type_source == "acteur_hors_referentiel":
            o = t.paragraphes[0].find(f"{q('orateurs')}/{q('orateur')}")
            hors_referentiel.setdefault(t.acteur, (o.findtext(q("nom")) if o is not None else None) or "")
    for identite, libelle in hors_referentiel.items():
        yield CasRevue("orateur_sans_identifiant", f"orateur_sans_identifiant:{identite.id_source}", "identite",
                       f"« {libelle} » parle sous l'identifiant {identite.id_source}, hors référentiel",
                       sujet=("personne", identite), candidats=candidats_orateur(libelle, annuaire or {}),
                       contexte={"libelle": libelle, "compte_rendu": uid})

    problemes: dict[str, tuple[list[str], list]] = {}      # numéro -> (candidats, interventions)
    for ordre, t in enumerate(tours):
        premier = t.paragraphes[0]
        orateur = premier.find(f"{q('orateurs')}/{q('orateur')}")
        corps = "\n".join(x for x in (texte(p.find(q("texte"))) for p in t.paragraphes) if x)
        temps = premier.find(q("texte"))
        stime = temps.get("stime") if temps is not None else None
        amendements = ", ".join(dict.fromkeys(a for p in t.paragraphes if (a := p.get("adt"))))
        # « 2347, 2349 » : amendements discutés, retrouvés par leur numéro dans cette séance
        trouves, manques = chercher_amendements(reunion_uid, NUMEROS.findall(amendements),
                                                t.dossiers[0] if len(t.dossiers) == 1 else None)
        discutes = list(dict.fromkeys(trouves))
        article = next((a for p in t.paragraphes if (a := p.get("art"))), None)
        intervention = an("intervention", f"{uid}#{premier.get('id_syceron')}")
        for numero, candidats in manques:
            problemes.setdefault(numero, (candidats, []))[1].append(("intervention", intervention))
        libelle = (orateur.findtext(q("nom")) if orateur is not None else None) or ""
        yield Objet("intervention", intervention, {
            "reunion_id": reunion, "ordre": ordre, "horodatage_s": float(stime) if stime else None,
            "orateur_id": t.acteur, "orateur_libelle": libelle,
            "qualite": (orateur.findtext(q("qualite")) if orateur is not None else None) or None,
            "role": premier.get("code_grammaire") or None, "texte": corps,
            "empreinte": hashlib.sha256(corps.encode()).hexdigest(), "point_titre": t.point_titre,
            # un seul dossier cité : rattachement direct ; discussion commune : les liens ci-dessous
            "dossier_id": an("dossier", t.dossiers[0]) if len(t.dossiers) == 1 else None,
            "article": article, "amendements": amendements or None,
            "amendement_id": an("amendement", discutes[0]) if len(discutes) == 1 else None},
            f"/compteRendu//paragraphe[@id_syceron='{premier.get('id_syceron')}']")
        if len(discutes) > 1:
            yield Dependants("lien", {"de_id": intervention, "nature": "amendement"},
                             [{"vers_id": an("amendement", u), "ordre": i} for i, u in enumerate(discutes)],
                             requis=("vers_id",))
        if len(t.dossiers) > 1:
            yield Dependants("lien", {"de_id": intervention, "nature": "dossier"},
                             [{"vers_id": an("dossier", d), "ordre": i} for i, d in enumerate(t.dossiers)],
                             requis=("vers_id",))

    for numero, (candidats, cibles) in problemes.items():
        yield amendement_cite(f"amendement_cite:AN:{reunion_uid}:{numero}", numero, candidats, cibles,
                              {"ou": f"séance {reunion_uid}", "compte_rendu": uid})


def flux(chemin, dossier_du_texte: dict[tuple[str, str], set[str]], chercher_amendements, annuaire) -> list[Flux]:
    ns = "{http://schemas.assemblee-nationale.fr/referentiel}"

    # Pas de passe préalable : rien ne référence les interventions, et la réunion est écrite
    # avant elles dans chaque document.
    return [Flux(Systeme.AN, LICENCE, lambda: documents(SEANCES, chemin, "compteRendu/"),
                 lambda doc: seance(doc, ns, dossier_du_texte, chercher_amendements, annuaire))]
