-- Modèles de parcours : le cycle de vie de chaque type de dossier, tel que le prévoit le droit,
-- versionné (une réforme ou une autre juridiction = une nouvelle version, l'ancienne reste).
-- Écrits à la main dans `opendata/parcours/*.toml` (le commit vaut décision humaine), rechargés à
-- chaque projection (`src/parcours.py`) ; le parcours suivi de chaque dossier en est calculé
-- (projections 45 et 55), jamais saisi. Remplace l'ancien gabarit `lecture.parcours_gabarit`.

CREATE TABLE canon.parcours_modele (
    cle         TEXT NOT NULL,
    version     INTEGER NOT NULL,
    libelle     TEXT NOT NULL,
    famille     TEXT NOT NULL,                    -- legislatif, resolution, controle, gouvernement, autre
    juridiction TEXT NOT NULL,                    -- FR ; UE plus tard
    valide_du   DATE NOT NULL,                    -- date de dépôt du dossier à partir de laquelle la version s'applique
    valide_au   DATE,                             -- exclue ; NULL = en vigueur
    fondement   TEXT NOT NULL,
    fichier     TEXT NOT NULL,
    PRIMARY KEY (cle, version)
);

-- Types de dossier publiés par les sources (AN : `procedureParlementaire`, Sénat : `typloi`) qui
-- suivent le modèle.
CREATE TABLE canon.parcours_type (
    modele      TEXT NOT NULL,
    version     INTEGER NOT NULL,
    type_source TEXT NOT NULL,
    PRIMARY KEY (modele, version, type_source),
    FOREIGN KEY (modele, version) REFERENCES canon.parcours_modele
);

-- Étapes du modèle, dans l'ordre du droit commun. Une étape reçoit les actes de ses phases, de sa
-- lecture et de son côté de la navette ; `nature` : obligatoire, conditionnelle, facultative.
CREATE TABLE canon.parcours_etape (
    modele      TEXT NOT NULL,
    version     INTEGER NOT NULL,
    cle         TEXT NOT NULL,
    rang        INTEGER NOT NULL,
    libelle     TEXT NOT NULL,                    -- {o} et {s} : chambre de dépôt et l'autre
    phases      TEXT[] NOT NULL,                  -- depot, commission, seance, cmp, cc, promulgation…
    conclut     TEXT[] NOT NULL,                  -- phases dont un acte conclusif dit l'étape faite
    lecture     TEXT NOT NULL,                    -- 1, 2, n (3e et suivantes), nouvelle, definitive, cmp, * (toutes)
    cote        TEXT NOT NULL,                    -- o, s, AN, SENAT, CMP, CC, PR, JO, * (toutes)
    nature      TEXT NOT NULL CHECK (nature IN ('obligatoire', 'conditionnelle', 'facultative')),
    conclusifs  INTEGER NOT NULL DEFAULT 1,       -- actes conclusifs distincts pour la dire faite (2 : les deux chambres)
    issue       TEXT,                             -- issue du dossier quand l'étape est faite (promulgue, adopte…)
    PRIMARY KEY (modele, version, cle),
    FOREIGN KEY (modele, version) REFERENCES canon.parcours_modele
);

-- Branches conditionnelles du droit commun : quand la conclusion de `de` correspond à
-- `condition`, le parcours saute à `vers` ; les étapes entre les deux sont sans objet.
CREATE TABLE canon.parcours_transition (
    modele    TEXT NOT NULL,
    version   INTEGER NOT NULL,
    de        TEXT NOT NULL,
    vers      TEXT NOT NULL,
    condition TEXT NOT NULL,                      -- expression régulière, sans casse
    libelle   TEXT NOT NULL,
    FOREIGN KEY (modele, version) REFERENCES canon.parcours_modele
);

-- Déviations possibles : un événement qui modifie le parcours de droit commun. `effet` : rejoint
-- (le parcours reprend), termine, remplace (l'étape est remplacée), suspend ; `effet_si` : effet
-- quand une conclusion des actes de la déviation correspond à `si`.
CREATE TABLE canon.parcours_deviation (
    modele    TEXT NOT NULL,
    version   INTEGER NOT NULL,
    cle       TEXT NOT NULL,
    libelle   TEXT NOT NULL,
    fondement TEXT NOT NULL,
    effet     TEXT NOT NULL CHECK (effet IN ('rejoint', 'termine', 'remplace', 'suspend')),
    si        TEXT,
    effet_si  TEXT CHECK (effet_si IN ('rejoint', 'termine', 'remplace', 'suspend')),
    issue     TEXT,                               -- issue du dossier quand la déviation termine
    PRIMARY KEY (modele, version, cle),
    FOREIGN KEY (modele, version) REFERENCES canon.parcours_modele
);

-- Codes d'actes publiés par une source -> phase et rôle, communs à tous les modèles ; le premier
-- motif qui correspond (par rang) l'emporte. Rôle : ouvre (l'étape a commencé), conclut (l'acte qui
-- la dit faite), annexe (montré, sans effet), deviation (acte d'une déviation, rattaché à l'étape).
CREATE TABLE canon.parcours_correspondance (
    juridiction TEXT NOT NULL,
    rang        INTEGER NOT NULL,
    systeme     TEXT NOT NULL,                    -- AN, SENAT
    motif       TEXT NOT NULL,                    -- expression régulière sur `canon.etape.code_source`
    phase       TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('ouvre', 'conclut', 'annexe', 'deviation')),
    deviation   TEXT,
    fichier     TEXT NOT NULL,
    PRIMARY KEY (juridiction, rang)
);
