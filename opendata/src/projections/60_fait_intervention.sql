-- Interventions vues par l'Explorer (API, faits filtrés) : une ligne par prise de parole retenue,
-- sans son texte. `canon.intervention` pèse 661 Mo avec le texte : chaque lecture large (compter,
-- regrouper, suggérer sans filtre) la relisait en entier. Ici, les dimensions sont déjà calculées :
--   - retenues : entité vivante, hors présidence de séance, avec un orateur (personne ou nom publié),
--     les règles de « Qui intervient » (api/src/infra/pg/discussions.ts : HORS_PRESIDENCE, UN_ORATEUR) ;
--   - jour : date de la réunion à Paris ;
--   - article : celui de l'amendement discuté (colonne), jamais rapproché du texte ;
--   - groupe : appartenance publiée de l'orateur le jour de la réunion, dans la chambre, la plus
--     récente si deux se chevauchent ;
--   - cle : case du parcours d'un acte qui cite la réunion, pour le dossier de l'intervention (la
--     première par ordre de clé, comme l'API le faisait).
-- Les liens intervention → dossier ou amendement (discussion commune, plusieurs amendements) restent
-- lus dans `canon.lien`.

CREATE TABLE lecture.fait_intervention AS
WITH case_reunion AS (
    SELECT DISTINCT ON (l.vers_id, pa.dossier_id) l.vers_id AS reunion_id, pa.dossier_id, pa.cle
    FROM canon.lien l JOIN lecture.parcours_acte pa ON pa.etape_id = l.de_id AND pa.categorie = 'case'
    WHERE l.nature = 'reunion'
    ORDER BY l.vers_id, pa.dossier_id, pa.cle
)
SELECT i.entite_id AS id, (r.debut AT TIME ZONE 'Europe/Paris')::date AS jour, i.reunion_id, r.chambre, r.organe_id,
       i.dossier_id, i.orateur_id, i.amendement_id, a.article_suivi_id, g.groupe_id, cr.cle
FROM canon.intervention i
JOIN canon.reunion r ON r.entite_id = i.reunion_id
LEFT JOIN canon.amendement a ON a.entite_id = i.amendement_id
LEFT JOIN case_reunion cr ON cr.reunion_id = i.reunion_id AND cr.dossier_id = i.dossier_id
LEFT JOIN LATERAL (
    SELECT ag.groupe_id FROM lecture.appartenance_groupe ag
    WHERE ag.personne_id = i.orateur_id AND ag.chambre = r.chambre
      AND (r.debut AT TIME ZONE 'Europe/Paris')::date BETWEEN ag.debut AND ag.fin
    ORDER BY ag.debut DESC LIMIT 1) g ON true
WHERE NOT EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = i.entite_id
                    AND (x.retiree_de_la_source_le IS NOT NULL OR x.fusionnee_dans IS NOT NULL))
  AND COALESCE(i.qualite, '') !~* '^présidente? de séance$'
  AND i.orateur_libelle !~* '^(M\. le président|Mme la présidente)\.?$'
  AND (i.orateur_id IS NOT NULL OR btrim(i.orateur_libelle) <> '');
CREATE UNIQUE INDEX ON lecture.fait_intervention (id);
-- (colonne, jour, id) : les faits d'aperçu d'un groupe (les plus récents) sans trier toute la table
CREATE INDEX ON lecture.fait_intervention (dossier_id, jour DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_intervention (orateur_id, jour DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_intervention (groupe_id, jour DESC NULLS LAST, id);
CREATE INDEX ON lecture.fait_intervention (amendement_id);
CREATE INDEX ON lecture.fait_intervention (article_suivi_id);
CREATE INDEX ON lecture.fait_intervention (reunion_id);

-- Actes du parcours par étape canon (case d'un amendement ou d'un scrutin).
CREATE INDEX ON lecture.parcours_acte (etape_id);
