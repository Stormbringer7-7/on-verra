"""Textes de l'AN (HTML unitaire `dyn/opendata/<uid>.html`) : versions de texte et d'article.

Versions d'un dossier examiné (au moins une réunion de commission ou une séance) : ses documents
dont l'uid dit la nature — `…B2632` déposé, `…BTC1375` texte de la commission, `…BTA0295` texte
adopté. Articles : paragraphe `assnat9ArticleNum` (« Article 2 bis (nouveau) »), puis le corps
jusqu'à l'article suivant. Clé de suivi : celle du dossier Sénat quand l'AN le cite (même
article des deux côtés de la navette), sinon celle du dossier AN.
"""

import hashlib
import re
import time
import urllib.error
from html.parser import HTMLParser

from .... import revue
from ....chargement import Document, Flux, charger
from ....domaine.objets import CasRevue, Ensemble, Objet
from ....etl import Etape, Fichier
from ....textes import (MENTION_NUE, article_suivi, mention_seule, mentions, numeros_articles, omission,
                       statut_mention, supprime)
from . import dossiers
from .commun import DOCUMENT, LICENCE, Systeme, an, documents, jour, lire, val

TEXTE = re.compile(r"^(?:PRJL|PION)ANR5L17(B|BTC|BTA)(\d+)$")
NATURES = {"B": "depose", "BTC": "commission", "BTA": "adopte"}
EXAMEN = {"DiscussionCommission_Type", "DiscussionSeancePublique_Type"}
PAUSE = 0.3
TITRES = ("assnat4Titre", "assnat5Chapitre", "assnat6Section", "assnat7SousSection")
# Formule finale (« Délibéré en séance publique, à Paris, le… », puis la signature) : la fin des
# articles ; ce qui suit n'appartient pas au dernier article.
FIN = re.compile(r"^(?:Délibéré en séance publique|Fait à Paris, le)", re.I)


