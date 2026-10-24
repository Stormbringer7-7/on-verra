-- Personnes publiques, organisations et fonctions datées (AN, Sénat, Gouvernement, RNE).
-- Les dates sont celles de la source, même incohérentes (fin avant début) : c'est un contrôle
-- du rapport qualité, pas un rejet (doc §9).

CREATE TABLE canon.personne (
    entite_id   UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    civilite    TEXT,
    prenom      TEXT,
    nom         TEXT NOT NULL,
    nom_affiche TEXT NOT NULL
);
CREATE INDEX ON canon.personne (lower(nom));

CREATE TABLE canon.organisation (
    entite_id    UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    -- assemblee, commission, groupe_politique, gouvernement, ministere, cmp, collectivite, epci,
    -- juridiction, representant_interets, autre
    type         TEXT NOT NULL,
    type_source  TEXT,                             -- ex. codeType de l'AMO (GP, COMPER, GOUVERNEMENT…)
    nom          TEXT NOT NULL,
    nom_court    TEXT,
    abrege       TEXT,
    couleur      TEXT,
    chambre      TEXT,                             -- AN, SENAT, null hors Parlement
    legislature  TEXT,
    debut        DATE,
    fin          DATE,
    parent_id    UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE canon.fonction (
    entite_id       UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    personne_id     UUID NOT NULL REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,
    organisation_id UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    -- depute, senateur, membre_gouvernement, membre_commission, membre_groupe, membre_cmp,
    -- mandat_local, bureau, autre
    type            TEXT NOT NULL,
    titre           TEXT NOT NULL,                 -- « Députée de l'Essonne, 4e circonscription »
    qualite         TEXT,                          -- membre, président, rapporteur…
    debut           DATE,
    fin             DATE,
    territoire      TEXT,                          -- département, circonscription, commune…
    legislature     TEXT
);
CREATE INDEX ON canon.fonction (personne_id);
CREATE INDEX ON canon.fonction (organisation_id, debut);

-- Relations sourcées entre entités, sans identité propre : auteur, cosignataire, rapporteur,
-- membre de la CMP, saisissant du CC… Remplacées en bloc à chaque lecture de leur source.
CREATE TABLE canon.lien (
    de_id     UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    nature    TEXT NOT NULL,
    vers_id   UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    attributs JSONB NOT NULL DEFAULT '{}'::jsonb,
    ordre     INTEGER,
    debut     DATE,
    fin       DATE,
    source_id UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (de_id, nature, vers_id)
);
CREATE INDEX ON canon.lien (vers_id, nature);
