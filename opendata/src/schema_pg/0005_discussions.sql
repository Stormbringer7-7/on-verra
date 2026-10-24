-- Discussions : réunions (séances, commissions), points d'ordre du jour, interventions avec leur
-- texte intégral, présences et auditions. Fonction critique : « Qui intervient » et « ce qui a été dit ».

CREATE TABLE canon.reunion (
    entite_id       UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    type            TEXT NOT NULL CHECK (type IN ('seance', 'commission', 'autre')),
    chambre         TEXT NOT NULL,
    organe_id       UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    debut           TIMESTAMPTZ,
    legislature     TEXT,
    compte_rendu_id UUID REFERENCES canon.document DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON canon.reunion (debut);

ALTER TABLE canon.amendement
    ADD FOREIGN KEY (seance_id) REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE canon.evenement_agenda
    ADD FOREIGN KEY (reunion_id) REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE canon.point_odj (
    entite_id  UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    reunion_id UUID NOT NULL REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED,
    ordre      INTEGER,
    objet      TEXT,
    type       TEXT,
    etat       TEXT,                              -- Confirmé, Supprimé… (tel que publié)
    dossier_id UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    etape_id   UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED
);

-- Une prise de parole, telle que publiée. L'orateur peut rester non résolu (personne auditionnée,
-- nom seul dans un compte rendu de commission) : `orateur_libelle` garde alors le nom publié.
CREATE TABLE canon.intervention (
    entite_id          UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    reunion_id         UUID NOT NULL REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED,
    point_odj_id       UUID REFERENCES canon.point_odj DEFERRABLE INITIALLY DEFERRED,
    ordre              INTEGER NOT NULL,
    horodatage_s       NUMERIC,                   -- secondes depuis l'ouverture (Syceron « stime »)
    orateur_id         UUID REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,
    orateur_libelle    TEXT NOT NULL,
    qualite            TEXT,                      -- rapporteur, ministre, président…
    role               TEXT,
    groupe_id          UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    texte              TEXT NOT NULL,
    empreinte          TEXT NOT NULL,
    point_titre        TEXT,                      -- titre du point du compte rendu, tel que publié
    -- Dossier relié seulement par référence explicite (numéro de texte cité par le compte rendu,
    -- amendement discuté), jamais par ressemblance de titres.
    dossier_id         UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    article            TEXT,                      -- article en discussion, tel que publié
    amendements        TEXT,                      -- numéros d'amendements discutés, tels que publiés
    amendement_id      UUID REFERENCES canon.amendement DEFERRABLE INITIALLY DEFERRED,
    texte_recherche    TSVECTOR GENERATED ALWAYS AS (to_tsvector('french', texte)) STORED,
    UNIQUE (reunion_id, ordre)
);
CREATE INDEX ON canon.intervention (orateur_id);
CREATE INDEX ON canon.intervention (dossier_id);
CREATE INDEX ON canon.intervention (amendement_id);
CREATE INDEX ON canon.intervention USING gin (texte_recherche);

CREATE TABLE canon.participation (
    reunion_id  UUID NOT NULL REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED,
    personne_id UUID NOT NULL REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,
    presence    TEXT NOT NULL,                    -- present, absent, excuse
    source_id   UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (reunion_id, personne_id)
);

CREATE TABLE canon.audition (
    reunion_id  UUID NOT NULL REFERENCES canon.reunion DEFERRABLE INITIALLY DEFERRED,
    ordre       INTEGER NOT NULL,
    nom_publie  TEXT NOT NULL,
    qualite     TEXT,
    personne_id UUID REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,   -- seulement si certain
    source_id   UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (reunion_id, ordre)
);

CREATE TABLE canon.question (
    entite_id   UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    chambre     TEXT NOT NULL,
    type        TEXT NOT NULL,                    -- QG, QE, QOSD
    numero      TEXT NOT NULL,
    legislature TEXT,
    auteur_id   UUID REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,
    ministere   TEXT,
    rubrique    TEXT,
    titre       TEXT,
    date        DATE,
    date_reponse DATE
);
CREATE INDEX ON canon.question (auteur_id);
