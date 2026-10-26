-- Territoires des parlementaires (écran Carte, Département). Le département d'un mandat est celui
-- que publie la chambre (lien `territoire` mandat → département ou collectivité d'outre-mer de
-- l'INSEE : AMO pour les députés, table `elusen` de l'export du Sénat pour les sénateurs) ; jamais
-- déduit d'un nom. Français établis hors de France : aucun territoire du COG, absents de la carte.

-- Départements et collectivités d'outre-mer du COG, par leur code INSEE.
CREATE TABLE lecture.departement AS
SELECT o.entite_id, c.id_source AS code, o.nom, c.type_source AS nature
FROM canon.organisation o
JOIN canon.correspondance c ON c.entite_id = o.entite_id AND c.systeme = 'INSEE' AND c.statut = 'VERIFIED'
     AND c.type_source IN ('departement', 'collectivite_outre_mer')
JOIN canon.entite e ON e.entite_id = o.entite_id AND e.retiree_de_la_source_le IS NULL;
CREATE UNIQUE INDEX ON lecture.departement (code);

-- Un mandat parlementaire (identifiant officiel de sa chambre) et son département, datés.
CREATE TABLE lecture.elu_departement AS
SELECT f.personne_id, CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END AS chambre, d.code,
       NULLIF(l.attributs ->> 'circonscription', '') AS circonscription,
       f.debut, COALESCE(f.fin, DATE '9999-12-31') AS fin
FROM canon.fonction f
JOIN canon.correspondance c ON c.entite_id = f.entite_id AND c.methode = 'OFFICIAL_ID' AND c.statut = 'VERIFIED'
     AND c.systeme = CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END
JOIN canon.entite e ON e.entite_id = f.entite_id AND e.retiree_de_la_source_le IS NULL
JOIN canon.lien l ON l.de_id = f.entite_id AND l.nature = 'territoire'
JOIN lecture.departement d ON d.entite_id = l.vers_id
WHERE f.type IN ('depute', 'senateur') AND f.debut IS NOT NULL;
CREATE INDEX ON lecture.elu_departement (personne_id, chambre, debut);
CREATE INDEX ON lecture.elu_departement (code, chambre);

-- Un scrutin, département par département : les élus du département en mandat ce jour-là et leurs
-- votes publiés (absent : en mandat, sans vote publié). Une vue : la lire pour un scrutin ne touche
-- que ses quelques centaines d'élus, alors que la calculer pour tous les scrutins prend plus d'une
-- minute à chaque reconstruction.
CREATE VIEW lecture.carte_scrutin AS
SELECT p.scrutin_id, ed.code, count(*) AS membres,
       count(*) FILTER (WHERE v.position = 'pour') AS pour,
       count(*) FILTER (WHERE v.position = 'contre') AS contre,
       count(*) FILTER (WHERE v.position = 'abstention') AS abstention,
       count(*) FILTER (WHERE v.position = 'non_votant') AS non_votants,
       count(*) FILTER (WHERE v.personne_id IS NULL) AS absents
FROM lecture.participation_scrutin p
JOIN lecture.elu_departement ed ON ed.personne_id = p.personne_id AND ed.chambre = p.chambre
     AND p.date BETWEEN ed.debut AND ed.fin
LEFT JOIN canon.vote v ON v.scrutin_id = p.scrutin_id AND v.personne_id = p.personne_id
GROUP BY p.scrutin_id, ed.code;

-- Participation d'un élu sur l'année civile en cours de sa chambre (lecture.indicateur_participation :
-- comparée à celle de son groupe sur les mêmes scrutins, 20_participation.sql), avec sa période.
CREATE TABLE lecture.presence_elu AS
WITH annee AS (
    SELECT chambre, max(annee) AS annee FROM lecture.indicateur_participation GROUP BY chambre
), periode AS (
    SELECT a.chambre, a.annee, make_date(a.annee, 1, 1) AS debut, max(s.date) AS fin
    FROM annee a JOIN canon.scrutin s ON s.chambre = a.chambre AND extract(year FROM s.date) = a.annee
    GROUP BY a.chambre, a.annee
)
SELECT i.personne_id, i.chambre, pe.debut, pe.fin, i.scrutins AS occasions, i.participations,
       i.taux, i.taux_attendu, i.ecart_points
FROM lecture.indicateur_participation i
JOIN periode pe ON pe.chambre = i.chambre AND pe.annee = i.annee;
CREATE UNIQUE INDEX ON lecture.presence_elu (personne_id, chambre);

-- Participation des élus actuels d'un département, mise en commun (participations sur votes
-- possibles), comparée à l'attendu de leurs groupes sur les mêmes scrutins, pondéré de même.
CREATE TABLE lecture.presence_departement AS
SELECT ed.code, p.chambre, min(p.debut) AS debut, max(p.fin) AS fin, count(DISTINCT p.personne_id) AS elus,
       sum(p.occasions) AS occasions, sum(p.participations) AS participations,
       round(100.0 * sum(p.participations) / NULLIF(sum(p.occasions), 0), 1) AS taux,
       round(sum(p.taux_attendu * p.occasions) / NULLIF(sum(p.occasions), 0), 1) AS taux_attendu
FROM lecture.elu_departement ed
JOIN lecture.presence_elu p ON p.personne_id = ed.personne_id AND p.chambre = ed.chambre
WHERE CURRENT_DATE BETWEEN ed.debut AND ed.fin
GROUP BY ed.code, p.chambre;
CREATE UNIQUE INDEX ON lecture.presence_departement (chambre, code);
