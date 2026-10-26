-- Position gauche-droite de chaque groupe politique (0 = gauche, 1 = droite), d'après les sièges
-- publiés : la place médiane de ses membres dans l'hémicycle. Sert à ordonner les groupes de gauche
-- à droite et, sans couleur connue, à colorer le groupe (12_couleur_groupe.sql).
--   AN (source 'sieges_an') : `canon.vote.siege` (`numPlace`), le dernier siège publié de chaque
--        député dans le groupe ; l'AN numérote de la droite (≈ 1) vers la gauche (≈ 650), d'où
--        position = 1 - (siège médian - plus petit siège) / (plus grand - plus petit). C'est l'ordre
--        des numéros, pas un angle mesuré sur le plan de la salle.
--   Sénat : aucune position. Les numéros de siège sont chargés (lien `siege`), mais la numérotation
--        ne suit pas l'ordre gauche-droite et aucun plan de la salle n'est publié.
-- Un groupe sans siège publié (anciens groupes, Sénat) n'a pas de ligne.

CREATE TABLE lecture.position_groupe AS
WITH siege AS (
    SELECT DISTINCT ON (v.personne_id, v.groupe_id) v.groupe_id, v.siege
    FROM canon.vote v
    JOIN canon.scrutin s ON s.entite_id = v.scrutin_id AND s.chambre = 'AN'
    JOIN canon.entite e ON e.entite_id = s.entite_id AND e.retiree_de_la_source_le IS NULL
    WHERE v.siege IS NOT NULL AND v.groupe_id IS NOT NULL
    ORDER BY v.personne_id, v.groupe_id, s.date DESC
), bornes AS (
    SELECT min(siege) AS bas, max(siege) AS haut FROM siege
)
SELECT g.groupe_id, 'AN'::text AS chambre,
       round((1 - (percentile_cont(0.5) WITHIN GROUP (ORDER BY g.siege) - b.bas) / NULLIF(b.haut - b.bas, 0))::numeric, 4)
           AS position,
       count(*)::int AS membres, 'sieges_an'::text AS source
FROM siege g CROSS JOIN bornes b
GROUP BY g.groupe_id, b.bas, b.haut;
CREATE UNIQUE INDEX ON lecture.position_groupe (groupe_id);
