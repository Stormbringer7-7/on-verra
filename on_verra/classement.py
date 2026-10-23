"""Classement des lois en trois niveaux d'importance, avec un indice de saillance.

Le niveau dit pourquoi une loi compte (critères explicites, stockés dans lois.raisons) ;
la saillance trie les lois à l'intérieur d'un même niveau.
"""

import math
import re
import sqlite3

# Textes majeurs par nature : budget de l'État, budget de la Sécurité sociale, Constitution.
NATURES_MAJEURES = ("loi de finances", "financement de la sécurité sociale", "constitutionnelle")
NATURE_TECHNIQUE = "ratification des traités"
# Pour les lois sans dossier (nature inconnue), la ratification se lit dans le titre.
RE_RATIFICATION = re.compile(r"autorisant (?:la ratification|l'approbation|l'adhésion)", re.IGNORECASE)

# Seuil de la règle "consensuel et peu suivi" : aucun vote contre et moins de 100 votants.
VOTANTS_FAIBLE = 100
# Au-delà de ce nombre de scrutins sur un texte, la composante "débat" est à son maximum.
SCRUTINS_MAX = 300
POIDS = {"participation": 40, "debat": 40, "clivage": 20}
SIEGES = 577

REQ_AGREGATS = """
SELECT l.id, l.titre, l.procedure, l.saisine_cc, COALESCE(l.nb_scrutins, 0) AS nb_scrutins,
       (SELECT COUNT(*) FROM engagements_49_3 e WHERE e.loi_id = l.id) AS nb_49_3,
       (SELECT MAX(adoptee) FROM motions_censure m WHERE m.loi_id = l.id) AS censure,
       COUNT(s.uid) AS nb_finaux,
       MAX(s.type_vote LIKE '%solennel%') AS solennel,
       MAX(s.nb_votants) AS votants_max,
       MAX(s.contre) AS contre_max
FROM lois l LEFT JOIN scrutins s ON s.loi_id = l.id
GROUP BY l.id
"""

# Vote final le plus suivi : c'est lui qui mesure le clivage.
REQ_VOTE_PRINCIPAL = """
SELECT pour, contre FROM scrutins WHERE loi_id = ? ORDER BY nb_votants DESC, date DESC LIMIT 1
"""


def niveau(loi: sqlite3.Row) -> tuple[str, list[str]]:
    procedure = (loi["procedure"] or "").lower()
    raisons = []
    if any(n in procedure for n in NATURES_MAJEURES):
        raisons.append(loi["procedure"])
    if loi["solennel"]:
        raisons.append("vote solennel")
    if loi["saisine_cc"]:
        raisons.append("saisine du Conseil constitutionnel")
    if loi["nb_49_3"]:
        raisons.append(f"49.3 ×{loi['nb_49_3']}" + (" (gouvernement censuré)" if loi["censure"] else ""))
    if raisons:
        return "majeure", raisons

    if NATURE_TECHNIQUE in procedure or RE_RATIFICATION.search(loi["titre"].replace("’", "'")):
        return "technique", ["ratification de traité"]
    if loi["nb_finaux"] and not loi["contre_max"] and (loi["votants_max"] or 0) < VOTANTS_FAIBLE:
        return "technique", [f"aucun vote contre, moins de {VOTANTS_FAIBLE} votants"]
    return "standard", []


def saillance(db: sqlite3.Connection, loi: sqlite3.Row) -> float:
    """Moyenne pondérée des composantes disponibles, sur 100.

    participation : votants du vote final le plus suivi / 577
    debat         : nombre de scrutins sur le texte, en échelle log, plafonné à SCRUTINS_MAX
    clivage       : 1 - |pour - contre| / (pour + contre) sur ce même vote
    Une loi adoptée par 49.3 sans vote final n'a que la composante débat.
    """
    composantes = {"debat": min(1.0, math.log1p(loi["nb_scrutins"]) / math.log1p(SCRUTINS_MAX))}
    if loi["nb_finaux"]:
        composantes["participation"] = min(1.0, loi["votants_max"] / SIEGES)
        pour, contre = db.execute(REQ_VOTE_PRINCIPAL, (loi["id"],)).fetchone()
        if pour + contre:
            composantes["clivage"] = 1 - abs(pour - contre) / (pour + contre)
    total = sum(POIDS[k] for k in composantes)
    return round(100 * sum(POIDS[k] * v for k, v in composantes.items()) / total, 1)


def classer_lois(db: sqlite3.Connection):
    db.row_factory = sqlite3.Row
    for loi in db.execute(REQ_AGREGATS).fetchall():
        n, raisons = niveau(loi)
        db.execute("UPDATE lois SET niveau = ?, saillance = ?, raisons = ? WHERE id = ?",
                   (n, saillance(db, loi), "; ".join(raisons) or None, loi["id"]))
    db.row_factory = None
