-- Vues calculées (aucune donnée stockée).

-- Députés en fonction le jour du scrutin mais absents de la liste des votants.
-- Absent de l'hémicycle OU présent sans voter : les données ne permettent pas de trancher.
CREATE VIEW sans_vote AS
SELECT s.uid AS scrutin_uid, m.acteur_ref
FROM scrutins s
JOIN mandats m
  ON m.legislature = s.legislature
 AND m.date_debut <= s.date
 AND (m.date_fin IS NULL OR m.date_fin >= s.date)
WHERE NOT EXISTS (
    SELECT 1 FROM votes v WHERE v.scrutin_uid = s.uid AND v.acteur_ref = m.acteur_ref
);

-- Votes finaux sur un texte de loi : l'ensemble, ou l'article unique.
CREATE VIEW scrutins_finaux AS
SELECT * FROM scrutins WHERE nature IN ('ensemble', 'article_unique');

-- Vue pratique : qui a voté quoi, avec noms et groupes.
CREATE VIEW votes_detail AS
SELECT l.titre AS loi, s.uid AS scrutin_uid, s.numero, s.date, s.nature, s.lecture, s.sort,
       d.prenom, d.nom, g.abrege AS groupe, v.position, v.par_delegation
FROM votes v
JOIN scrutins s ON s.uid = v.scrutin_uid
LEFT JOIN lois l ON l.id = s.loi_id
JOIN deputes d ON d.acteur_ref = v.acteur_ref
LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref;
