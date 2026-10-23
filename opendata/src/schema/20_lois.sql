-- Lois et scrutins publics.

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

-- Tous les scrutins publics (hors motions de censure, table motions_censure).
-- nature : ensemble | article_unique = vote final sur un texte de loi (vue scrutins_finaux) ;
--          article | amendement | motion (rejet préalable, renvoi en commission…) | autre
--          (première partie d'un budget, résolution, déclaration du gouvernement…).
CREATE TABLE scrutins (
    uid         TEXT PRIMARY KEY,          -- ex. VTANR5L17V1330
    numero      INTEGER NOT NULL,
    legislature TEXT NOT NULL,
    date        TEXT NOT NULL,
    titre       TEXT NOT NULL,             -- intitulé officiel, ex. "l'amendement n° 15 de M. X à l'article…"
    nature      TEXT NOT NULL CHECK (nature IN ('ensemble', 'article_unique', 'article', 'amendement',
                                                'motion', 'autre')),
    lecture     TEXT,                      -- ex. "première lecture", "texte de la commission mixte paritaire"
    type_vote   TEXT,                      -- ordinaire / solennel
    sort        TEXT,                      -- adopté / rejeté
    loi_id      TEXT REFERENCES lois,      -- texte visé ; NULL si aucun dossier législatif n'est retrouvé
    nb_votants  INTEGER,
    pour        INTEGER,
    contre      INTEGER,
    abstentions INTEGER,
    non_votants INTEGER
);
CREATE INDEX scrutins_loi ON scrutins (loi_id);
CREATE INDEX scrutins_date ON scrutins (legislature, date);
