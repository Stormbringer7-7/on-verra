-- Votes nominatifs, lignes de groupe et mises au point.

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
) WITHOUT ROWID;                            -- rangée dans l'ordre de sa clé : pas d'index en double (~2,5 M lignes)
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
) WITHOUT ROWID;

-- Rectifications déclarées après le scrutin : n'altèrent pas le résultat officiel.
CREATE TABLE mises_au_point (
    scrutin_uid        TEXT NOT NULL REFERENCES scrutins,
    acteur_ref         TEXT NOT NULL REFERENCES deputes,
    position_souhaitee TEXT NOT NULL,
    dysfonctionnement  INTEGER NOT NULL     -- 1 = vote mal enregistré par le système
);
