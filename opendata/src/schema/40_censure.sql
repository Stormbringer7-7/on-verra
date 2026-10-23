-- Recours au 49.3 et motions de censure.

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
