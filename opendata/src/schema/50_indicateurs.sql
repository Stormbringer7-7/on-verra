-- Indicateurs par député et par législature, sur tous les scrutins publics où il était en fonction
-- (votes finaux, articles, amendements, motions de procédure ; hors motions de censure).
-- Calculés à la compilation (transformations/indicateurs.py) : sur ~10 millions de couples
-- scrutin × député en fonction, une vue serait trop lente à interroger.
--   empeches     : non-votes statutaires (PAN = président de l'AN, PSE = président de séance,
--                  MG = membre du gouvernement), exclus du dénominateur de la participation
--   exprimes     : votes pour, contre ou abstention
--   dissidences  : votes exprimés différents de la ligne du groupe (position la plus fréquente)
--                  ; non-inscrits et égalités exclus : pas de ligne commune
CREATE TABLE indicateurs_deputes (
    acteur_ref          TEXT NOT NULL REFERENCES deputes,
    legislature         TEXT NOT NULL,
    scrutins            INTEGER NOT NULL,
    empeches            INTEGER NOT NULL,
    exprimes            INTEGER NOT NULL,
    delegations         INTEGER NOT NULL,
    exprimes_en_groupe  INTEGER NOT NULL,
    dissidences         INTEGER NOT NULL,
    PRIMARY KEY (acteur_ref, legislature)
);

-- Activité par député, par mois et par texte visé (cle = loi_id, ou uid du scrutin sans texte),
-- pour classer les députés sur une période (ex. 12 derniers mois) sans parcourir tous les votes.
--   votes    : lignes de vote (exprimés et non-votants) ; absences = scrutins en fonction - votes
--   ecarts   : votes exprimés différents de la ligne du groupe au moment du vote (non-inscrits exclus)
CREATE TABLE activite_deputes (
    acteur_ref   TEXT NOT NULL REFERENCES deputes,
    legislature  TEXT NOT NULL,
    mois         TEXT NOT NULL,             -- ex. "2026-03"
    cle          TEXT NOT NULL,
    votes        INTEGER NOT NULL,
    exprimes     INTEGER NOT NULL,
    pour         INTEGER NOT NULL,
    ecarts       INTEGER NOT NULL,
    PRIMARY KEY (acteur_ref, mois, cle)
) WITHOUT ROWID;
CREATE INDEX activite_mois ON activite_deputes (mois);
