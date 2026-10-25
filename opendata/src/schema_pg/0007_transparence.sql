-- Déclarations HATVP publiées et représentation d'intérêts. Seul ce que la HATVP publie, tel quel.
-- Un intérêt déclaré n'est pas un conflit d'intérêts ; une action déclarée n'est pas une influence.

CREATE TABLE canon.declaration (
    entite_id        UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    personne_id      UUID REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,  -- seulement si certain
    declarant_libelle TEXT NOT NULL,
    type             TEXT NOT NULL,               -- DI, DIA, DIAM, DSP…
    type_libelle     TEXT,
    modificative     BOOLEAN,
    qualite          TEXT,
    mandat           TEXT,
    date_depot       DATE,
    date_publication DATE,
    url              TEXT
);
CREATE INDEX ON canon.declaration (personne_id);

CREATE TABLE canon.rubrique_declaree (
    declaration_id UUID NOT NULL REFERENCES canon.declaration DEFERRABLE INITIALLY DEFERRED,
    rubrique       TEXT NOT NULL,                 -- activProfCinqDerniereDto, fonctionBenevoleDto…
    ordre          INTEGER NOT NULL,
    neant          BOOLEAN NOT NULL,
    contenu        JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_id      UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (declaration_id, rubrique, ordre)
);

-- Le représentant d'intérêts est une organisation (type 'representant_interets') ; ses
-- attributs propres au répertoire vivent ici.
CREATE TABLE canon.representant_interets (
    entite_id            UUID PRIMARY KEY REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    identifiant_national TEXT,
    type_identifiant     TEXT,                    -- SIREN, RNA, HATVP
    categorie            TEXT,
    premiere_publication DATE,
    secteurs             TEXT[]
);

CREATE TABLE canon.exercice_representation (
    representant_id  UUID NOT NULL REFERENCES canon.representant_interets DEFERRABLE INITIALLY DEFERRED,
    debut            DATE NOT NULL,
    fin              DATE NOT NULL,
    montant_depense  TEXT,                        -- tranche telle que publiée
    nombre_salaries  NUMERIC,
    nombre_actions   INTEGER,
    source_id        UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (representant_id, debut)
);

CREATE TABLE canon.action_representation (
    entite_id            UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    representant_id      UUID NOT NULL REFERENCES canon.representant_interets DEFERRABLE INITIALLY DEFERRED,
    exercice_debut       DATE,
    exercice_fin         DATE,
    objet                TEXT NOT NULL,
    domaines             TEXT[],
    actions_menees       TEXT[],
    responsables_publics TEXT[],                  -- catégories, jamais des personnes
    decisions_concernees TEXT[],
    tiers                TEXT[],
    publiee_le           TIMESTAMPTZ,
    objet_recherche      TSVECTOR GENERATED ALWAYS AS (to_tsvector('french', objet)) STORED
);
CREATE INDEX ON canon.action_representation (representant_id);
CREATE INDEX ON canon.action_representation USING gin (objet_recherche);
