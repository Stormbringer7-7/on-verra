-- Barre de parcours d'un dossier de loi (écran Dossier) : le gabarit de sa procédure
-- (45_parcours_gabarit.sql), chaque case lue dans les étapes réelles publiées (`canon.etape`), la
-- décision du Conseil constitutionnel (`canon.decision_cc`) et la loi publiée (`canon.texte_publie`).
-- Rien n'est supposé : une case sans preuve dans les données est « inconnu », jamais « faite ».
--   faite      : l'acte qui conclut la case est publié et daté au plus tard le jour de référence ;
--   en_cours   : un acte daté de la case est publié, pas celui qui la conclut ;
--   a_venir    : aucun acte, et le parcours publié n'est pas allé au-delà ;
--   sans_objet : la case n'aura pas lieu, d'après un fait publié (CMP en désaccord, conclusions de
--                CMP adoptées, texte adopté sans modification, retrait, rejet en lecture définitive)
--                ou une case facultative que le parcours a dépassée ;
--   inconnu    : la donnée ne permet pas de conclure (case obligatoire sans acte alors que la suite
--                en a, case commencée jamais conclue alors que la suite a eu lieu).
-- Jour de référence : CURRENT_DATE, ou le réglage `civictrace.date_reference` (tests). Un acte daté
-- après ce jour (séance inscrite à l'ordre du jour) est une échéance, pas une case faite.
-- Entités retirées de la source ignorées. Définitions et exemples : docs/indicateurs.md.

-- Chaque acte d'un dossier de loi rangé dans une case du gabarit (ou annexe, retrait, hors gabarit).
CREATE TABLE lecture.parcours_acte AS
WITH ref AS (
    SELECT COALESCE(NULLIF(current_setting('civictrace.date_reference', true), '')::date, CURRENT_DATE) AS jour
), etape AS (
    SELECT e.* FROM canon.etape e JOIN canon.entite x ON x.entite_id = e.entite_id
    WHERE x.retiree_de_la_source_le IS NULL
), origine AS (
    -- chambre de dépôt : celle de la première lecture publiée
    SELECT DISTINCT ON (e.dossier_id) e.dossier_id, e.chambre FROM etape e
    WHERE e.parent_id IS NULL AND e.lecture = '1' AND e.chambre IN ('AN', 'SENAT')
    ORDER BY e.dossier_id, e.ordre
), dossier AS (
    -- Lois seulement : la révision constitutionnelle (Congrès, référendum) et l'article 11 ont un
    -- autre parcours.
    SELECT d.entite_id AS dossier_id,
           CASE d.procedure_acceleree WHEN true THEN 'acceleree' WHEN false THEN 'normale' END AS procedure,
           o.chambre AS origine
    FROM canon.dossier d JOIN canon.entite x ON x.entite_id = d.entite_id
    JOIN origine o ON o.dossier_id = d.entite_id
    WHERE x.retiree_de_la_source_le IS NULL AND d.procedure_acceleree IS NOT NULL
      AND d.type_procedure ~ '^(Projet|Proposition)' AND d.type_procedure !~* 'constitutionnelle|article 11'
), classe AS (
    SELECT d.dossier_id, d.procedure, d.origine, e.entite_id AS etape_id, e.ordre, e.type, e.code_source,
           e.chambre, e.lecture, e.debut, e.statut, e.libelle, e.conclusion,
           CASE
               WHEN e.type IN ('procedure_acceleree', 'etude_impact', 'avis_ce') OR e.code_source ~ '-DPTLETTRECT$'
                   THEN 'annexe'
               WHEN e.type = 'retrait' THEN 'retrait'
               WHEN e.type = 'depot' AND e.chambre = d.origine AND e.lecture = '1' THEN 'depot'
               WHEN e.chambre IN ('AN', 'SENAT') AND e.lecture IN ('1', '2') THEN
                   CASE WHEN d.procedure = 'acceleree' AND e.lecture = '1'
                        THEN CASE WHEN e.code_source ~ '^(AN|SN)1-DEBATS' THEN 'seance_1_' ELSE 'commission_1_' END
                        ELSE 'lecture_' || e.lecture || '_' END
                   || CASE WHEN e.chambre = d.origine THEN 'o' ELSE 's' END
               WHEN e.chambre IN ('AN', 'SENAT') AND e.lecture = 'nouvelle' THEN 'nouvelle_lecture'
               WHEN e.chambre = 'AN' AND e.lecture = 'definitive' THEN 'lecture_definitive'
               -- lecture des conclusions de la CMP par chaque chambre (49.3 compris) : actes CMP-DEBATS-AN/SN…
               WHEN e.chambre = 'CMP' THEN
                   CASE WHEN e.code_source ~ '^CMP-(DEBATS|DGVT|MOTION)' THEN 'conclusions_cmp' ELSE 'cmp' END
               WHEN e.chambre = 'CC' THEN 'cc'
               WHEN e.chambre = 'PR' THEN CASE d.procedure WHEN 'acceleree' THEN 'promulgation' ELSE 'promulgation_jo' END
           END AS cle
    FROM dossier d JOIN etape e ON e.dossier_id = d.dossier_id
)
SELECT c.dossier_id, c.procedure, c.origine, c.etape_id, c.ordre, c.type, c.code_source, c.chambre, c.lecture,
       c.debut, c.statut, c.libelle, c.conclusion,
       CASE WHEN c.cle IN ('annexe', 'retrait') THEN NULL ELSE c.cle END AS cle,
       CASE WHEN c.cle IN ('annexe', 'retrait') THEN c.cle WHEN c.cle IS NULL THEN 'hors_gabarit' ELSE 'case' END
           AS categorie,
       CASE WHEN c.code_source ~ '^CMP-DEBATS-AN' THEN 'AN' WHEN c.code_source ~ '^CMP-DEBATS-SN' THEN 'SENAT'
            ELSE c.chambre END AS chambre_seance,
       COALESCE(c.statut = 'faite' AND c.debut <= r.jour, false) AS accompli,
       COALESCE(c.statut IN ('faite', 'a_venir') AND c.debut > r.jour, false) AS programme,
       -- l'acte qui conclut la case : rapport de la commission saisie au fond, décision de séance,
       -- décision de la CMP, décision du Conseil, promulgation datée
       CASE
           WHEN c.cle = 'depot' THEN true
           WHEN c.cle LIKE 'commission_1_%' THEN c.type = 'rapport' AND c.code_source ~ '-COM-FOND-RAPPORT$'
           WHEN c.cle = 'cmp' THEN c.code_source = 'CMP-DEC'
           WHEN c.cle = 'cc' THEN c.type = 'decision_cc'
           WHEN c.cle IN ('promulgation', 'promulgation_jo') THEN c.type = 'promulgation'
           WHEN c.cle IS NOT NULL THEN c.type = 'decision' AND c.code_source ~ 'DEBATS(-AN|-SN)?-DEC$'
           ELSE false
       END AS conclusif,
       r.jour AS date_reference
FROM classe c CROSS JOIN ref r;
CREATE INDEX ON lecture.parcours_acte (dossier_id, cle);

-- Une ligne par dossier et par case du gabarit.
CREATE TABLE lecture.parcours_dossier AS
WITH dossier AS (
    SELECT DISTINCT dossier_id, procedure, origine, date_reference FROM lecture.parcours_acte
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
), retrait AS (
    SELECT dossier_id, min(debut) AS le FROM lecture.parcours_acte WHERE categorie = 'retrait' AND accompli GROUP BY 1
), agg AS (
    SELECT a.dossier_id, a.cle,
           count(*) FILTER (WHERE a.accompli) AS actes,
           count(DISTINCT a.code_source) FILTER (WHERE a.accompli AND a.conclusif) AS conclusifs,
           min(a.debut) FILTER (WHERE a.accompli) AS debut,
           max(a.debut) FILTER (WHERE a.accompli AND a.conclusif) AS fin,
           min(a.debut) FILTER (WHERE a.programme) AS programmee_le,
           COALESCE(bool_or(a.conclusion ~* 'rejet') FILTER (WHERE a.accompli AND a.conclusif), false) AS rejet,
           COALESCE(bool_or(a.conclusion ~* 'sans modification') FILTER (WHERE a.accompli AND a.conclusif), false)
               AS sans_modification,
           string_agg(CASE WHEN a.cle IN ('conclusions_cmp', 'nouvelle_lecture')
                           THEN CASE a.chambre_seance WHEN 'AN' THEN 'AN : ' WHEN 'SENAT' THEN 'Sénat : ' ELSE '' END
                           ELSE '' END || a.conclusion, ' · ' ORDER BY a.debut, a.ordre)
               FILTER (WHERE a.accompli AND a.conclusif AND a.conclusion IS NOT NULL) AS conclusion,
           array_agg(a.etape_id ORDER BY a.ordre) FILTER (WHERE a.accompli OR a.programme) AS provenance
    FROM lecture.parcours_acte a WHERE a.categorie = 'case' GROUP BY 1, 2
), cases AS (
    SELECT d.dossier_id, d.procedure, d.origine, d.date_reference, g.rang, g.cle, g.facultative,
           replace(replace(g.libelle, '{o}', CASE d.origine WHEN 'AN' THEN 'AN' ELSE 'Sénat' END),
                   '{s}', CASE d.origine WHEN 'AN' THEN 'Sénat' ELSE 'AN' END) AS libelle,
           CASE g.chambre WHEN 'o' THEN d.origine WHEN 's' THEN CASE d.origine WHEN 'AN' THEN 'SENAT' ELSE 'AN' END
                ELSE g.chambre END AS chambre,
           COALESCE(a.actes, 0) AS actes, a.programmee_le, COALESCE(a.rejet, false) AS rejet,
           COALESCE(a.sans_modification, false) AS sans_modification, r.le AS retrait_le,
           CASE g.cle
               WHEN 'conclusions_cmp' THEN COALESCE(a.conclusifs >= 2 OR a.rejet, false)  -- les deux chambres, ou un rejet
               WHEN 'nouvelle_lecture' THEN COALESCE(a.conclusifs >= 2, false)          -- les deux chambres
               WHEN 'cc' THEN COALESCE(a.conclusifs > 0, false) OR k.entite_id IS NOT NULL
               WHEN 'promulgation' THEN COALESCE(a.conclusifs > 0, false) OR l.signature IS NOT NULL
               WHEN 'jo' THEN l.publication IS NOT NULL
               WHEN 'promulgation_jo' THEN l.publication IS NOT NULL
               ELSE COALESCE(a.conclusifs > 0, false)
           END AS faite,
           CASE g.cle WHEN 'jo' THEN l.publication WHEN 'cc' THEN LEAST(a.debut, k.date) ELSE a.debut END AS debut,
           CASE g.cle WHEN 'jo' THEN l.publication WHEN 'promulgation_jo' THEN l.publication
                      WHEN 'cc' THEN COALESCE(k.date, a.fin) WHEN 'promulgation' THEN COALESCE(a.fin, l.signature)
                      ELSE a.fin END AS fin,
           CASE g.cle
               WHEN 'cc' THEN COALESCE(k.solution, a.conclusion)
               WHEN 'promulgation' THEN CASE WHEN a.fin IS NOT NULL OR l.signature IS NOT NULL THEN 'Loi n° ' || l.numero END
               WHEN 'jo' THEN CASE WHEN l.publication IS NOT NULL THEN 'JO n° ' || l.numero_jo END
               WHEN 'promulgation_jo' THEN CASE WHEN l.publication IS NOT NULL
                                                THEN concat_ws(' · ', 'Loi n° ' || l.numero, 'JO n° ' || l.numero_jo) END
               ELSE a.conclusion
           END AS conclusion,
           array_remove(COALESCE(a.provenance, '{}')
               || CASE WHEN g.cle = 'cc' THEN k.entite_id END
               || CASE WHEN (g.cle = 'promulgation' AND l.signature IS NOT NULL)
                         OR (g.cle IN ('jo', 'promulgation_jo') AND l.publication IS NOT NULL) THEN l.entite_id END,
               NULL) AS provenance
    FROM dossier d
    JOIN lecture.parcours_gabarit g ON g.procedure = d.procedure
    LEFT JOIN agg a ON a.dossier_id = d.dossier_id AND a.cle = g.cle
    LEFT JOIN decision k ON k.dossier_id = d.dossier_id
    LEFT JOIN loi l ON l.dossier_id = d.dossier_id
    LEFT JOIN retrait r ON r.dossier_id = d.dossier_id
), fenetre AS (
    SELECT c.*,
           (c.actes > 0 OR c.faite) AS actif,
           COALESCE(bool_or(c.actes > 0 OR c.faite) OVER (PARTITION BY c.dossier_id ORDER BY c.rang
                    ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), false) AS apres_actif,
           COALESCE(bool_or(c.cle = 'cmp' AND c.faite AND c.conclusion !~* '^accord') OVER w, false) AS cmp_sans_accord,
           COALESCE(bool_or(c.cle = 'conclusions_cmp' AND c.faite AND NOT c.rejet) OVER w, false) AS conclusions_adoptees,
           min(c.rang) FILTER (WHERE c.sans_modification AND c.cle NOT IN ('seance_1_o', 'lecture_1_o')) OVER w
               AS rang_conforme,
           min(c.rang) FILTER (WHERE c.cle = 'lecture_definitive' AND c.rejet) OVER w AS rang_rejet
    FROM cases c
    WINDOW w AS (PARTITION BY c.dossier_id)
), etats AS (
    SELECT f.*,
           CASE
               WHEN f.faite THEN 'faite'
               WHEN f.actes > 0 AND (f.retrait_le IS NOT NULL OR f.apres_actif) THEN 'inconnu'
               WHEN f.actes > 0 THEN 'en_cours'
               WHEN f.retrait_le IS NOT NULL THEN 'sans_objet'
               WHEN f.rang > f.rang_rejet THEN 'sans_objet'
               WHEN f.cle IN ('lecture_2_o', 'lecture_2_s', 'cmp', 'conclusions_cmp', 'nouvelle_lecture', 'lecture_definitive')
                    AND f.rang > f.rang_conforme THEN 'sans_objet'
               WHEN f.cle = 'conclusions_cmp' AND f.cmp_sans_accord THEN 'sans_objet'
               WHEN f.cle IN ('nouvelle_lecture', 'lecture_definitive') AND f.conclusions_adoptees THEN 'sans_objet'
               WHEN f.facultative AND f.apres_actif THEN 'sans_objet'
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
    -- étape courante : la dernière case en cours ; à défaut, la première case à venir déjà
    -- programmée (acte daté après le jour de référence) au-delà de la dernière case active
    SELECT a.*,
           COALESCE(a.dernier_en_cours,
                    min(a.rang) FILTER (WHERE a.etat = 'a_venir' AND a.programmee_le IS NOT NULL
                                          AND a.rang > a.dernier_actif) OVER (PARTITION BY a.dossier_id))
               AS rang_courant
    FROM avancement a
)
SELECT c.dossier_id, c.procedure, c.origine, c.rang, c.cle, c.libelle, c.chambre, c.facultative, c.etat,
       c.debut, c.fin, c.programmee_le, c.conclusion, COALESCE(c.rang = c.rang_courant, false) AS courante,
       c.provenance, c.date_reference
FROM courante c;
CREATE INDEX ON lecture.parcours_dossier (dossier_id, rang);

-- Une ligne par dossier : étape courante, avancement, prochaine échéance datée.
CREATE TABLE lecture.parcours_dossier_synthese AS
WITH d AS (
    SELECT dossier_id, procedure, origine, date_reference,
           count(*) FILTER (WHERE etat = 'faite') AS cases_faites,
           count(*) FILTER (WHERE etat <> 'sans_objet') AS cases_affichees,
           count(*) FILTER (WHERE etat = 'inconnu') AS cases_inconnues
    FROM lecture.parcours_dossier GROUP BY 1, 2, 3, 4
), courante AS (
    SELECT dossier_id, cle, libelle, etat FROM lecture.parcours_dossier WHERE courante
), hors AS (
    SELECT dossier_id, count(*) AS actes FROM lecture.parcours_acte WHERE categorie = 'hors_gabarit' AND accompli GROUP BY 1
), retrait AS (
    SELECT dossier_id, min(debut) AS le FROM lecture.parcours_acte WHERE categorie = 'retrait' AND accompli GROUP BY 1
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
    -- la plus proche ; à date égale, l'acte (il dit quelle case)
    SELECT DISTINCT ON (dossier_id) * FROM echeance ORDER BY dossier_id, date, priorite, heure
)
SELECT d.dossier_id, d.procedure, d.origine, d.date_reference,
       c.cle AS etape_courante, c.libelle AS etape_courante_libelle, c.etat AS etape_courante_etat,
       d.cases_faites, d.cases_affichees, d.cases_inconnues, COALESCE(h.actes, 0) AS actes_hors_gabarit,
       r.le AS retire_le,
       p.date AS prochaine_echeance, p.heure AS prochaine_echeance_heure, p.libelle AS prochaine_echeance_libelle,
       p.etat AS prochaine_echeance_etat, p.cle AS prochaine_echeance_cle, p.source_id AS prochaine_echeance_source
FROM d
LEFT JOIN courante c ON c.dossier_id = d.dossier_id
LEFT JOIN hors h ON h.dossier_id = d.dossier_id
LEFT JOIN retrait r ON r.dossier_id = d.dossier_id
LEFT JOIN prochaine p ON p.dossier_id = d.dossier_id;
CREATE INDEX ON lecture.parcours_dossier_synthese (dossier_id);
