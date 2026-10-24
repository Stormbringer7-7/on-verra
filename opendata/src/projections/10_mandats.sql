-- Mandats parlementaires et appartenances aux groupes, datés : la base de « par rapport à son groupe
-- à un moment donné ». Uniquement depuis canon (données 100 % fiables).

-- Chaque chambre fait foi pour ses propres mandats : un mandat de député est lu dans l'AMO, un
-- mandat de sénateur dans les données du Sénat (identifiant officiel du mandat). L'AMO publie aussi
-- des mandats de sénateur : après la fusion d'une fiche Sénat dans l'acteur AN qui la cite, ils
-- doubleraient les mandats du Sénat (184 sénateurs).
CREATE TABLE lecture.mandat_parlementaire AS
SELECT f.personne_id, CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END AS chambre,
       f.debut, COALESCE(f.fin, DATE '9999-12-31') AS fin
FROM canon.fonction f
JOIN canon.correspondance c ON c.entite_id = f.entite_id AND c.methode = 'OFFICIAL_ID' AND c.statut = 'VERIFIED'
     AND c.systeme = CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END
JOIN canon.entite e ON e.entite_id = f.entite_id AND e.retiree_de_la_source_le IS NULL
WHERE f.type IN ('depute', 'senateur') AND f.debut IS NOT NULL;
CREATE INDEX ON lecture.mandat_parlementaire (chambre, debut, fin);

CREATE TABLE lecture.appartenance_groupe AS
SELECT f.personne_id, f.organisation_id AS groupe_id, o.chambre, f.debut, COALESCE(f.fin, DATE '9999-12-31') AS fin
FROM canon.fonction f JOIN canon.organisation o ON o.entite_id = f.organisation_id
WHERE f.type = 'membre_groupe' AND o.type = 'groupe_politique' AND f.debut IS NOT NULL;
CREATE INDEX ON lecture.appartenance_groupe (personne_id, chambre, debut);
