-- Amendements et leurs avis ; scrutins, votes individuels et positions de groupe.

CREATE TABLE canon.amendement (
    entite_id        UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id       UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    etape_id         UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED,
    texte_vise_id    UUID REFERENCES canon.document DEFERRABLE INITIALLY DEFERRED,
    parent_id        UUID REFERENCES canon.amendement DEFERRABLE INITIALLY DEFERRED,  -- sous-amendement
    chambre          TEXT NOT NULL,
    numero           TEXT NOT NULL,
    organe_examen_id UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    division         TEXT,                        -- « Article 3 », « Après l'article 5 »
    article_suivi_id UUID REFERENCES canon.article_suivi DEFERRABLE INITIALLY DEFERRED,
    url_division     TEXT,
    sort             TEXT,                        -- adopte, rejete, retire, tombe, non_soutenu, irrecevable, en_attente
    sort_source      TEXT,
    date_depot       DATE,
    date_sort        TIMESTAMPTZ,
    dispositif       TEXT,                        -- HTML tel que publié
    expose           TEXT,
    seance_id        UUID                         -- canon.reunion, cf. 0005
);
CREATE INDEX ON canon.amendement (dossier_id);
CREATE INDEX ON canon.amendement (article_suivi_id);

ALTER TABLE canon.modification_article
    ADD FOREIGN KEY (amendement_id) REFERENCES canon.amendement DEFERRABLE INITIALLY DEFERRED;

-- Avis publiés sur un amendement (Sénat : AMELI ; AN : non publiés en données structurées).
CREATE TABLE canon.avis_amendement (
    amendement_id UUID NOT NULL REFERENCES canon.amendement DEFERRABLE INITIALLY DEFERRED,
    emetteur      TEXT NOT NULL CHECK (emetteur IN ('rapporteur', 'commission', 'gouvernement')),
    avis          TEXT NOT NULL,                  -- favorable, defavorable, sagesse, retrait, autre
    avis_source   TEXT,
    source_id     UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (amendement_id, emetteur)
);

CREATE TABLE canon.scrutin (
    entite_id     UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    chambre       TEXT NOT NULL,
    numero        TEXT NOT NULL,
    legislature   TEXT,
    date          DATE NOT NULL,
    titre         TEXT NOT NULL,
    nature        TEXT,                           -- ensemble, article, amendement, motion, autre
    type_vote     TEXT,
    sort          TEXT,
    votants       INTEGER,
    pour          INTEGER,
    contre        INTEGER,
    abstentions   INTEGER,
    non_votants   INTEGER,
    dossier_id    UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    etape_id      UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED,
    amendement_id UUID REFERENCES canon.amendement DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON canon.scrutin (dossier_id);
CREATE INDEX ON canon.scrutin (date);

-- Votes individuels : rattachés à leur scrutin, sans identité propre (millions de lignes).
CREATE TABLE canon.vote (
    scrutin_id     UUID NOT NULL REFERENCES canon.scrutin DEFERRABLE INITIALLY DEFERRED,
    personne_id    UUID NOT NULL REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED,
    position       TEXT NOT NULL CHECK (position IN ('pour', 'contre', 'abstention', 'non_votant')),
    groupe_id      UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    par_delegation BOOLEAN NOT NULL DEFAULT false,
    cause          TEXT,
    source_id      UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (scrutin_id, personne_id)
);
CREATE INDEX ON canon.vote (personne_id);

CREATE TABLE canon.position_groupe (
    scrutin_id          UUID NOT NULL REFERENCES canon.scrutin DEFERRABLE INITIALLY DEFERRED,
    groupe_id           UUID NOT NULL REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    position_majoritaire TEXT,
    membres             INTEGER,
    pour                INTEGER,
    contre              INTEGER,
    abstentions         INTEGER,
    non_votants         INTEGER,
    source_id           UUID NOT NULL REFERENCES brut.enregistrement_source,
    PRIMARY KEY (scrutin_id, groupe_id)
);
