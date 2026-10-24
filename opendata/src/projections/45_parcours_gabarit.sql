-- Gabarits de la barre de parcours (écran Dossier) : les cases possibles d'une loi, selon la
-- procédure du dossier (`canon.dossier.procedure_acceleree`). Une case n'est jamais supposée faite :
-- son état se lit dans les étapes publiées (55_parcours_dossier.sql). Une case facultative peut ne
-- jamais avoir lieu (2e lecture, CMP, Conseil constitutionnel…) : elle devient alors « sans_objet ».
--   chambre : o = chambre de dépôt, s = l'autre chambre, sinon fixe (CMP, CC, PR, JO, AN+SENAT) ;
--   libelle : {o} et {s} remplacés par « AN » ou « Sénat ».
-- Les deux formes sont celles du design (canevas « Panoptique v2 », écran Dossier) : commission et
-- séance distinguées en procédure accélérée ; une case par lecture en navette normale.

CREATE TABLE lecture.parcours_gabarit AS
SELECT * FROM (VALUES
    ('acceleree', 1, 'depot', 'Dépôt', 'o', false),
    ('acceleree', 2, 'commission_1_o', 'Commission {o}', 'o', false),
    ('acceleree', 3, 'seance_1_o', 'Séance {o}', 'o', false),
    ('acceleree', 4, 'commission_1_s', 'Commission {s}', 's', false),
    ('acceleree', 5, 'seance_1_s', 'Séance {s}', 's', false),
    ('acceleree', 6, 'lecture_2_o', '2e lecture {o}', 'o', true),
    ('acceleree', 7, 'lecture_2_s', '2e lecture {s}', 's', true),
    ('acceleree', 8, 'cmp', 'CMP', 'CMP', true),
    ('acceleree', 9, 'conclusions_cmp', 'Vote du texte de la CMP', 'AN+SENAT', true),
    ('acceleree', 10, 'nouvelle_lecture', 'Nouvelle lecture', 'AN+SENAT', true),
    ('acceleree', 11, 'lecture_definitive', 'Lecture définitive AN', 'AN', true),
    ('acceleree', 12, 'cc', 'Conseil constit.', 'CC', true),
    ('acceleree', 13, 'promulgation', 'Promulgation', 'PR', false),
    ('acceleree', 14, 'jo', 'Journal officiel', 'JO', false),
    ('normale', 1, 'depot', 'Dépôt', 'o', false),
    ('normale', 2, 'lecture_1_o', '1re lecture {o}', 'o', false),
    ('normale', 3, 'lecture_1_s', '1re lecture {s}', 's', false),
    ('normale', 4, 'lecture_2_o', '2e lecture {o}', 'o', true),
    ('normale', 5, 'lecture_2_s', '2e lecture {s}', 's', true),
    ('normale', 6, 'cmp', 'CMP', 'CMP', true),
    ('normale', 7, 'conclusions_cmp', 'Vote du texte de la CMP', 'AN+SENAT', true),
    ('normale', 8, 'nouvelle_lecture', 'Nouvelle lecture', 'AN+SENAT', true),
    ('normale', 9, 'lecture_definitive', 'Lecture définitive AN', 'AN', true),
    ('normale', 10, 'cc', 'Conseil constit.', 'CC', true),
    ('normale', 11, 'promulgation_jo', 'Promulgation et JO', 'PR', false)
) AS g (procedure, rang, cle, libelle, chambre, facultative);
