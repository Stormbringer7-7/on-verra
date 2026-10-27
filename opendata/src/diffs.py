"""Ce qui a changé dans un article d'une version à la suivante, et l'amendement qui l'a fait.

Fonctions pures (stdlib seulement), sans source ni stockage :
- `diff_mots` : diff mot à mot de deux textes d'article (`difflib`), ponctuation comprise ; la
  typographie (espaces insécables, apostrophes, tirets) n'est pas un changement ;
- `vise` : l'article qu'un amendement désigne, lu dans sa désignation brute (AN
  `pointeurFragmentTexte/division`, Sénat subdivision AMELI) ;
- `attribuer` : l'origine d'une modification. `VERIFIED` seulement sur preuve explicite : un seul
  amendement adopté vise l'article à l'étape qui produit la version, et le texte que son
  dispositif insère entre guillemets (« … ») s'y retrouve, absent de la version précédente ;
  tout le reste est `NEEDS_REVIEW` (le code ne choisit jamais entre candidats).
"""

import difflib
import re
import unicodedata
from dataclasses import dataclass, field

from .textes import numero_article, texte_html

FORMAT = "mots"
# Un mot (avec ses apostrophes et traits d'union internes) ou un signe de ponctuation. Les accents
# peuvent être publiés décomposés (« e » + accent combinant) : ils font partie du mot.
_MOT = r"(?:\w[\u0300-\u036f]*)+"
JETON = re.compile(rf"{_MOT}(?:['’ʼ‑‐-]{_MOT})*|[^\w\s\u0300-\u036f][\u0300-\u036f]*")
TYPOGRAPHIE = str.maketrans({"’": "'", "ʼ": "'", "‘": "'", "‑": "-", "‐": "-", "—": "–", "œ": "oe", "Œ": "Oe",
                             "…": "...", " ": " ", "\xa0": " "})
# Mentions éditoriales de la navette (« (nouveau) », « (Supprimé) »…) : elles annotent le texte, elles
# n'en font pas partie ; elles n'entrent pas dans la comparaison.
MENTION = re.compile(r"\(\s*(?:nouveaux?|nouvelles?|supprimée?s?|non modifiée?s?|conformes?|division (?:nouvelle|supprimée)|"
                     r"pour coordination|précédemment examinée?s?)\s*\)", re.I)
# Un passage cité de moins de 3 mots (« et », « la loi ») se retrouve partout : ce n'est pas une preuve.
MOTS_PREUVE = 3


def _forme(jeton: str) -> str:
    return unicodedata.normalize("NFC", jeton).translate(TYPOGRAPHIE)


def jetons(texte: str) -> list[tuple[str, int, int]]:
    """(forme comparée, début, fin) de chaque mot ou signe de `texte`, mentions éditoriales exclues."""
    texte = texte or ""
    exclus = [m.span() for m in MENTION.finditer(texte)]
    return [(_forme(m.group()), m.start(), m.end()) for m in JETON.finditer(texte)
            if not any(d <= m.start() < f for d, f in exclus)]


def _mots(formes) -> int:
    return sum(1 for f in formes if re.match(r"\w", f))


# Au-delà (produit des longueurs en jetons), un bloc d'alinéas remplacé n'est pas détaillé mot à mot :
# il est donné supprimé puis ajouté (le calcul serait quadratique sur un article de loi de finances).
DETAIL_MAX = 250_000


def _morceau(texte: str, seq, i: int, j: int) -> str:
    """Texte des jetons i à j-1, espaces suivants compris (le début et la fin du texte aussi)."""
    if i == j:
        return ""
    debut = 0 if i == 0 else seq[i][1]
    fin = len(texte) if j == len(seq) else seq[j][1]
    return texte[debut:fin]


def _mots_a_mots(avant: str, apres: str) -> list[list[str]]:
    a, b = jetons(avant), jetons(apres)
    fa, fb = [x[0] for x in a], [x[0] for x in b]
    if len(fa) * len(fb) > DETAIL_MAX:
        return [["-", avant], ["+", apres]]
    ops = []
    for code, i1, i2, j1, j2 in difflib.SequenceMatcher(None, fa, fb, autojunk=False).get_opcodes():
        if code == "equal":
            ops.append(["=", _morceau(apres, b, j1, j2)])
            continue
        if i2 > i1:
            ops.append(["-", _morceau(avant, a, i1, i2)])
        if j2 > j1:
            ops.append(["+", _morceau(apres, b, j1, j2)])
    return ops


