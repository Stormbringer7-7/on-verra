-- Amendements vus par l'Explorer (API, faits filtrés) : une ligne par amendement vivant, sans son
-- texte, ses dimensions déjà calculées. Sans elle, chaque suggestion sans filtre cherchait, pour
-- chacun des 171 770 amendements, son groupe auteur et son premier auteur (11 s et 2,7 s au 25/10/2026).
--   - groupe : le groupe auteur publié (lien `groupe_auteur` ; un seul par amendement en base) ;
--   - auteur : le premier auteur personne (lien `auteur`, par ordre publié) ;
--   - cle : case du parcours de l'étape de l'amendement, pour son dossier.
-- Les filtres groupe et personne restent lus dans `canon.lien` (tout groupe auteur, tout auteur).

CREATE TABLE lecture.fait_amendement AS
SELECT a.entite_id AS id, a.date_sort AS date, a.dossier_id, a.etape_id, a.article_suivi_id, a.chambre,
       a.organe_examen_id, a.sort,
       (SELECT l.vers_id FROM canon.lien l WHERE l.de_id = a.entite_id AND l.nature = 'groupe_auteur' LIMIT 1) AS groupe_id,
       (SELECT l.vers_id FROM canon.lien l JOIN canon.personne p ON p.entite_id = l.vers_id
        WHERE l.de_id = a.entite_id AND l.nature = 'auteur' ORDER BY l.ordre NULLS LAST LIMIT 1) AS auteur_id,
       (SELECT pa.cle FROM lecture.parcours_acte pa
        WHERE pa.dossier_id = a.dossier_id AND pa.etape_id = a.etape_id AND pa.categorie = 'case' LIMIT 1) AS cle
FROM canon.amendement a
WHERE NOT EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = a.entite_id
                    AND (x.retiree_de_la_source_le IS NOT NULL OR x.fusionnee_dans IS NOT NULL));
CREATE UNIQUE INDEX ON lecture.fait_amendement (id);
CREATE INDEX ON lecture.fait_amendement (dossier_id, date DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_amendement (groupe_id, date DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_amendement (auteur_id, date DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_amendement (article_suivi_id);
CREATE INDEX ON lecture.fait_amendement (etape_id);
