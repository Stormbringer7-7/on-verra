-- Parcours suivi, 2/2 : une ligne par dossier et par étape de son modèle (le droit commun), son
-- état lu dans les actes publiés (45_parcours_acte.sql), la décision du Conseil constitutionnel
-- (`canon.decision_cc`) et la loi publiée (`canon.texte_publie`) ; les déviations du dossier ; les
-- dossiers rattachés à l'étape d'un autre (hiérarchie) ; une synthèse par dossier.
-- Rien n'est supposé : une étape sans preuve dans les données est « inconnu », jamais « faite » ;
-- une donnée absente n'est jamais un échec.
--   faite      : assez d'actes conclusifs publiés (`conclusifs` : 2 = les deux chambres), datés au
--                plus tard le jour de référence ;
--   en_cours   : un acte de l'étape est publié, pas assez pour la conclure ;
--   a_venir    : aucun acte, et le parcours publié n'est pas allé au-delà ;
--   sans_objet : l'étape n'aura pas lieu, d'après un fait publié : branche prise (transition du
--                modèle), déviation qui termine le parcours, ou étape non obligatoire dépassée ;
--   inconnu    : la donnée ne permet pas de conclure (étape obligatoire sans acte alors que la suite
--                en a, étape commencée jamais conclue alors que la suite a eu lieu).
-- Définitions et exemples : docs/indicateurs.md.

-- Déviations de chaque dossier : une ligne par déviation et par étape où elle a lieu. Effet : celui
-- du modèle, ou `effet_si` quand une conclusion de ses actes correspond à `si` (motion adoptée…).
CREATE TABLE lecture.parcours_deviation AS
SELECT a.dossier_id, a.deviation AS cle, d.libelle, d.fondement, a.cle AS etape_cle, pe.rang AS etape_rang,
       min(a.ordre) AS ordre, min(a.debut) AS debut,
       CASE WHEN d.si IS NOT NULL AND bool_or(COALESCE(a.conclusion, '') ~* d.si) THEN d.effet_si ELSE d.effet END AS effet,
       d.issue,
       string_agg(a.conclusion, ' · ' ORDER BY a.ordre) FILTER (WHERE a.conclusion IS NOT NULL) AS conclusion,
       array_agg(a.etape_id ORDER BY a.ordre) AS provenance
FROM lecture.parcours_acte a
JOIN canon.parcours_deviation d ON d.modele = a.modele AND d.version = a.version AND d.cle = a.deviation
JOIN canon.parcours_etape pe ON pe.modele = a.modele AND pe.version = a.version AND pe.cle = a.cle
WHERE a.accompli
GROUP BY a.dossier_id, a.deviation, d.libelle, d.fondement, a.cle, pe.rang, d.si, d.effet_si, d.effet, d.issue;
CREATE INDEX ON lecture.parcours_deviation (dossier_id);