def diff_mots(avant: str, apres: str) -> dict:
    """{format, operations: [[« = » | « - » | « + », texte]], mots_supprimes, mots_ajoutes}.

    Deux niveaux : les alinéas (lignes) d'abord, puis mot à mot dans chaque bloc d'alinéas
    remplacé. Les « = » et « + » recomposent `apres`, les « = » et « - » `avant` (à l'espacement
    près). Rien ne change (typographie comprise) : `operations` est []."""
    la, lb = re.split(r"(?<=\n)", avant or ""), re.split(r"(?<=\n)", apres or "")
    cle = lambda l: tuple(x[0] for x in jetons(l))
    ka, kb = [cle(l) for l in la], [cle(l) for l in lb]
    ops = []
    for code, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ka, kb, autojunk=False).get_opcodes():
        if code == "equal":
            ops.append(["=", "".join(lb[j1:j2])])
        elif code == "replace":
            ops += _mots_a_mots("".join(la[i1:i2]), "".join(lb[j1:j2]))
        elif code == "delete":
            ops.append(["-", "".join(la[i1:i2])])
        else:
            ops.append(["+", "".join(lb[j1:j2])])
    fusion = []
    for op, texte in ops:
        if not texte:
            continue
        if fusion and fusion[-1][0] == op:
            fusion[-1][1] += texte
        else:
            fusion.append([op, texte])
    compte = lambda signe: sum(_mots(x[0] for x in jetons(t)) for op, t in fusion if op == signe)
    supprimes, ajoutes = compte("-"), compte("+")
    if not supprimes and not ajoutes and not any(op != "=" and jetons(t) for op, t in fusion):
        fusion = []
    return {"format": FORMAT, "operations": fusion, "mots_supprimes": supprimes, "mots_ajoutes": ajoutes}


def change(diff: dict) -> bool:
    return bool(diff["operations"])


def ajouts(diff: dict) -> list[str]:
    return [t for op, t in diff["operations"] if op == "+"]


# Désignation de l'article visé ----------------------------------------------------------------
ADDITIONNEL_SENAT = re.compile(r"^articles?\s*(?:\(s\))?\s+additionnels?\s*(?:\(s\))?\s+(avant|après)\s+l['’]\s*article\s+(.+)$",
                               re.I)


def vise(designation: str | None, position: str | None = None) -> tuple[str, str] | None:
    """(« article » | « apres » | « avant », numéro) que désigne un amendement, ou None.

    AN : `titre` (« Article 3 bis », « Article PREMIER ») et `avant_A_Apres` (« A », « Après »,
    « Avant ») ; Sénat : `sub.lib` (« Article 4 (précédemment examiné) », « Article(s)
    additionnel(s) après l'article 4 »). Un titre, un chapitre, un intitulé : None (pas un article)."""
    t = re.sub(r"\s+", " ", (designation or "").replace("\xa0", " ")).strip()
    if m := ADDITIONNEL_SENAT.match(t):
        numero = numero_article(f"Article {m.group(2)}")
        return ("apres" if m.group(1).lower() == "après" else "avant", numero) if numero else None
    numero = numero_article(t)
    if numero is None:
        return None
    sens = {"a": "article", "après": "apres", "apres": "apres", "avant": "avant"}.get((position or "A").strip().lower())
    return (sens, numero) if sens else None


def racine(numero: str) -> str:
    """« 3 bis A » -> « 3 » : l'article autour duquel un article inséré prend son numéro."""
    return numero.split(" ")[0]


def vise_article(cible: tuple[str, str] | None, numero: str, nouveau: bool) -> bool:
    """L'amendement porte-t-il sur l'article `numero` ? Un article existant : désigné par son
    numéro. Un article inséré (« 3 bis ») : un article additionnel « après l'article 3… » ou
    « avant l'article 3… » (même racine) — un indice de candidat, pas une preuve."""
    if cible is None:
        return False
    sens, n = cible
    if sens == "article":
        return n == numero
    return nouveau and racine(n) == racine(numero)


