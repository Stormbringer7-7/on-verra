-- Schéma de la base des votes finaux de l'Assemblée nationale.

CREATE TABLE groupes (
    organe_ref  TEXT PRIMARY KEY,          -- ex. PO845401
    libelle     TEXT NOT NULL,
    abrege      TEXT,
    legislature TEXT,
    couleur     TEXT                       -- couleur officielle du groupe (#rrggbb)
);

-- Appartenance d'un député à un groupe, par période.
CREATE TABLE appartenances (
    mandat_ref  TEXT PRIMARY KEY,
    acteur_ref  TEXT NOT NULL,
    groupe_ref  TEXT NOT NULL,
    date_debut  TEXT NOT NULL,
    date_fin    TEXT
);
CREATE INDEX appartenances_acteur ON appartenances (acteur_ref);

CREATE TABLE deputes (
    acteur_ref      TEXT PRIMARY KEY,      -- ex. PA794770
    civilite        TEXT,
    prenom          TEXT NOT NULL,
    nom             TEXT NOT NULL,
    departement     TEXT,                  -- circonscription du dernier mandat
    num_departement TEXT,
    num_circo       TEXT
);

-- Mandats de député (organe ASSEMBLEE) : sert à savoir qui siégeait à une date donnée.
CREATE TABLE mandats (
    mandat_ref  TEXT PRIMARY KEY,
    acteur_ref  TEXT NOT NULL REFERENCES deputes,
    legislature TEXT NOT NULL,
    date_debut  TEXT NOT NULL,
    date_fin    TEXT,                      -- NULL = mandat en cours
    place       INTEGER                    -- siège dans l'hémicycle (dernier connu pour ce mandat)
);
CREATE INDEX mandats_acteur ON mandats (acteur_ref);

-- Une loi = un dossier législatif. Quand le scrutin n'est rattaché à aucun dossier,
-- l'id est dérivé du titre du texte (préfixe "titre:").
CREATE TABLE lois (
    id                  TEXT PRIMARY KEY,
    dossier_ref         TEXT,
    titre               TEXT NOT NULL,
    procedure           TEXT,
    legislature         TEXT,
    procedure_acceleree INTEGER,
    cmp                 INTEGER,              -- commission mixte paritaire convoquée
    saisine_cc          INTEGER,              -- Conseil constitutionnel saisi par des élus ou l'exécutif
    decision_cc         TEXT,
    promulgation        TEXT,                 -- date de promulgation, NULL si pas (encore) promulguée
    nb_scrutins         INTEGER,              -- tous scrutins publics sur le texte (amendements, articles…)
    niveau              TEXT CHECK (niveau IN ('majeure', 'standard', 'technique')),
    saillance           REAL,                 -- 0 à 100, pour trier à l'intérieur d'un niveau
    raisons             TEXT                  -- critères qui ont fixé le niveau
);

-- Scrutins publics sur l'ensemble d'un texte (ou sur son article unique).
CREATE TABLE scrutins (
    uid         TEXT PRIMARY KEY,          -- ex. VTANR5L17V1330
    numero      INTEGER NOT NULL,
    legislature TEXT NOT NULL,
    date        TEXT NOT NULL,
    titre       TEXT NOT NULL,
    nature      TEXT NOT NULL CHECK (nature IN ('ensemble', 'article_unique')),
    lecture     TEXT,                      -- ex. "première lecture", "texte de la commission mixte paritaire"
    type_vote   TEXT,                      -- ordinaire / solennel
    sort        TEXT,                      -- adopté / rejeté
    loi_id      TEXT NOT NULL REFERENCES lois,
    nb_votants  INTEGER,
    pour        INTEGER,
    contre      INTEGER,
    abstentions INTEGER,
    non_votants INTEGER
);
CREATE INDEX scrutins_loi ON scrutins (loi_id);

-- Vote nominatif tel qu'enregistré officiellement.
CREATE TABLE votes (
    scrutin_uid    TEXT NOT NULL REFERENCES scrutins,
    acteur_ref     TEXT NOT NULL REFERENCES deputes,
    mandat_ref     TEXT,
    groupe_ref     TEXT REFERENCES groupes, -- groupe au moment du vote
    position       TEXT NOT NULL CHECK (position IN ('pour', 'contre', 'abstention', 'non_votant')),
    par_delegation INTEGER NOT NULL,        -- 1 = vote par procuration, le député n'était pas en séance
    cause          TEXT,                    -- motif de non-vote (ex. PAN = président de séance)
    num_place      INTEGER,                 -- siège occupé lors du vote (publié depuis la 17e)
    PRIMARY KEY (scrutin_uid, acteur_ref)
);
CREATE INDEX votes_acteur ON votes (acteur_ref);

-- Ligne de chaque groupe sur chaque scrutin.
CREATE TABLE positions_groupes (
    scrutin_uid          TEXT NOT NULL REFERENCES scrutins,
    groupe_ref           TEXT NOT NULL REFERENCES groupes,
    ligne                TEXT,               -- position la plus fréquente ; NULL si égalité ou aucun vote
    position_officielle  TEXT,               -- positionMajoritaire publié par l'AN, parfois erroné
    membres              INTEGER,
    pour                 INTEGER,
    contre               INTEGER,
    abstentions          INTEGER,
    PRIMARY KEY (scrutin_uid, groupe_ref)
);

-- Engagements de responsabilité du gouvernement (article 49, alinéa 3) sur un texte.
CREATE TABLE engagements_49_3 (
    id      INTEGER PRIMARY KEY,
    loi_id  TEXT NOT NULL REFERENCES lois,
    etape   TEXT NOT NULL,                    -- AN1 = 1re lecture, CMP, ANNLEC = nouvelle lecture, ANLDEF…
    date    TEXT NOT NULL,
    issue   TEXT                              -- ex. "considéré comme adopté … article 49, alinéa 3"
);

-- Motions de censure : après un 49.3 (rattachées à l'engagement) ou spontanées (49.2).
CREATE TABLE motions_censure (
    scrutin_uid   TEXT PRIMARY KEY,
    numero        INTEGER NOT NULL,
    legislature   TEXT NOT NULL,
    date          TEXT NOT NULL,
    titre         TEXT NOT NULL,
    article       TEXT NOT NULL CHECK (article IN ('49-2', '49-3')),
    loi_id        TEXT REFERENCES lois,
    engagement_id INTEGER REFERENCES engagements_49_3,
    pour          INTEGER NOT NULL,
    requis        INTEGER NOT NULL,           -- majorité absolue des membres
    adoptee       INTEGER NOT NULL            -- 1 = gouvernement renversé
);

-- Seuls les votes favorables à une motion de censure sont publiés.
CREATE TABLE votes_censure (
    scrutin_uid    TEXT NOT NULL REFERENCES motions_censure,
    acteur_ref     TEXT NOT NULL REFERENCES deputes,
    groupe_ref     TEXT REFERENCES groupes,
    par_delegation INTEGER NOT NULL,
    num_place      INTEGER,
    PRIMARY KEY (scrutin_uid, acteur_ref)
);

-- Rectifications déclarées après le scrutin : n'altèrent pas le résultat officiel.
CREATE TABLE mises_au_point (
    scrutin_uid        TEXT NOT NULL REFERENCES scrutins,
    acteur_ref         TEXT NOT NULL REFERENCES deputes,
    position_souhaitee TEXT NOT NULL,
    dysfonctionnement  INTEGER NOT NULL     -- 1 = vote mal enregistré par le système
);

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

-- Vue pratique : qui a voté quoi, avec noms et groupes.
CREATE VIEW votes_detail AS
SELECT l.titre AS loi, s.uid AS scrutin_uid, s.numero, s.date, s.lecture, s.sort,
       d.prenom, d.nom, g.abrege AS groupe, v.position, v.par_delegation
FROM votes v
JOIN scrutins s ON s.uid = v.scrutin_uid
JOIN lois l ON l.id = s.loi_id
JOIN deputes d ON d.acteur_ref = v.acteur_ref
LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref;

-- Indicateurs par député et par législature, sur les scrutins finaux où il était en fonction.
--   empeches     : non-votes statutaires (PAN = président de l'AN, PSE = président de séance,
--                  MG = membre du gouvernement), exclus du dénominateur de la participation
--   exprimes     : votes pour, contre ou abstention
--   dissidences  : votes exprimés différents de la ligne du groupe (position la plus fréquente)
--                  ; non-inscrits et égalités exclus : pas de ligne commune
CREATE VIEW indicateurs_deputes AS
WITH en_fonction AS (
    SELECT DISTINCT s.uid AS scrutin_uid, s.legislature, m.acteur_ref
    FROM scrutins s
    JOIN mandats m
      ON m.legislature = s.legislature
     AND m.date_debut <= s.date
     AND (m.date_fin IS NULL OR m.date_fin >= s.date)
),
detail AS (
    SELECT f.acteur_ref, f.legislature, v.position, v.par_delegation, v.cause,
           v.position IN ('pour', 'contre', 'abstention') AS exprime,
           CASE WHEN g.abrege != 'NI' THEN pg.ligne END AS ligne
    FROM en_fonction f
    LEFT JOIN votes v ON v.scrutin_uid = f.scrutin_uid AND v.acteur_ref = f.acteur_ref
    LEFT JOIN groupes g ON g.organe_ref = v.groupe_ref
    LEFT JOIN positions_groupes pg ON pg.scrutin_uid = v.scrutin_uid AND pg.groupe_ref = v.groupe_ref
)
SELECT acteur_ref, legislature,
       COUNT(*)                                                  AS scrutins,
       SUM(CASE WHEN cause IN ('PAN', 'PSE', 'MG') THEN 1 ELSE 0 END) AS empeches,
       SUM(CASE WHEN exprime THEN 1 ELSE 0 END)                  AS exprimes,
       SUM(CASE WHEN exprime AND par_delegation THEN 1 ELSE 0 END) AS delegations,
       SUM(CASE WHEN exprime AND ligne IS NOT NULL THEN 1 ELSE 0 END) AS exprimes_en_groupe,
       SUM(CASE WHEN exprime AND ligne IS NOT NULL AND position != ligne THEN 1 ELSE 0 END) AS dissidences
FROM detail
GROUP BY acteur_ref, legislature;
