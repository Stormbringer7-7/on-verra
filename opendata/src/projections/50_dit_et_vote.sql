-- Ce qu'une personne a dit et ce qu'elle a voté, sur le même objet : ses interventions mises à côté
-- de son vote, sans jugement. Deux niveaux, chacun par lien explicite uniquement :
--   amendement : intervention reliée à l'amendement que le scrutin met aux voix ;
--   ensemble   : intervention reliée au dossier dont le scrutin vote l'ensemble (ou l'article unique).
-- La présidence de séance (« La parole est à… ») n'est pas une prise de position : exclue, telle que
-- publiée (qualité au Sénat, libellé à l'AN).

CREATE TABLE lecture.dit_et_vote AS
WITH propos AS (
    SELECT i.entite_id, i.orateur_id, i.amendement_id, i.dossier_id, r.debut::date AS jour
    FROM canon.intervention i
    JOIN canon.reunion r ON r.entite_id = i.reunion_id
    WHERE i.orateur_id IS NOT NULL
      AND i.qualite IS DISTINCT FROM 'président de séance'
      AND i.orateur_libelle NOT IN ('M. le président', 'Mme la présidente')
), paires AS (
    SELECT 'amendement' AS niveau, p.orateur_id, s.entite_id AS scrutin_id, p.entite_id AS intervention_id, p.jour
    FROM propos p
    JOIN canon.scrutin s ON s.amendement_id = p.amendement_id
    UNION ALL
    SELECT 'ensemble', p.orateur_id, s.entite_id, p.entite_id, p.jour
    FROM propos p
    JOIN canon.scrutin s ON s.dossier_id = p.dossier_id AND s.nature IN ('ensemble', 'article_unique')
)
SELECT p.niveau, v.personne_id, s.entite_id AS scrutin_id, s.chambre, s.date AS date_scrutin,
       v.position, v.par_delegation,
       count(*) AS interventions,
       count(*) FILTER (WHERE p.jour <= s.date) AS avant_le_vote,
       min(p.jour) AS premiere, max(p.jour) AS derniere,
       array_agg(p.intervention_id ORDER BY p.jour, p.intervention_id) AS intervention_ids
FROM paires p
JOIN canon.scrutin s ON s.entite_id = p.scrutin_id
JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.personne_id = p.orateur_id
GROUP BY p.niveau, v.personne_id, s.entite_id, s.chambre, s.date, v.position, v.par_delegation;