# Dispositif ----------------------------------------------------------------------------------
def texte_dispositif(dispositif: str | None) -> str:
    """Dispositif (AN ou AMELI, texte ou HTML) -> texte, un paragraphe par ligne."""
    t = texte_html((dispositif or "").replace("\\r", "").replace("\\n", "\n"))
    return "\n".join(l for l in (re.sub(r"[ \t\xa0 ]+", " ", x).strip() for x in t.split("\n")) if l)


def citations(dispositif: str | None) -> list[str]:
    """Passages entre guillemets du dispositif. Un passage sur plusieurs alinéas ouvre chaque
    alinéa par « et ne se ferme qu'au dernier : chaque alinéa est un passage."""
    passages = []
    for ligne in texte_dispositif(dispositif).split("\n"):
        for m in re.finditer(r"«\s*(.*?)\s*(?:»|$)", ligne):
            p = m.group(1).strip(" .;,")
            if p:
                passages.append(p)
    return passages


SUPPRESSION_ARTICLE = re.compile(r"^supprimer (?:cet|l['’]) ?article\.?$", re.I)
INSERTION = re.compile(r"\b(?:insérer|rédiger|remplacer|substituer|compléter|ajouter|rétablir|ainsi rédigé)", re.I)


def _contient(formes: list[str], passage: list[str]) -> bool:
    if not passage:
        return False
    sep = "\x1f"
    return f"{sep}{sep.join(passage)}{sep}" in f"{sep}{sep.join(formes)}{sep}"


# « substituer aux mots : », « remplacer le mot : », « supprimer les mots : », « après les mots : » :
# le passage qui suit cite le texte existant (une référence), pas le texte inséré.
REFERENCE = re.compile(r"(?:substituer\s+aux?|remplacer\s+l(?:es|e|a)|supprimer\s+l(?:es|e|a)|après\s+l(?:es|e|a)|"
                       r"avant\s+l(?:es|e|a))\s+mots?\s*:\s*$", re.I)


def references(dispositif: str | None) -> list[str]:
    """Passages que le dispositif cite comme texte existant : ils doivent être dans la version
    précédente (sinon l'amendement ne s'applique pas à ce changement)."""
    resultat, lignes = [], texte_dispositif(dispositif).split("\n")
    for i, ligne in enumerate(lignes):
        for m in re.finditer(r"«\s*(.*?)\s*»", ligne):
            if REFERENCE.search(ligne[:m.start()]):
                resultat.append(m.group(1))
        if i and REFERENCE.search(lignes[i - 1]) and not REFERENCE.search(ligne):
            resultat.append(ligne.strip(" «».;,"))
    return list(dict.fromkeys(r.strip(" .;,") for r in resultat if r.strip(" .;,")))


def passages(dispositif: str | None) -> list[str]:
    """Ce que le dispositif peut insérer : ses passages entre guillemets, et chacun de ses alinéas
    (un article additionnel, « Rédiger ainsi cet article : », donne le texte sans guillemets)."""
    lignes = [l.strip(" «»") for l in texte_dispositif(dispositif).split("\n")]
    return list(dict.fromkeys(p for p in [*citations(dispositif), *lignes] if p))


