-- Contrôle de constitutionnalité, promulgation et publication au Journal officiel.

CREATE TABLE canon.decision_cc (
    entite_id  UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    numero     TEXT NOT NULL,                     -- « 2026-910 DC »
    type       TEXT,                              -- DC, QPC, autre
    date       DATE,
    solution   TEXT,                              -- conforme, partiellement_conforme, non_conforme…
    nor_loi    TEXT,
    dossier_id UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    url        TEXT
);

-- Le texte publié est un objet distinct du texte adopté, relié au dossier.
CREATE TABLE canon.texte_publie (
    entite_id    UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    nature       TEXT NOT NULL,                   -- LOI, LOI_ORGANIQUE…
    numero       TEXT,                            -- « 2026-247 »
    nor          TEXT,
    titre        TEXT,
    date_signature DATE,
    date_publication DATE,
    numero_jo    TEXT,
    dossier_id   UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    url          TEXT
);
CREATE UNIQUE INDEX ON canon.texte_publie (nor) WHERE nor IS NOT NULL;