class Paragraphes(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.resultat, self._p = [], None

    def handle_starttag(self, balise, attributs):
        if balise == "p":
            self._p = [dict(attributs).get("class") or "", []]
        elif balise == "br" and self._p:
            self._p[1].append("\n")           # « Article 1er<br/>Intitulé » : deux lignes

    def handle_endtag(self, balise):
        if balise == "p" and self._p:
            lignes = [re.sub(r"\s+", " ", l).strip() for l in "".join(self._p[1]).split("\n")]
            texte = "\n".join(l for l in lignes if l)
            if texte:
                self.resultat.append((self._p[0], texte))
            self._p = None

    def handle_data(self, donnees):
        if self._p:
            self._p[1].append(donnees)


def articles(octets: bytes) -> list[dict]:
    """Articles dans l'ordre du texte : {libelle, numeros, mentions, intitule, corps}.

    Un paragraphe `assnat9ArticleNum` ouvre un article, sauf s'il n'est qu'une mention entre
    parenthèses (« (Supprimé) » sous « Article 4 ») : elle complète l'article ouvert ; ou une ligne
    de points (articles non reproduits) : ignorée. Ligne 1 : le numéro ; lignes suivantes : la
    mention (« Supprimé ») ou l'intitulé. `numeros` : None si l'intitulé ne les écrit pas en toutes
    lettres (plage, illisible)."""
    lecteur = Paragraphes()
    texte = octets.decode("utf-8", "replace")
    lecteur.feed(texte[texte.find("<body"):])
    resultat = []
    for classe, contenu in lecteur.resultat:
        if FIN.match(contenu):
            break
        if "assnat9ArticleNum" in classe:
            if omission(contenu):
                continue
            if mention_seule(contenu) and resultat and not resultat[-1]["corps"]:
                resultat[-1]["mentions"] += mentions(contenu)
                continue
            tete, *suite = contenu.split("\n")
            nues = [l for l in suite if MENTION_NUE.fullmatch(l.strip(" ()."))]
            resultat.append({"libelle": tete, "numeros": numeros_articles(tete),
                             "mentions": mentions(tete) + [l.strip(" ().") for l in nues],
                             "intitule": " ".join(l for l in suite if l not in nues) or None, "corps": []})
        elif resultat and not classe.startswith(TITRES):
            resultat[-1]["corps"].append(contenu.replace("\n", " "))
    return resultat


def version(doc: Document, definitifs: frozenset[int] = frozenset()):
    """`definitifs` : numéros des textes adoptés (TA) définitivement, selon DOSLEG
    (`senat.textes.definitifs`) : articles renumérotés, aucun suivi."""
    uid, dossier_uid, cle_dossier, date = doc.donnees
    lettres, numero_texte = TEXTE.match(uid).groups()
    nature = NATURES[lettres]
    definitif = lettres == "BTA" and int(numero_texte) in definitifs
    ident = an("version_texte", uid)
    yield Objet("version_texte", ident, {
        "dossier_id": an("dossier", dossier_uid), "document_id": an("document", uid), "nature": nature, "chambre": "AN",
        "date": date, "format": "html_an"}, "/html", f"{DOCUMENT}/{uid}.html")
    emises, cas, vus = [], [], set()
    lus = articles(doc.octets)
    if not lus:
        # Autre gabarit (titres sans la classe `assnat9ArticleNum`) : on ne devine pas où commence
        # un article ; le nombre de paragraphes « Article … » n'est qu'un indice pour la revue.
        lecteur = Paragraphes()
        brut = doc.octets.decode("utf-8", "replace")
        lecteur.feed(brut[brut.find("<body"):])
        probables = sum(1 for _, x in lecteur.resultat if re.fullmatch(r"Articles? .{1,40}", x))
        cle = f"texte_non_decoupe:{uid}"
        cas.append(cle)
        yield CasRevue("texte_non_decoupe", cle, "constat",
                       f"{uid} : aucun article balisé (gabarit sans `assnat9ArticleNum`), texte non découpé",
                       contexte={"texte": uid, "titres_probables": probables})
    for ordre, a in enumerate(lus):
        texte = "\n".join(a["corps"])
        statut = statut_mention(a["mentions"]) or ("supprime" if supprime(texte) else "present")
        pointeur = f"/html/article[{ordre}]"
        if a["numeros"] is None:
            plage = bool(re.search(r"\s(?:à|au)\s", a["libelle"])) and a["libelle"].lower().startswith("articles")
            type_cas = "articles_plage" if plage else "article_sans_numero"
            cle = f"{type_cas}:{uid}:{ordre}"
            cas.append(cle)
            yield CasRevue(type_cas, cle, "constat",
                           f"{uid} : « {a['libelle']} » " + ("désigne une plage d'articles : les articles intermédiaires "
                                                            "ne sont pas connus, aucun suivi" if plage else
                                                            "n'a pas de numéro lisible, aucun suivi"),
                           contexte={"texte": uid, "ordre": ordre, "libelle": a["libelle"], "mentions": a["mentions"]})
        for numero in a["numeros"] or [None]:
            suivi = article_suivi(cle_dossier, numero) if numero and not definitif else None
            if suivi:
                yield Objet("article_suivi", suivi, {"dossier_id": an("dossier", dossier_uid), "numero_initial": numero},
                            pointeur)
            # Identité : le numéro officiel dans ce texte (stable si un article est inséré avant) ;
            # le rang seulement sans numéro, ou si le numéro revient (annexe).
            cle_article = numero if numero and numero not in vus else f"{numero or ''}#{ordre}"
            vus.add(numero)
            identite = an("article", f"{uid}#{cle_article}")
            emises.append(identite)
            yield Objet("version_article", identite, {
                "version_texte_id": ident, "article_suivi_id": suivi, "numero": numero or a["libelle"],
                "intitule": a["intitule"], "mention": ", ".join(a["mentions"]) or None, "ordre": ordre, "texte": texte,
                "empreinte": hashlib.sha256(texte.encode()).hexdigest(), "statut": statut}, pointeur)
    # Ce texte publie exactement ces articles : les versions d'une lecture précédente qui n'y sont
    # plus sont marquées retirées, ses anciens cas sans objet deviennent caducs.
    yield Ensemble("version_article", "version_texte_id", ident, tuple(emises),
                   (f"article_sans_numero:{uid}:", f"articles_plage:{uid}:", f"texte_non_decoupe:{uid}"), tuple(cas))


def textes_examines(chemin):
    """(uid du texte, dossier, clé de suivi, date) pour les dossiers examinés en commission ou en séance."""
    examines, cle = set(), {}
    for doc in documents(dossiers.DOSSIERS, chemin, "dossierParlementaire/"):
        d = lire(doc)["dossierParlementaire"]
        if any(a.get("@xsi:type") in EXAMEN for a, *_ in dossiers.actes(d.get("actesLegislatifs"))):
            examines.add(d["uid"])
            cle[d["uid"]] = dossiers.cle_suivi(d)
    for doc in documents(dossiers.DOSSIERS, chemin, "document/"):
        d = lire(doc)
        d = d.get("document") or d
        dossier = val(d.get("dossierRef"))
        if TEXTE.match(d["uid"]) and dossier in examines:
            yield d["uid"], dossier, cle[dossier], jour(((d.get("cycleDeVie") or {}).get("chrono") or {}).get("dateDepot"))


def executer(ctx):
    chemin = ctx.fichier(dossiers.DOSSIERS.nom)
    cache = chemin.parent
    (cache / "textes").mkdir(exist_ok=True)
    a_lire, absents = [], []
    for uid, dossier, cle_dossier, date in textes_examines(chemin):
        f = Fichier(f"textes/{uid}.html", f"{DOCUMENT}/{uid}.html")
        if not (cache / f.nom).exists() or ctx.retelecharger:
            try:
                f.recuperer(cache, ctx.retelecharger)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                absents.append(uid)
                continue
            finally:
                time.sleep(PAUSE)
        a_lire.append((f, (uid, dossier, cle_dossier, date)))
    with ctx.registre.transaction():
        for uid in absents:
            revue.signaler(ctx.entrepot, ctx.registre, CasRevue(
                "document_non_publie", f"document_non_publie:{uid}", "constat",
                f"Texte {uid} cité par son dossier, non publié en HTML", contexte={"url": f"{DOCUMENT}/{uid}.html"}),
                None, ctx.bilan)

    def docs():
        for f, donnees in a_lire:
            yield Document(f, f.nom, (cache / f.nom).read_bytes(), donnees[0], donnees)

    from ..senat import textes as senat_textes
    from ..senat.dossiers import DOSLEG
    _, definitifs = senat_textes.definitifs(ctx.fichier(DOSLEG.nom))
    charger(ctx, Flux(Systeme.AN, LICENCE, docs, lambda d: version(d, frozenset(definitifs))))


ETAPE = Etape("an.textes", executer, apres=("an.travaux", "senat.dossiers"), sources=lambda p: [dossiers.DOSSIERS],
              description="textes de l'AN (déposés, de la commission, adoptés) : versions de texte et d'article")
