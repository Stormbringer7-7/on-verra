-- Présence en commission (AN, publiée par l'agenda : présent, excusé, absent), comparée à la
-- moyenne de la même commission sur la même année. « Excusé » est distingué d'« absent ».

CREATE TABLE lecture.indicateur_commission AS
WITH p AS (
    SELECT pa.personne_id, r.organe_id, extract(year FROM r.debut)::int AS annee, pa.presence
    FROM canon.participation pa JOIN canon.reunion r ON r.entite_id = pa.reunion_id
    WHERE r.type = 'commission' AND r.debut IS NOT NULL
), par_personne AS (
    SELECT personne_id, organe_id, annee, count(*) AS reunions,
           count(*) FILTER (WHERE presence = 'present') AS presences,
           count(*) FILTER (WHERE presence = 'excuse') AS excuses,
           count(*) FILTER (WHERE presence = 'absent') AS absences
    FROM p GROUP BY personne_id, organe_id, annee
)
SELECT x.*, round(100.0 * x.presences / NULLIF(x.reunions, 0), 1) AS taux,
       round(100.0 * avg(x.presences::numeric / NULLIF(x.reunions, 0)) OVER (PARTITION BY x.organe_id, x.annee), 1)
           AS taux_moyen_commission
FROM par_personne x;
