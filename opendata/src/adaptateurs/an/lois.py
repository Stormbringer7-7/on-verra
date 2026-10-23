"""Complète les lois avec leur parcours législatif et rattache 49.3 et motions de censure aux textes."""

from ...etl import Contexte, Etape, Ligne

PROCEDURES_NON_LEGISLATIVES = {
    "Engagement de la responsabilité gouvernementale",
    "Déclaration du gouvernement avec ou sans vote sans engagement de responsabilité",
}
# Délai maximal entre un engagement de responsabilité et le vote de la motion qui le vise.
JOURS_MOTION = 7


def executer(ctx: Contexte):
    """Parcours législatif des lois, et lois adoptées par 49.3 sans vote final à l'Assemblée."""
    db, dossiers, nb_scrutins = ctx.db, ctx.artefacts["an.dossiers_cumules"], ctx.artefacts["an.nb_scrutins"]
    for ref, info in dossiers.items():
        # Certains 49.3 ont aussi un dossier propre (procédure "Engagement de la responsabilité
        # gouvernementale") qui doublonne celui de la loi : seuls les dossiers de textes comptent.
        if info["engagements"] and info["procedure"] not in PROCEDURES_NON_LEGISLATIVES:
            ctx.chargeur.ecrire(Ligne("lois", {"id": ref, "dossier_ref": ref, "titre": info["titre"],
                                               "procedure": info["procedure"]}, conflit="ignorer"))
    for (ref,) in db.execute("SELECT dossier_ref FROM lois WHERE dossier_ref IS NOT NULL").fetchall():
        info = dossiers.get(ref)
        if not info:
            continue
        db.execute("UPDATE lois SET legislature = ?, procedure_acceleree = ?, cmp = ?, saisine_cc = ?, "
                   "decision_cc = ?, promulgation = ?, nb_scrutins = ? WHERE id = ?",
                   (info["legislature"], info["acceleree"], info["cmp"], info["saisine_cc"],
                    info["decision_cc"], info["promulgation"], nb_scrutins[ref], ref))
        for e in info["engagements"] if info["procedure"] not in PROCEDURES_NON_LEGISLATIVES else []:
            engagement = ctx.chargeur.ecrire(Ligne("engagements_49_3", {
                "loi_id": ref, "etape": e["etape"], "date": e["date"], "issue": e["issue"]}, conflit="inserer"))
            for vote_ref, _ in e["motions"]:
                db.execute("UPDATE motions_censure SET loi_id = ?, engagement_id = ? WHERE scrutin_uid = ?",
                           (ref, engagement, vote_ref))
    # En 15e et 16e, les motions ne portent pas de référence de scrutin dans les dossiers : on les
    # rattache par la date, sans deviner. Candidats = engagements des JOURS_MOTION jours précédents.
    # Texte retenu s'ils visent tous le même ; engagement retenu s'il est seul.
    for uid, date in db.execute("SELECT scrutin_uid, date FROM motions_censure "
                                "WHERE article = '49-3' AND loi_id IS NULL").fetchall():
        candidats = db.execute(
            "SELECT id, loi_id FROM engagements_49_3 "
            "WHERE date <= ? AND julianday(?) - julianday(date) <= ?",
            (date, date, JOURS_MOTION)).fetchall()
        if len({loi for _, loi in candidats}) == 1:
            db.execute("UPDATE motions_censure SET loi_id = ?, engagement_id = ? WHERE scrutin_uid = ?",
                       (candidats[0][1], candidats[0][0] if len(candidats) == 1 else None, uid))
    # Lois rattachées par leur seul titre : législature tirée de leurs scrutins.
    db.execute("UPDATE lois SET legislature = (SELECT MIN(legislature) FROM scrutins WHERE loi_id = lois.id) "
               "WHERE legislature IS NULL")
    nb_49_3 = db.execute("SELECT COUNT(*), COUNT(DISTINCT loi_id) FROM engagements_49_3").fetchone()
    print(f"{nb_49_3[0]} recours au 49.3 sur {nb_49_3[1]} textes")


ETAPE = Etape("an.lois", executer, apres=("an.scrutins",),
              description="parcours des lois, lois adoptées par 49.3, rattachement des motions de censure")
