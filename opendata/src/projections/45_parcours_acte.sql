-- Parcours suivi, 1/2 : chaque dossier rattaché au modèle de parcours de son type (version en
-- vigueur à sa date de dépôt), chaque acte publié rattaché à une étape du modèle par
-- `canon.parcours_correspondance` (code de l'acte -> phase, rôle). Modèles : opendata/parcours/,
-- rechargés avant les projections (src/parcours.py). Rien n'est supposé : un acte que les
-- correspondances ne connaissent pas, ou qu'aucune étape ne reçoit, est « hors_modele ».

-- Dossier -> modèle. Date du dossier : son dépôt, à défaut son premier acte daté ; sans date, la
-- version la plus récente.
CREATE TABLE lecture.dossier_modele AS
WITH dossier AS (
    SELECT d.entite_id AS dossier_id, d.type_procedure,
           COALESCE(d.date_depot, (SELECT min(e.debut) FROM canon.etape e WHERE e.dossier_id = d.entite_id)) AS date_ref
    FROM canon.dossier d JOIN canon.entite x ON x.entite_id = d.entite_id
    WHERE x.retiree_de_la_source_le IS NULL
)
SELECT DISTINCT ON (d.dossier_id) d.dossier_id, d.type_procedure, d.date_ref, m.cle AS modele, m.version, m.famille,
       m.libelle AS modele_libelle
FROM dossier d
JOIN canon.parcours_type t ON t.type_source = d.type_procedure
JOIN canon.parcours_modele m ON m.cle = t.modele AND m.version = t.version
WHERE d.date_ref IS NULL OR (m.valide_du <= d.date_ref AND (m.valide_au IS NULL OR d.date_ref < m.valide_au))
ORDER BY d.dossier_id, m.valide_du DESC, m.version DESC;
CREATE INDEX ON lecture.dossier_modele (dossier_id);

-- Dossiers sans modèle, et pourquoi (contrôle : un type publié sans modèle est à écrire).
CREATE TABLE lecture.dossier_sans_modele AS
SELECT d.entite_id AS dossier_id, d.type_procedure,
       CASE WHEN d.type_procedure IS NULL THEN 'type non publié'
            WHEN NOT EXISTS (SELECT 1 FROM canon.parcours_type t WHERE t.type_source = d.type_procedure) THEN 'type sans modèle'
            ELSE 'aucune version du modèle en vigueur à sa date' END AS motif
FROM canon.dossier d JOIN canon.entite x ON x.entite_id = d.entite_id
WHERE x.retiree_de_la_source_le IS NULL
  AND NOT EXISTS (SELECT 1 FROM lecture.dossier_modele m WHERE m.dossier_id = d.entite_id);

-- Chaque acte d'un dossier modélisé, avec son étape (`cle`) ou sa catégorie :
--   case        : acte d'une étape du modèle ;
--   annexe      : montré, sans effet (structure, étude d'impact…) ;
--   deviation   : acte d'une déviation du modèle, rattaché à l'étape de l'acte classé qui le précède ;
--   hors_modele : code inconnu des correspondances, phase qu'aucune étape ne reçoit, déviation
--                 que le modèle ne prévoit pas.
-- Jour de référence : CURRENT_DATE, ou le réglage `civictrace.date_reference` (tests). Un acte daté
-- après ce jour (séance inscrite à l'ordre du jour) est une échéance, pas une étape faite.
CREATE TABLE lecture.parcours_acte AS
WITH ref AS (
    SELECT COALESCE(NULLIF(current_setting('civictrace.date_reference', true), '')::date, CURRENT_DATE) AS jour
), etape AS (
    SELECT e.*, dm.modele, dm.version
    FROM canon.etape e JOIN canon.entite x ON x.entite_id = e.entite_id
    JOIN lecture.dossier_modele dm ON dm.dossier_id = e.dossier_id
    WHERE x.retiree_de_la_source_le IS NULL
), corr AS (
    -- premier motif (par rang) qui correspond au code
    SELECT DISTINCT ON (e.entite_id) e.entite_id AS etape_id, c.phase, c.role, c.deviation
    FROM etape e JOIN canon.parcours_correspondance c ON e.code_source ~ c.motif
    ORDER BY e.entite_id, c.rang
), origine AS (
    -- chambre de dépôt : celle du premier dépôt publié, en première lecture d'abord
    SELECT DISTINCT ON (e.dossier_id) e.dossier_id, e.chambre
    FROM etape e JOIN corr c ON c.etape_id = e.entite_id
    WHERE c.phase = 'depot' AND c.role = 'conclut' AND e.chambre IN ('AN', 'SENAT')
    ORDER BY e.dossier_id, e.lecture IS DISTINCT FROM '1', e.ordre
), classe AS (
    SELECT e.*, o.chambre AS origine, c.phase, c.role,
           CASE WHEN EXISTS (SELECT 1 FROM canon.parcours_deviation d
                             WHERE d.modele = e.modele AND d.version = e.version AND d.cle = c.deviation)
                THEN c.deviation END AS deviation,
           (SELECT pe.cle FROM canon.parcours_etape pe
            WHERE pe.modele = e.modele AND pe.version = e.version AND c.phase = ANY (pe.phases)
              AND (pe.lecture IN ('*', e.lecture)
                   OR (pe.lecture = 'n' AND e.lecture ~ '^\d+$' AND e.lecture::int >= 3))
              AND (pe.cote IN ('*', e.chambre)
                   OR (pe.cote = 'o' AND e.chambre = o.chambre)
                   OR (pe.cote = 's' AND e.chambre IN ('AN', 'SENAT') AND e.chambre <> o.chambre))
            ORDER BY pe.rang LIMIT 1) AS cle_phase
    FROM etape e
    LEFT JOIN origine o ON o.dossier_id = e.dossier_id
    LEFT JOIN corr c ON c.etape_id = e.entite_id
), groupe AS (
    -- étape de l'acte classé précédent (dans l'ordre publié) : groupe = nombre d'actes classés vus
    SELECT c.*, count(CASE WHEN c.role IN ('ouvre', 'conclut') THEN c.cle_phase END)
                    OVER (PARTITION BY c.dossier_id ORDER BY c.ordre) AS groupe
    FROM classe c
), rattache AS (
    SELECT g.*,
           CASE WHEN g.role IN ('ouvre', 'conclut') THEN g.cle_phase
                WHEN g.role = 'deviation' AND g.deviation IS NOT NULL THEN COALESCE(
                    max(CASE WHEN g.role IN ('ouvre', 'conclut') THEN g.cle_phase END)
                        OVER (PARTITION BY g.dossier_id, g.groupe),
                    (SELECT pe.cle FROM canon.parcours_etape pe
                     WHERE pe.modele = g.modele AND pe.version = g.version ORDER BY pe.rang LIMIT 1))
           END AS cle
    FROM groupe g
)
SELECT r.dossier_id, r.modele, r.version,
       CASE WHEN bool_or(r.deviation = 'procedure_acceleree') OVER (PARTITION BY r.dossier_id)
            THEN 'acceleree' ELSE 'normale' END AS procedure,
       r.origine, r.entite_id AS etape_id, r.ordre, r.type, r.code_source, r.chambre, r.lecture, r.debut, r.statut,
       r.libelle, r.conclusion, r.phase, r.role, r.deviation,
       CASE WHEN r.role IN ('ouvre', 'conclut') THEN r.cle WHEN r.role = 'deviation' THEN r.cle END AS cle,
       CASE WHEN r.role = 'annexe' THEN 'annexe'
            WHEN r.role = 'deviation' AND r.cle IS NOT NULL THEN 'deviation'
            WHEN r.role IN ('ouvre', 'conclut') AND r.cle IS NOT NULL THEN 'case'
            ELSE 'hors_modele' END AS categorie,
       CASE WHEN r.code_source ~ '^CMP-DEBATS-AN' THEN 'AN' WHEN r.code_source ~ '^CMP-DEBATS-SN' THEN 'SENAT'
            ELSE r.chambre END AS chambre_seance,
       -- un état publié sans date (DOSLEG : caduc, retiré) est un fait, pas une échéance
       COALESCE(r.statut = 'faite' AND (r.debut <= f.jour OR (r.debut IS NULL AND r.role = 'deviation')), false) AS accompli,
       COALESCE(r.statut IN ('faite', 'a_venir') AND r.debut > f.jour, false) AS programme,
       COALESCE(r.role = 'conclut' AND r.phase = ANY (pe.conclut), false) AS conclusif,
       f.jour AS date_reference
FROM rattache r CROSS JOIN ref f
LEFT JOIN canon.parcours_etape pe ON pe.modele = r.modele AND pe.version = r.version AND pe.cle = r.cle;
CREATE INDEX ON lecture.parcours_acte (dossier_id, cle);
