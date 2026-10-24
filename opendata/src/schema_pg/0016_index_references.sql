-- Index sur les colonnes qui référencent une personne, une organisation ou un dossier sans en avoir :
-- une fusion d'entités re-pointe chacune de ces colonnes (cf. docs/rapprochements.md, Fusion
-- d'entités) ; sans index, chaque fusion parcourt la table entière. Relever la liste :
-- clés étrangères dont la première colonne n'est la première d'aucun index (pg_constraint, pg_index).

CREATE INDEX ON canon.amendement (organe_examen_id);
CREATE INDEX ON canon.article_suivi (dossier_id);
CREATE INDEX ON canon.audition (personne_id);
CREATE INDEX ON canon.decision_cc (dossier_id);
CREATE INDEX ON canon.etape (organe_id);
CREATE INDEX ON canon.evenement_agenda (organisation_id);
CREATE INDEX ON canon.intervention (groupe_id);
CREATE INDEX ON canon.mandat_rne (commune_id);
CREATE INDEX ON canon.mandat_rne (departement_id);
CREATE INDEX ON canon.organisation (parent_id);
CREATE INDEX ON canon.participation (personne_id);
CREATE INDEX ON canon.point_odj (dossier_id);
CREATE INDEX ON canon.position_groupe (groupe_id);
CREATE INDEX ON canon.question (ministere_interroge_id);
CREATE INDEX ON canon.question (groupe_auteur_id);
CREATE INDEX ON canon.reunion (organe_id);
CREATE INDEX ON canon.texte_publie (dossier_id);
CREATE INDEX ON canon.version_texte (dossier_id);
CREATE INDEX ON canon.vote (groupe_id);
