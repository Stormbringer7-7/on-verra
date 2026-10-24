-- Écarts au groupe : un vote exprimé (pour, contre, abstention) différent de la position
-- majoritaire de son groupe sur ce scrutin, seulement quand le groupe a une majorité nette
-- (position recalculée depuis le décompte, cf. adaptateur scrutins). Contre et abstention distingués.

CREATE TABLE lecture.vote_et_groupe AS
SELECT v.scrutin_id, s.chambre, s.date, v.personne_id, v.groupe_id, v.position, pg.position_majoritaire,
       (v.position IN ('pour', 'contre', 'abstention') AND pg.position_majoritaire IS NOT NULL) AS exprime_en_groupe,
       (v.position IN ('pour', 'contre', 'abstention') AND pg.position_majoritaire IS NOT NULL
        AND v.position <> pg.position_majoritaire) AS ecart
FROM canon.vote v
JOIN canon.scrutin s ON s.entite_id = v.scrutin_id
LEFT JOIN canon.position_groupe pg ON pg.scrutin_id = v.scrutin_id AND pg.groupe_id = v.groupe_id;

CREATE TABLE lecture.indicateur_ecarts AS
SELECT personne_id, chambre, extract(year FROM date)::int AS annee,
       count(*) FILTER (WHERE exprime_en_groupe) AS votes_en_groupe,
       count(*) FILTER (WHERE ecart) AS ecarts,
       count(*) FILTER (WHERE ecart AND position = 'contre') AS ecarts_contre,
       count(*) FILTER (WHERE ecart AND position = 'abstention') AS ecarts_abstention,
       count(*) FILTER (WHERE ecart AND position = 'pour') AS ecarts_pour
FROM lecture.vote_et_groupe GROUP BY personne_id, chambre, extract(year FROM date);
