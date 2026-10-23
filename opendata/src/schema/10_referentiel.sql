-- Référentiel des députés : groupes, appartenances, mandats.

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