-- Une ligne par dossier et par étape du modèle.
CREATE TABLE lecture.parcours_dossier AS
WITH ref AS (
    SELECT COALESCE(NULLIF(current_setting('civictrace.date_reference', true), '')::date, CURRENT_DATE) AS jour
), dossier AS (
    SELECT dm.dossier_id, dm.modele, dm.version, a.origine, COALESCE(a.procedure, 'normale') AS procedure, r.jour AS date_reference
    FROM lecture.dossier_modele dm CROSS JOIN ref r
    LEFT JOIN LATERAL (SELECT x.origine, x.procedure FROM lecture.parcours_acte x WHERE x.dossier_id = dm.dossier_id LIMIT 1) a
           ON true
), decision AS (
    -- décision du Conseil constitutionnel citée par l'acte AN (numéro de décision)
    SELECT DISTINCT ON (k.dossier_id) k.dossier_id, k.entite_id, k.date, k.solution
    FROM canon.decision_cc k JOIN canon.entite x ON x.entite_id = k.entite_id AND x.retiree_de_la_source_le IS NULL
    JOIN dossier d ON d.dossier_id = k.dossier_id
    WHERE k.date <= d.date_reference
    ORDER BY k.dossier_id, k.date DESC
), loi AS (
    -- loi publiée, identifiée par son NOR
    SELECT DISTINCT ON (t.dossier_id) t.dossier_id, t.entite_id, t.numero, t.numero_jo,
           CASE WHEN t.date_signature <= d.date_reference THEN t.date_signature END AS signature,
           CASE WHEN t.date_publication <= d.date_reference THEN t.date_publication END AS publication
    FROM canon.texte_publie t JOIN canon.entite x ON x.entite_id = t.entite_id AND x.retiree_de_la_source_le IS NULL
    JOIN dossier d ON d.dossier_id = t.dossier_id
    ORDER BY t.dossier_id, t.date_publication DESC NULLS LAST
), fin AS (
    -- déviation qui termine le parcours : rien après l'étape où elle a lieu
    SELECT dossier_id, min(etape_rang) AS rang, min(debut) AS le FROM lecture.parcours_deviation WHERE effet = 'termine'
    GROUP BY 1
), agg AS (
    -- étape conclue par les deux chambres (conclusions de CMP, nouvelle lecture) : conclusion préfixée
    SELECT a.dossier_id, a.cle,
           count(*) FILTER (WHERE a.accompli) AS actes,
           count(DISTINCT a.code_source) FILTER (WHERE a.accompli AND a.conclusif) AS conclusifs,
           min(a.debut) FILTER (WHERE a.accompli) AS debut,
           max(a.debut) FILTER (WHERE a.accompli AND a.conclusif) AS fin,
           min(a.debut) FILTER (WHERE a.programme) AS programmee_le,
           COALESCE(bool_or(a.conclusion ~* 'rejet') FILTER (WHERE a.accompli AND a.conclusif), false) AS rejet,
           count(DISTINCT a.chambre_seance) FILTER (WHERE a.accompli AND a.chambre_seance IN ('AN', 'SENAT')) AS chambres,
           max(a.chambre_seance) FILTER (WHERE a.accompli) AS chambre,
           string_agg(CASE WHEN pe.conclusifs > 1
                           THEN CASE a.chambre_seance WHEN 'AN' THEN 'AN : ' WHEN 'SENAT' THEN 'Sénat : ' ELSE '' END
                           ELSE '' END || a.conclusion, ' · ' ORDER BY a.debut, a.ordre)
               FILTER (WHERE a.accompli AND a.conclusif AND a.conclusion IS NOT NULL) AS conclusion,
           array_agg(a.etape_id ORDER BY a.ordre) FILTER (WHERE a.accompli OR a.programme) AS provenance
    FROM lecture.parcours_acte a
    JOIN canon.parcours_etape pe ON pe.modele = a.modele AND pe.version = a.version AND pe.cle = a.cle
    WHERE a.categorie = 'case' GROUP BY a.dossier_id, a.cle, pe.conclusifs
), cases AS (
    SELECT d.dossier_id, d.modele, d.version, d.procedure, d.origine, d.date_reference, pe.rang, pe.cle, pe.nature,
           pe.phases, pe.issue,
           replace(replace(pe.libelle,
                   '{o}', CASE d.origine WHEN 'AN' THEN 'AN' WHEN 'SENAT' THEN 'Sénat' ELSE 'chambre de dépôt' END),
                   '{s}', CASE d.origine WHEN 'AN' THEN 'Sénat' WHEN 'SENAT' THEN 'AN' ELSE 'autre chambre' END) AS libelle,
           CASE pe.cote WHEN 'o' THEN d.origine
                        WHEN 's' THEN CASE d.origine WHEN 'AN' THEN 'SENAT' WHEN 'SENAT' THEN 'AN' END
                        WHEN '*' THEN CASE WHEN 'cc' = ANY (pe.phases) THEN 'CC' WHEN 'promulgation' = ANY (pe.phases) THEN 'PR'
                                           WHEN 'jo' = ANY (pe.phases) THEN 'JO' WHEN a.chambres > 1 THEN 'AN+SENAT'
                                           ELSE a.chambre END
                        ELSE pe.cote END AS chambre,
           COALESCE(a.actes, 0) AS actes, a.programmee_le, COALESCE(a.rejet, false) AS rejet, f.rang AS rang_fin,
           CASE
               WHEN 'jo' = ANY (pe.phases) THEN COALESCE(a.conclusifs > 0, false) OR l.publication IS NOT NULL
               -- une loi publiée au JO a été promulguée (date de signature connue ou non)
               WHEN 'promulgation' = ANY (pe.phases) THEN COALESCE(a.conclusifs > 0, false) OR l.signature IS NOT NULL
                                                          OR l.publication IS NOT NULL
               WHEN 'cc' = ANY (pe.phases) THEN COALESCE(a.conclusifs > 0, false) OR k.entite_id IS NOT NULL
               ELSE COALESCE(a.conclusifs >= pe.conclusifs OR (a.rejet AND a.conclusifs > 0), false)
           END AS faite,
           CASE WHEN 'jo' = ANY (pe.phases) THEN COALESCE(a.debut, l.publication)
                WHEN 'cc' = ANY (pe.phases) THEN LEAST(a.debut, k.date) ELSE a.debut END AS debut,
           CASE WHEN 'jo' = ANY (pe.phases) THEN COALESCE(a.fin, l.publication)
                WHEN 'cc' = ANY (pe.phases) THEN COALESCE(k.date, a.fin)
                WHEN 'promulgation' = ANY (pe.phases) THEN COALESCE(a.fin, l.signature)
                ELSE a.fin END AS fin,
           CASE
               WHEN 'cc' = ANY (pe.phases) THEN COALESCE(k.solution, a.conclusion)
               WHEN 'promulgation' = ANY (pe.phases) THEN COALESCE(a.conclusion,
                   CASE WHEN l.signature IS NOT NULL OR l.publication IS NOT NULL THEN 'Loi n° ' || l.numero END)
               WHEN 'jo' = ANY (pe.phases) THEN COALESCE(a.conclusion,
                   CASE WHEN l.publication IS NOT NULL THEN 'JO n° ' || l.numero_jo END)
               ELSE a.conclusion
           END AS conclusion,
           array_remove(COALESCE(a.provenance, '{}')
               || CASE WHEN 'cc' = ANY (pe.phases) THEN k.entite_id END
               || CASE WHEN ('promulgation' = ANY (pe.phases) AND (l.signature IS NOT NULL OR l.publication IS NOT NULL))
                         OR ('jo' = ANY (pe.phases) AND l.publication IS NOT NULL) THEN l.entite_id END,
               NULL) AS provenance
    FROM dossier d
    JOIN canon.parcours_etape pe ON pe.modele = d.modele AND pe.version = d.version
    LEFT JOIN agg a ON a.dossier_id = d.dossier_id AND a.cle = pe.cle
    LEFT JOIN decision k ON k.dossier_id = d.dossier_id
    LEFT JOIN loi l ON l.dossier_id = d.dossier_id
    LEFT JOIN fin f ON f.dossier_id = d.dossier_id
), saut AS (
    -- branche prise : la conclusion publiée d'une étape faite correspond à une transition
    SELECT c.dossier_id, c.rang AS de, COALESCE(v.rang, 2147483647) AS vers
    FROM cases c
    JOIN canon.parcours_transition t ON t.modele = c.modele AND t.version = c.version AND t.de = c.cle
    LEFT JOIN canon.parcours_etape v ON v.modele = t.modele AND v.version = t.version AND v.cle = t.vers
    WHERE c.faite AND c.conclusion IS NOT NULL AND c.conclusion ~* t.condition
), sautees AS (
    -- étapes entre l'étape d'où part une branche prise et celle où elle arrive
    SELECT DISTINCT c.dossier_id, c.rang
    FROM cases c JOIN saut s ON s.dossier_id = c.dossier_id AND c.rang > s.de AND c.rang < s.vers
), fenetre AS (
    SELECT c.*, s.rang IS NOT NULL AS sautee,
           COALESCE(bool_or(c.actes > 0 OR c.faite) OVER (PARTITION BY c.dossier_id ORDER BY c.rang
                    ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), false) AS apres_actif
    FROM cases c LEFT JOIN sautees s ON s.dossier_id = c.dossier_id AND s.rang = c.rang
), etats AS (
    SELECT f.*,
           CASE
               WHEN f.faite THEN 'faite'
               WHEN f.actes > 0 AND (f.rang_fin IS NOT NULL OR f.apres_actif) THEN 'inconnu'
               WHEN f.actes > 0 THEN 'en_cours'
               WHEN f.sautee THEN 'sans_objet'
               WHEN f.rang > f.rang_fin THEN 'sans_objet'
               WHEN f.nature <> 'obligatoire' AND f.apres_actif THEN 'sans_objet'
               WHEN f.apres_actif THEN 'inconnu'
               ELSE 'a_venir'
           END AS etat
    FROM fenetre f
), avancement AS (
    SELECT e.*,
           max(e.rang) FILTER (WHERE e.etat = 'en_cours') OVER w AS dernier_en_cours,
           COALESCE(max(e.rang) FILTER (WHERE e.etat IN ('faite', 'en_cours', 'inconnu')) OVER w, 0) AS dernier_actif
    FROM etats e
    WINDOW w AS (PARTITION BY e.dossier_id)
), courante AS (
    -- étape courante : la dernière en cours ; à défaut, la première à venir déjà programmée (acte
    -- daté après le jour de référence) au-delà de la dernière active. Étape attendue : la première à
    -- venir au-delà de la dernière active, si le parcours n'est pas terminé.
    SELECT a.*,
           COALESCE(a.dernier_en_cours,
                    min(a.rang) FILTER (WHERE a.etat = 'a_venir' AND a.programmee_le IS NOT NULL
                                          AND a.rang > a.dernier_actif) OVER w) AS rang_courant,
           min(a.rang) FILTER (WHERE a.etat = 'a_venir' AND a.rang > a.dernier_actif) OVER w AS rang_attendu
    FROM avancement a
    WINDOW w AS (PARTITION BY a.dossier_id)
)
SELECT c.dossier_id, c.modele, c.version, c.procedure, c.origine, c.rang, c.cle, c.libelle, c.chambre, c.nature,
       c.nature <> 'obligatoire' AS facultative, c.etat, c.debut, c.fin, c.programmee_le, c.conclusion,
       COALESCE(c.rang = c.rang_courant, false) AS courante, COALESCE(c.rang = c.rang_attendu, false) AS attendue,
       c.provenance, c.date_reference
