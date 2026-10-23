"""Indicateurs par député (schema/50_indicateurs.sql) : participation et dissidence par législature,
activité par mois et par texte."""

import sqlite3

from ..etl import Etape

REQ_INDICATEURS = """
INSERT INTO indicateurs_deputes
WITH en_fonction AS (
    SELECT DISTINCT s.uid AS scrutin_uid, s.legislature, m.acteur_ref
    FROM scrutins s
    JOIN mandats m
      ON m.legislature = s.legislature
     AND m.date_debut <= s.date
     AND (m.date_fin IS NULL OR m.date_fin >= s.date)
),
detail AS (
    SELECT f.acteur_ref, f.legislature, v.position, v.par_delegation, v.cause,
           v.position IN ('pour', 'contre', 'abstention') AS exprime,
           CASE WHEN g.abrege != 'NI' THEN pg.ligne END AS ligne
    FROM en_fonction f
    LEFT JOIN votes v ON v.scrutin_uid = f.scrutin_uid AND v.acteur_ref = f.acteur_ref
    LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref
    LEFT JOIN positions_groupes pg ON pg.scrutin_uid = v.scrutin_uid AND pg.groupe_ref = v.groupe_ref
)
SELECT acteur_ref, legislature,
       COUNT(*),
       SUM(CASE WHEN cause IN ('PAN', 'PSE', 'MG') THEN 1 ELSE 0 END),
       SUM(CASE WHEN exprime THEN 1 ELSE 0 END),
       SUM(CASE WHEN exprime AND par_delegation THEN 1 ELSE 0 END),
       SUM(CASE WHEN exprime AND ligne IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN exprime AND ligne IS NOT NULL AND position != ligne THEN 1 ELSE 0 END)
FROM detail
GROUP BY acteur_ref, legislature
"""


REQ_ACTIVITE = """
INSERT INTO activite_deputes
SELECT v.acteur_ref, s.legislature, substr(s.date, 1, 7), COALESCE(s.loi_id, s.uid),
       COUNT(*),
       SUM(CASE WHEN v.position IN ('pour', 'contre', 'abstention') THEN 1 ELSE 0 END),
       SUM(CASE WHEN v.position = 'pour' THEN 1 ELSE 0 END),
       -- Groupe inconnu ou non-inscrit : pas de ligne commune, donc pas d'écart.
       SUM(CASE WHEN v.position IN ('pour', 'contre', 'abstention') AND g.abrege IS NOT NULL AND g.abrege != 'NI'
                 AND pg.ligne IS NOT NULL AND v.position != pg.ligne THEN 1 ELSE 0 END)
FROM scrutins s
JOIN votes v ON v.scrutin_uid = s.uid
LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref
LEFT JOIN positions_groupes pg ON pg.scrutin_uid = s.uid AND pg.groupe_ref = v.groupe_ref
GROUP BY v.acteur_ref, s.legislature, substr(s.date, 1, 7), COALESCE(s.loi_id, s.uid)
"""


def calculer(db: sqlite3.Connection):
    db.execute("DELETE FROM indicateurs_deputes")
    db.execute(REQ_INDICATEURS)
    db.execute("DELETE FROM activite_deputes")
    db.execute(REQ_ACTIVITE)


ETAPE = Etape("indicateurs", lambda ctx: calculer(ctx.db),
              description="participation, délégations, dissidences ; activité par député, mois et texte")
