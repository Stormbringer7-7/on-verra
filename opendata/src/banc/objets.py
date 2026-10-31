"""Objets de revue : pour chaque type de sujet, ce que le banc montre, ce qu'il demande, ce qui est
généré, le mode par défaut d'un lot et l'effet de l'issue.

Deux familles :
- `synthese.*` : un texte rédigé par un modèle (`analytique.affirmation`, état `GENERE`), jugé face
  au texte officiel ; on peut le dire fidèle ou non, le corriger, ou demander une régénération.
  Effet : l'affirmation passe `RELU` (version retenue) ou `REJETE`.
- `rapprochement.<type>` : un cas de `analytique.cas_revue` (un par type de `revue.TYPES`) ; on
  choisit un candidat ou « aucun », ou l'on constate. Effet : `revue.decider`.

Chaque formulaire a une note libre : un doute s'y écrit, le relecteur répond quand même (aucune
réponse « je ne sais pas »). Le mode est celui du lot, choisi à sa création (défaut ci-dessous) puis
figé : `OnlyOne` (la première réponse tranche), `Majority` (plus de 50 % des relecteurs du lot),
`Everyone` (tous, d'accord ; un désaccord part en arbitrage admin).
"""

from dataclasses import dataclass
from enum import Enum

from .. import revue


class Mode(str, Enum):
    ONLY_ONE = "OnlyOne"
    MAJORITY = "Majority"
    EVERYONE = "Everyone"


@dataclass(frozen=True)
class Champ:
    """Ce que le banc montre : `texte` (court), `officiel` (texte source, long), `genere` (à juger),
    `candidats`, `contexte` (JSON)."""
    cle: str
    libelle: str
    nature: str = "texte"


@dataclass(frozen=True)
class Reponse:
    """Une réponse possible. `texte` : le relecteur donne le texte corrigé ; `consigne` : il dit quoi
    changer à la régénération ; `par_candidat` : une réponse par candidat du cas (son indice)."""
    cle: str
    libelle: str
    aide: str = ""
    texte: bool = False
    consigne: bool = False
    par_candidat: bool = False


@dataclass(frozen=True)
class ObjetRevue:
    cle: str
    titre: str
    consigne: str                     # ce qu'on attend du relecteur
    source: str                       # "affirmation" ou "cas_revue"
    champs: tuple[Champ, ...]
    reponses: tuple[Reponse, ...]
    mode_defaut: Mode
    predicat: str | None = None       # affirmation : prédicat de la synthèse
    generation: str | None = None     # générateur (port `Generateur`) ; None : rien à générer


NATURES = ("texte", "officiel", "genere", "candidats", "contexte")

JUGER_SYNTHESE = (
    Reponse("fidele", "Fidèle", "dit ce que dit le texte, rien de plus"),
    Reponse("infidele", "Non fidèle", "fausse, inversée ou trompeuse"),
    Reponse("corrigee", "Corrigée", "le texte corrigé remplace la synthèse", texte=True),
    Reponse("a_regenerer", "À régénérer", "dire quoi changer", consigne=True),
)

SYNTHESES = (
    ObjetRevue(
        "synthese.expose_amendement", "Synthèses d'amendement",
        "La synthèse dit-elle ce que l'amendement change (dispositif) et pourquoi selon son auteur (exposé des motifs) ?",
        "affirmation",
        (Champ("libelle", "Amendement"), Champ("dossier", "Texte de loi"),
         Champ("dispositif", "Dispositif (ce qu'il change)", "officiel"),
         Champ("expose", "Exposé des motifs (pourquoi)", "officiel"), Champ("synthese", "Synthèse du modèle", "genere")),
        JUGER_SYNTHESE, Mode.ONLY_ONE, predicat="expose_amendement", generation="synthese.expose_amendement"),
    # Les textes sont plus compliqués à juger qu'un amendement : jamais un seul relecteur par défaut.
    ObjetRevue(
        "synthese.resume_dossier", "Synthèses de texte de loi",
        "La synthèse dit-elle ce que le texte change, pour qui, et où il en est, sans rien ajouter (gage, auteur) ?",
        "affirmation",
        (Champ("dossier", "Texte de loi"), Champ("version", "Version (initial, final)"),
         Champ("texte", "Texte officiel", "officiel"), Champ("synthese", "Synthèse du modèle", "genere")),
        JUGER_SYNTHESE, Mode.MAJORITY, predicat="resume_dossier", generation="synthese.resume_dossier"),
)

# Cas où l'on dit qui est qui (personne, acteur, entité) : plusieurs relecteurs par défaut. Les autres
# (amendement, étape, article cités ; constats) : un seul.
IDENTITES = {"correspondance_a_revoir", "identite_membre_gouvernement", "identite_senateur_ancien_depute",
             "identite_declarant", "orateur_commission", "orateur_sans_identifiant", "elu_local", "fusion_entites"}

CHAMPS_CAS = (Champ("constat", "Constat"), Champ("sujet_identite", "Sujet"), Champ("champ", "Champ renseigné"),
              Champ("candidats", "Candidats", "candidats"), Champ("contexte", "Contexte", "contexte"))
DECIDER_CAS = (Reponse("candidat", "Ce candidat", par_candidat=True),
               Reponse("aucun", "Aucun", "personne parmi les candidats"),
               Reponse("constate", "Constaté", "cas de constat : rien à choisir"))


def _rapprochement(type_: str, titre: str, consigne: str) -> ObjetRevue:
    return ObjetRevue(f"rapprochement.{type_}", titre, consigne, "cas_revue", CHAMPS_CAS, DECIDER_CAS,
                      Mode.MAJORITY if type_ in IDENTITES else Mode.ONLY_ONE)


OBJETS: dict[str, ObjetRevue] = {o.cle: o for o in (
    *SYNTHESES, *(_rapprochement(t, titre, consigne) for t, (titre, consigne) in revue.TYPES.items()))}


def objet(cle: str) -> ObjetRevue:
    if cle not in OBJETS:
        raise KeyError(f"objet de revue inconnu : {cle}")
    return OBJETS[cle]


def objet_du_cas(type_cas: str) -> ObjetRevue:
    """Un type de cas absent de `revue.TYPES` (nouveau, pas encore décrit) reste relisible, en `OnlyOne`."""
    return OBJETS.get(f"rapprochement.{type_cas}") or _rapprochement(type_cas, type_cas, "")
