-- Socle CivicTrace : enregistrements bruts, entités, correspondances, provenance, historique.
-- Règle d'or : un UUID interne stable par entité, tous les identifiants natifs conservés, une
-- correspondance explicite et auditée entre les deux.

CREATE SCHEMA IF NOT EXISTS brut;
CREATE SCHEMA IF NOT EXISTS canon;
CREATE SCHEMA IF NOT EXISTS analytique;
CREATE SCHEMA IF NOT EXISTS lecture;

-- Document brut tel que reçu. Ajout seul : une empreinte nouvelle crée une nouvelle ligne.
CREATE TABLE brut.enregistrement_source (
    source_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    systeme      TEXT NOT NULL,
    fichier      TEXT NOT NULL,                    -- nom dans l'archive brute
    chemin       TEXT NOT NULL DEFAULT '',         -- membre de l'archive, '' pour un fichier simple
    empreinte    TEXT NOT NULL,                    -- sha256 du contenu
    id_source    TEXT,
    url          TEXT,
    licence      TEXT,
    recupere_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    charge_utile JSONB,
    UNIQUE (systeme, fichier, chemin, empreinte)
);
CREATE INDEX ON brut.enregistrement_source (systeme, id_source);

-- Racine de toutes les entités : cible des clés étrangères polymorphes (doc §7).
CREATE TABLE canon.entite (
    entite_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type                    TEXT NOT NULL,
    premiere_vue            TIMESTAMPTZ NOT NULL DEFAULT now(),  -- dernière vue : max(canon.provenance.vu_le)
    retiree_de_la_source_le TIMESTAMPTZ             -- marquage, jamais de suppression
);
CREATE INDEX ON canon.entite (type);

CREATE TABLE canon.correspondance (
    correspondance_id UUID PRIMARY KEY,
    type_entite  TEXT NOT NULL,
    entite_id    UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    systeme      TEXT NOT NULL,
    type_source  TEXT NOT NULL,
    id_source    TEXT NOT NULL,
    url          TEXT,
    methode      TEXT NOT NULL CHECK (methode IN ('OFFICIAL_ID', 'EXPLICIT_REFERENCE', 'MANUAL', 'NAME_DATE')),
    statut       TEXT NOT NULL CHECK (statut IN ('PROPOSED', 'VERIFIED', 'REJECTED', 'NEEDS_REVIEW')),
    confiance    NUMERIC(4, 3),                    -- indication technique, jamais une preuve
    preuve       JSONB NOT NULL DEFAULT '{}'::jsonb,
    valide_du    DATE,
    valide_au    DATE,
    revu_par     TEXT,
    revu_le      TIMESTAMPTZ,
    cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (systeme, type_source, id_source, entite_id)
);
-- Un identifiant natif n'est jamais relié de façon certaine à deux entités.
CREATE UNIQUE INDEX correspondance_verifiee_unique
    ON canon.correspondance (systeme, type_source, id_source) WHERE statut = 'VERIFIED';
CREATE INDEX ON canon.correspondance (entite_id);
CREATE INDEX ON canon.correspondance (statut) WHERE statut IN ('PROPOSED', 'NEEDS_REVIEW');

-- Chaque écriture d'une entité garde l'enregistrement brut et le passage qui la justifient.
CREATE TABLE canon.provenance (
    entite_id UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    source_id UUID NOT NULL REFERENCES brut.enregistrement_source,
    pointeur  TEXT NOT NULL DEFAULT '',            -- JSON pointer, XPath ou ancre
    url       TEXT,
    vu_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entite_id, source_id, pointeur)
);

-- Versions précédentes d'une ligne métier : rien n'est écrasé sans trace.
CREATE TABLE canon.historique (
    entite_id    UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    type         TEXT NOT NULL,
    valeurs      JSONB NOT NULL,
    remplace_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    remplace_par UUID REFERENCES brut.enregistrement_source
);
CREATE INDEX ON canon.historique (entite_id);

-- Ce qui n'est pas un fait publié : synthèses, inférences, rapprochements analytiques.
CREATE TABLE analytique.affirmation (
    affirmation_id UUID PRIMARY KEY,
    sujet_type     TEXT NOT NULL,
    sujet_id       UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    predicat       TEXT NOT NULL,
    objet          JSONB NOT NULL,
    type           TEXT NOT NULL CHECK (type IN ('FACT', 'SUMMARY', 'INFERENCE')),
    methode        TEXT NOT NULL CHECK (methode IN ('RULE', 'HUMAN', 'LLM')),
    verification   TEXT NOT NULL CHECK (verification IN ('GENERE', 'NEEDS_REVIEW', 'RELU', 'REJETE')),
    modele         TEXT,
    version_prompt TEXT,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON analytique.affirmation (sujet_id, predicat);

CREATE TABLE analytique.preuve (
    affirmation_id UUID NOT NULL REFERENCES analytique.affirmation ON DELETE CASCADE,
    source_id      UUID NOT NULL REFERENCES brut.enregistrement_source,
    pointeur       TEXT NOT NULL DEFAULT '',
    url            TEXT,
    PRIMARY KEY (affirmation_id, source_id, pointeur)
);

-- « Signaler une erreur ou une source manquante » (design) : file de corrections.
CREATE TABLE analytique.signalement (
    signalement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cible_type     TEXT NOT NULL,
    cible_id       UUID,
    message        TEXT NOT NULL,
    contact        TEXT,
    statut         TEXT NOT NULL DEFAULT 'NOUVEAU' CHECK (statut IN ('NOUVEAU', 'EN_COURS', 'TRAITE', 'REJETE')),
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