def preuve(dispositif: str | None, avant: str, apres: str, supprime_apres: bool, diff: dict) -> str | None:
    """Ce qui, dans le dispositif, se lit dans le changement — ou None.

    - « suppression » : « Supprimer cet article. » et l'article est désormais supprimé ;
    - « insere » : un passage du dispositif (≥ 3 mots, cf. `passages`) est dans la nouvelle version,
      pas dans la précédente, et chaque mot ajouté par le diff figure dans le dispositif (tout
      l'ajout s'explique par cet amendement) ;
    - « retire » : dispositif de suppression seule (« Supprimer les mots : « … » »), le passage
      cité était dans la version précédente et n'y est plus, et le diff n'ajoute rien.
    Un passage cité comme texte existant (« substituer aux mots : « … » ») absent de la version
    précédente : l'amendement ne porte pas sur ce changement, aucune preuve."""
    texte = texte_dispositif(dispositif)
    if SUPPRESSION_ARTICLE.match(texte.strip()) and supprime_apres:
        return "suppression"
    fa, fb = [x[0] for x in jetons(avant)], [x[0] for x in jetons(apres)]
    if any(not _contient(fa, [x[0] for x in jetons(r)]) for r in references(dispositif) if jetons(r)):
        return None
    vocabulaire = {x[0] for x in jetons(texte)}
    cites = [p for p in ([x[0] for x in jetons(c)] for c in citations(dispositif)) if _mots(p) >= MOTS_PREUVE]
    passages_ = [p for p in ([x[0] for x in jetons(c)] for c in passages(dispositif)) if _mots(p) >= MOTS_PREUVE]
    ajoutes = {x[0] for t in ajouts(diff) for x in jetons(t) if re.match(r"\w", x[0])}
    if any(_contient(fb, p) and not _contient(fa, p) for p in passages_) and ajoutes <= vocabulaire:
        return "insere"
    if not INSERTION.search(texte) and not ajoutes and any(_contient(fa, p) and not _contient(fb, p) for p in cites):
        return "retire"
    return None


# Attribution ---------------------------------------------------------------------------------
@dataclass(frozen=True)
class Amendement:
    """Un amendement examiné à l'étape qui produit la nouvelle version (lu dans sa source brute)."""
    identite: object                           # IdentiteNative
    numero: str
    cible: tuple[str, str] | None              # cf. `vise`
    sort: str                                  # adopte, adopte_modifie, rejete…
    dispositif: str | None = None
    libelle: str = ""


@dataclass(frozen=True)
class Attribution:
    origine: str                               # amendement, compromis_cmp, inconnue
    statut: str                                # VERIFIED, NEEDS_REVIEW
    amendement: object = None                  # IdentiteNative, seulement si VERIFIED
    candidats: tuple = ()                      # Amendement adoptés visant l'article
    motif: str = ""
    preuves: dict = field(default_factory=dict)  # numéro -> preuve lue (ou None)


def candidats(amendements, numero: str, nouveau: bool) -> list[Amendement]:
    """Amendements adoptés (avec ou sans modification) qui visent cet article à cette étape."""
    return [a for a in amendements if a.sort in ("adopte", "adopte_modifie") and vise_article(a.cible, numero, nouveau)]


def attribuer(diff: dict, avant: str, apres: str, supprime_apres: bool, numero: str, nouveau: bool,
              amendements: list[Amendement] | None, cmp: bool = False) -> Attribution:
    """Origine d'une modification. `amendements` : ceux de l'étape (None : aucun amendement connu
    pour cette étape, ex. transmission à l'autre chambre). `cmp` : la nouvelle
    version est le texte de la commission mixte paritaire (référence explicite DOSLEG)."""
    if cmp:
        return Attribution("compromis_cmp", "VERIFIED", motif="texte élaboré par la commission mixte paritaire")
    retenus = candidats(amendements or [], numero, nouveau)
    if not retenus:
        motif = ("aucun amendement connu pour l'étape qui produit cette version (transmission, examen sans "
                 "amendements publiés)" if amendements is None
                 else "aucun amendement adopté ne vise cet article à cette étape")
        return Attribution("inconnue", "NEEDS_REVIEW", motif=motif)
    preuves = {a.numero: preuve(a.dispositif, avant, apres, supprime_apres, diff) for a in retenus}
    if len(retenus) > 1:
        return Attribution("amendement", "NEEDS_REVIEW", candidats=tuple(retenus),
                           motif=f"{len(retenus)} amendements adoptés visent cet article", preuves=preuves)
    seul = retenus[0]
    if seul.sort != "adopte":
        return Attribution("amendement", "NEEDS_REVIEW", candidats=(seul,), preuves=preuves,
                           motif="amendement adopté avec modification : son texte n'est pas celui adopté")
    if preuves[seul.numero] is None:
        return Attribution("amendement", "NEEDS_REVIEW", candidats=(seul,), preuves=preuves,
                           motif="le texte du dispositif ne se retrouve pas dans le changement")
    return Attribution("amendement", "VERIFIED", seul.identite, (seul,), "seul amendement adopté, dispositif retrouvé",
                       preuves)
