-- Participation aux scrutins publics, comparée à l'attendu : la participation de son groupe sur
-- le MÊME scrutin. Un vote de nuit à 40 votants n'est pas une absence anormale.
--   a_participe : un vote nominatif est publié pour la personne (pour, contre, abstention,
--                 non-votant ; délégation comprise) ;
--   attendu     : part des membres du groupe en mandat ce jour-là qui ont participé.
-- Non pris en compte (la donnée ne le dit pas) : mises au point, déports, présence en commission
-- au même moment (l'heure des scrutins n'est pas publiée).

CREATE TABLE lecture.participation_scrutin AS
SELECT s.entite_id AS scrutin_id, s.chambre, s.date, s.legislature, m.personne_id,
       (SELECT a.groupe_id FROM lecture.appartenance_groupe a
         WHERE a.personne_id = m.personne_id AND a.chambre = s.chambre AND s.date BETWEEN a.debut AND a.fin
         ORDER BY a.debut DESC LIMIT 1) AS groupe_id,
       (v.personne_id IS NOT NULL) AS a_participe, COALESCE(v.par_delegation, false) AS par_delegation
FROM canon.scrutin s
JOIN lecture.mandat_parlementaire m ON m.chambre = s.chambre AND s.date BETWEEN m.debut AND m.fin
LEFT JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.personne_id = m.personne_id;
CREATE INDEX ON lecture.participation_scrutin (scrutin_id, groupe_id);
CREATE INDEX ON lecture.participation_scrutin (personne_id);

CREATE TABLE lecture.participation_groupe_scrutin AS
SELECT scrutin_id, groupe_id, count(*) AS membres_en_mandat, count(*) FILTER (WHERE a_participe) AS participants,
       avg(a_participe::int)::numeric AS taux
FROM lecture.participation_scrutin WHERE groupe_id IS NOT NULL
GROUP BY scrutin_id, groupe_id;

-- Par personne et par année : participation réelle, attendue, écart en points.
CREATE TABLE lecture.indicateur_participation AS
SELECT p.personne_id, p.chambre, extract(year FROM p.date)::int AS annee,
       count(*) AS scrutins, count(*) FILTER (WHERE p.a_participe) AS participations,
       count(*) FILTER (WHERE p.par_delegation) AS par_delegation,
       round(100.0 * avg(p.a_participe::int), 1) AS taux,
       round(100.0 * avg(g.taux), 1) AS taux_attendu,
       round(100.0 * (avg(p.a_participe::int) - avg(g.taux)), 1) AS ecart_points
FROM lecture.participation_scrutin p
JOIN lecture.participation_groupe_scrutin g USING (scrutin_id, groupe_id)
GROUP BY p.personne_id, p.chambre, extract(year FROM p.date);
