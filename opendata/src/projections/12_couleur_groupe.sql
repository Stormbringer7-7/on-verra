-- Couleur de chaque groupe politique : tout groupe en a une, et l'on sait d'où elle vient.
--   officielle : publiée par la chambre (`canon.organisation.couleur`, AMO : couleurAssociee) ;
--   famille    : couleur connue et sûre : le même parti a un groupe à l'Assemblée (table ci-dessous :
--                seulement les cas certains, LR, PS, communistes, écologistes, macronistes, RN,
--                non-inscrits) ; sa couleur officielle la plus récente est reprise ;
--   gauche_droite : sinon, couleur tirée de la position du groupe dans l'hémicycle
--                (`lecture.position_groupe`, d'après les sièges publiés) sur un dégradé fixe, du rouge
--                (gauche, #E05A5A) au bleu (droite, #4A7FE0), lisible sur fond sombre ;
--   arbitraire : sinon, couleur aléatoire seedée : une palette fixe, choisie par l'empreinte md5 de
--                « chambre:abrégé:nom », donc toujours la même pour le même groupe, groupes à venir
--                compris. Un groupe actif dans ce cas est signalé par les contrôles
--                (`groupe_actif_couleur_arbitraire`).

CREATE TABLE lecture.couleur_groupe_famille AS
SELECT * FROM (VALUES
    -- Sénat, même parti qu'un groupe de l'Assemblée (les deux codes publiés : ODSEN et AMO)
    ('SENAT', 'UMP', 'DR'), ('SENAT', 'UMPPO', 'DR'),        -- Les Républicains → Droite Républicaine
    ('SENAT', 'SOC', 'SOC'), ('SENAT', 'SOCPO', 'SOC'),      -- Socialiste, Écologiste et Républicain → Socialistes
    ('SENAT', 'CRC', 'GDR'), ('SENAT', 'CRCPO', 'GDR'),      -- CRCE - Kanaky → Gauche Démocrate et Républicaine
    ('SENAT', 'LREM', 'EPR'), ('SENAT', 'LREMP', 'EPR'),     -- RDPI → Ensemble pour la République
    ('SENAT', 'UNT', 'RN'), ('SENAT', 'UNTPO', 'RN'),        -- Union Nationale pour les Territoires → Rassemblement National
    ('SENAT', 'GEST', 'ECOS'), ('SENAT', 'GESTP', 'ECOS'),   -- Écologiste - Solidarité et Territoires → Écologiste et Social
    ('SENAT', 'NI', 'NI'), ('SENAT', 'NIPOL', 'NI'),         -- Non-inscrits
    -- anciens groupes de l'Assemblée sans couleur publiée, même parti qu'un groupe actuel
    ('AN', 'SOC', 'SOC'), ('AN', 'SRC', 'SOC'), ('AN', 'S.R.C.', 'SOC'), ('AN', 'SER', 'SOC'),
    ('AN', 'UMP', 'DR'), ('AN', 'R-UMP', 'DR'), ('AN', 'LES-REP', 'DR'),
    ('AN', 'GDR', 'GDR'), ('AN', 'ECOLO', 'ECOS'), ('AN', 'NI', 'NI')
) AS f (chambre, abrege, abrege_an);

-- Palette de secours : lisible sur fond sombre, couleurs distinctes deux à deux.
CREATE TABLE lecture.couleur_groupe_palette AS
SELECT * FROM (VALUES
    (0, '#E57373'), (1, '#64B5F6'), (2, '#81C784'), (3, '#FFB74D'), (4, '#BA68C8'), (5, '#4DD0E1'),
    (6, '#F06292'), (7, '#AED581'), (8, '#FFD54F'), (9, '#9575CD'), (10, '#4DB6AC'), (11, '#FF8A65'),
    (12, '#7986CB'), (13, '#DCE775'), (14, '#A1887F'), (15, '#90A4AE'), (16, '#CE93D8'), (17, '#80CBC4'),
    (18, '#FFAB91'), (19, '#B39DDB'), (20, '#C5E1A5'), (21, '#FFE082'), (22, '#80DEEA'), (23, '#EF9A9A')
) AS p (rang, couleur);

CREATE TABLE lecture.couleur_groupe AS
WITH groupe AS (
    SELECT o.entite_id AS groupe_id, o.chambre, o.abrege, o.nom, o.couleur
    FROM canon.organisation o
    WHERE o.type = 'groupe_politique'  -- retirés de la source compris : un vote ancien les cite encore
), officielle_an AS (
    -- couleur officielle la plus récente publiée sous chaque abrégé de l'Assemblée
    SELECT DISTINCT ON (o.abrege) o.abrege, o.couleur
    FROM canon.organisation o
    LEFT JOIN lecture.appartenance_groupe ag ON ag.groupe_id = o.entite_id
    WHERE o.type = 'groupe_politique' AND o.chambre = 'AN' AND o.couleur IS NOT NULL
    ORDER BY o.abrege, max(ag.fin) OVER (PARTITION BY o.entite_id) DESC NULLS LAST, o.entite_id
), degrade AS (
    -- position 0 (gauche) → #E05A5A, 1 (droite) → #4A7FE0, composante par composante
    SELECT pg.groupe_id, '#' || upper(string_agg(lpad(to_hex(round(c.gauche + (c.droite - c.gauche) * pg.position)::int), 2, '0'),
                                                 '' ORDER BY c.rang)) AS couleur
    FROM lecture.position_groupe pg
    CROSS JOIN (VALUES (1, 224, 74), (2, 90, 127), (3, 90, 224)) AS c (rang, gauche, droite)
    WHERE pg.position IS NOT NULL
    GROUP BY pg.groupe_id
)
SELECT g.groupe_id,
       COALESCE(g.couleur, a.couleur, d.couleur, p.couleur) AS couleur,
       CASE WHEN g.couleur IS NOT NULL THEN 'officielle' WHEN a.couleur IS NOT NULL THEN 'famille'
            WHEN d.couleur IS NOT NULL THEN 'gauche_droite' ELSE 'arbitraire' END AS source
FROM groupe g
LEFT JOIN lecture.couleur_groupe_famille f ON f.chambre = g.chambre AND f.abrege = g.abrege
LEFT JOIN officielle_an a ON a.abrege = f.abrege_an
LEFT JOIN degrade d ON d.groupe_id = g.groupe_id
JOIN lecture.couleur_groupe_palette p
  ON p.rang = mod(('x' || substr(md5(concat_ws(':', g.chambre, g.abrege, g.nom)), 1, 8))::bit(32)::bigint, 24);
CREATE UNIQUE INDEX ON lecture.couleur_groupe (groupe_id);