FROM courante c;
CREATE INDEX ON lecture.parcours_dossier (dossier_id, rang);

-- Branches prises de chaque dossier (pour dessiner l'embranchement).
CREATE TABLE lecture.parcours_branche AS
SELECT p.dossier_id, t.de, t.vers, t.libelle, p.conclusion
FROM lecture.parcours_dossier p
JOIN canon.parcours_transition t ON t.modele = p.modele AND t.version = p.version AND t.de = p.cle
WHERE p.etat = 'faite' AND p.conclusion IS NOT NULL AND p.conclusion ~* t.condition;

-- Hiérarchie : un dossier rattaché à l'étape d'un autre. Lien explicite seulement : le document
-- publié dans le dossier enfant est cité par un acte du dossier parent (49.3 : la déclaration du
-- Gouvernement `DECL…` est publiée dans le dossier de l'engagement et citée par le dossier du texte).
CREATE TABLE lecture.dossier_lien AS
SELECT DISTINCT ON (dm.dossier_id, pa.dossier_id) pa.dossier_id AS parent_id, dm.dossier_id AS enfant_id,
       pa.cle AS etape_cle, pa.etape_id AS acte_id, 'evenement' AS nature, doc.entite_id AS document_id
FROM lecture.dossier_modele dm
JOIN canon.document doc ON doc.dossier_id = dm.dossier_id
JOIN canon.entite x ON x.entite_id = doc.entite_id AND x.retiree_de_la_source_le IS NULL
JOIN canon.lien l ON l.vers_id = doc.entite_id AND l.nature = 'texte'
JOIN lecture.parcours_acte pa ON pa.etape_id = l.de_id AND pa.dossier_id <> dm.dossier_id
WHERE dm.famille = 'gouvernement'
ORDER BY dm.dossier_id, pa.dossier_id, pa.ordre;
CREATE INDEX ON lecture.dossier_lien (parent_id);
CREATE INDEX ON lecture.dossier_lien (enfant_id);

-- Une ligne par dossier : modèle, étape courante, avancement, issue, racine, prochaine échéance.
CREATE TABLE lecture.parcours_dossier_synthese AS
WITH d AS (
    SELECT dossier_id, modele, version, procedure, origine, date_reference,
           count(*) FILTER (WHERE etat = 'faite') AS cases_faites,
           count(*) FILTER (WHERE etat <> 'sans_objet') AS cases_affichees,
           count(*) FILTER (WHERE etat = 'inconnu') AS cases_inconnues
    FROM lecture.parcours_dossier GROUP BY 1, 2, 3, 4, 5, 6
), courante AS (
    SELECT dossier_id, cle, libelle, etat FROM lecture.parcours_dossier WHERE courante
), attendue AS (
    SELECT dossier_id, cle, libelle FROM lecture.parcours_dossier WHERE attendue
), hors AS (
    SELECT dossier_id, count(*) AS actes FROM lecture.parcours_acte WHERE categorie = 'hors_modele' AND accompli GROUP BY 1
), retrait AS (
    SELECT dossier_id, min(debut) AS le FROM lecture.parcours_deviation WHERE cle = 'retrait' GROUP BY 1
), deviations AS (
    SELECT dossier_id, count(*) AS n FROM lecture.parcours_deviation GROUP BY 1
), issue AS (
    -- déviation qui termine (retrait, caducité, censure…) ; sinon la dernière étape faite qui porte
    -- une issue (« rejete » si sa conclusion dit un rejet) ; sinon en cours
    SELECT DISTINCT ON (dossier_id) dossier_id, issue FROM (
        SELECT dossier_id, 0 AS priorite, ordre AS r, issue FROM lecture.parcours_deviation
        WHERE effet = 'termine' AND issue IS NOT NULL
        UNION ALL
        SELECT p.dossier_id, 1, -p.rang, CASE WHEN p.conclusion ~* 'rejet' THEN 'rejete' ELSE pe.issue END
        FROM lecture.parcours_dossier p
        JOIN canon.parcours_etape pe ON pe.modele = p.modele AND pe.version = p.version AND pe.cle = p.cle
        WHERE p.etat = 'faite' AND pe.issue IS NOT NULL
    ) x ORDER BY dossier_id, priorite, r
), racine AS (
    WITH RECURSIVE montee AS (
        SELECT dossier_id AS dossier_id, dossier_id AS racine_id, 0 AS profondeur FROM d
        UNION ALL
        SELECT m.dossier_id, l.parent_id, m.profondeur + 1
        FROM montee m JOIN lecture.dossier_lien l ON l.enfant_id = m.racine_id
        WHERE m.profondeur < 10
    )
    SELECT DISTINCT ON (dossier_id) dossier_id, racine_id FROM montee ORDER BY dossier_id, profondeur DESC
), echeance AS (
    -- acte publié daté après le jour de référence (séance, réunion de commission inscrite) ; heure et
    -- état lus sur la réunion que l'acte cite (lien explicite) et son point d'ordre du jour pour ce
    -- dossier ; un point supprimé ou annulé retire l'échéance
    SELECT a.dossier_id, a.debut AS date, rl.heure, a.cle,
           p.libelle || COALESCE(' · ' || a.libelle, '') AS libelle, COALESCE(rl.etat, 'programmé') AS etat,
           a.etape_id AS source_id, 1 AS priorite
    FROM lecture.parcours_acte a JOIN lecture.parcours_dossier p ON p.dossier_id = a.dossier_id AND p.cle = a.cle
    LEFT JOIN LATERAL (
        SELECT r.debut AS heure, o.etat
        FROM canon.lien l
        JOIN canon.reunion r ON r.entite_id = l.vers_id
        JOIN canon.entite y ON y.entite_id = r.entite_id AND y.retiree_de_la_source_le IS NULL
        LEFT JOIN (canon.point_odj o JOIN canon.entite z ON z.entite_id = o.entite_id AND z.retiree_de_la_source_le IS NULL)
               ON o.reunion_id = r.entite_id AND o.dossier_id = a.dossier_id
        WHERE l.de_id = a.etape_id AND l.nature = 'reunion'
        ORDER BY COALESCE(o.etat IN ('Supprimé', 'Annulé'), false), r.debut, o.ordre LIMIT 1) rl ON true
    WHERE a.programme AND a.categorie = 'case'
      AND rl.etat IS DISTINCT FROM 'Supprimé' AND rl.etat IS DISTINCT FROM 'Annulé'
    UNION ALL
    -- point d'ordre du jour de l'agenda AN lié au dossier, ni supprimé ni annulé
    SELECT o.dossier_id, (r.debut AT TIME ZONE 'Europe/Paris')::date, r.debut, pa.cle,
           CASE r.type WHEN 'seance' THEN 'Séance publique' WHEN 'commission' THEN 'Commission' ELSE 'Réunion' END
           || ' ' || CASE r.chambre WHEN 'SENAT' THEN 'Sénat' ELSE r.chambre END || COALESCE(' · ' || o.type, ''),
           o.etat, o.entite_id, 2
    FROM canon.point_odj o
    JOIN canon.entite x ON x.entite_id = o.entite_id AND x.retiree_de_la_source_le IS NULL
    JOIN canon.reunion r ON r.entite_id = o.reunion_id
    JOIN canon.entite y ON y.entite_id = r.entite_id AND y.retiree_de_la_source_le IS NULL
    JOIN d ON d.dossier_id = o.dossier_id
    LEFT JOIN lecture.parcours_acte pa ON pa.etape_id = o.etape_id
    WHERE (r.debut AT TIME ZONE 'Europe/Paris')::date >= d.date_reference
      AND o.etat IS DISTINCT FROM 'Supprimé' AND o.etat IS DISTINCT FROM 'Annulé'
    UNION ALL
    -- prochaine étape annoncée
    SELECT v.dossier_id, v.date, NULL, NULL, v.libelle, NULL, v.entite_id, 3
    FROM canon.evenement_agenda v
    JOIN canon.entite x ON x.entite_id = v.entite_id AND x.retiree_de_la_source_le IS NULL
    JOIN d ON d.dossier_id = v.dossier_id
    WHERE v.date >= d.date_reference
), prochaine AS (
    -- la plus proche ; à date égale, l'acte (il dit quelle étape)
    SELECT DISTINCT ON (dossier_id) * FROM echeance ORDER BY dossier_id, date, priorite, heure
)
SELECT d.dossier_id, d.modele, d.version, d.procedure, d.origine, d.date_reference,
       c.cle AS etape_courante, c.libelle AS etape_courante_libelle, c.etat AS etape_courante_etat,
       t.cle AS etape_attendue, t.libelle AS etape_attendue_libelle,
       d.cases_faites, d.cases_affichees, d.cases_inconnues, COALESCE(h.actes, 0) AS actes_hors_modele,
       COALESCE(v.n, 0) AS deviations, COALESCE(i.issue, 'en_cours') AS issue, r.le AS retire_le, ra.racine_id,
       p.date AS prochaine_echeance, p.heure AS prochaine_echeance_heure, p.libelle AS prochaine_echeance_libelle,
       p.etat AS prochaine_echeance_etat, p.cle AS prochaine_echeance_cle, p.source_id AS prochaine_echeance_source
FROM d
LEFT JOIN courante c ON c.dossier_id = d.dossier_id
LEFT JOIN attendue t ON t.dossier_id = d.dossier_id
LEFT JOIN hors h ON h.dossier_id = d.dossier_id
LEFT JOIN retrait r ON r.dossier_id = d.dossier_id
LEFT JOIN deviations v ON v.dossier_id = d.dossier_id
LEFT JOIN issue i ON i.dossier_id = d.dossier_id
LEFT JOIN racine ra ON ra.dossier_id = d.dossier_id
LEFT JOIN prochaine p ON p.dossier_id = d.dossier_id;
CREATE INDEX ON lecture.parcours_dossier_synthese (dossier_id);
