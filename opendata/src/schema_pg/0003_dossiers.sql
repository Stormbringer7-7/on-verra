-- Cycle législatif : dossier, étapes réelles, documents, textes et articles versionnés.
-- Un projet, ses versions, le texte adopté et la loi promulguée sont liés mais distincts.

CREATE TABLE canon.dossier (
    entite_id           UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    titre               TEXT NOT NULL,
    titre_court         TEXT,
    type_procedure      TEXT,                     -- libellé source (« Proposition de loi ordinaire »)
    procedure_acceleree BOOLEAN,
    initiative          TEXT CHECK (initiative IN ('gouvernement', 'parlementaire')),
    legislature         TEXT,
    date_depot          DATE,
    statut              TEXT                      -- en_cours, adopte, promulgue, rejete, retire, caduc
);

CREATE TABLE canon.etape (
    entite_id   UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id  UUID NOT NULL REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    parent_id   UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED,
    -- depot, commission, seance, cmp, decision, saisine_cc, decision_cc, promulgation, publication_jo,
    -- autre ; le libellé natif reste dans code_source
    type        TEXT NOT NULL,
    code_source TEXT,                             -- ex. codeActe AN « SN1-COM-FOND »
    libelle     TEXT,
    chambre     TEXT,                             -- AN, SENAT, CMP, CC, PR, JO
    lecture     TEXT,                             -- 1, 2, nouvelle, definitive, unique, cmp
    ordre       INTEGER NOT NULL,
    organe_id   UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    debut       DATE,
    fin         DATE,
    -- faite, en_cours, a_venir, absente, sans_objet, inconnue : jamais supposée
    statut      TEXT NOT NULL DEFAULT 'faite',
    conclusion  TEXT
);
CREATE INDEX ON canon.etape (dossier_id, ordre);

CREATE TABLE canon.document (
    entite_id  UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    etape_id   UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED,
    -- projet, proposition, rapport, avis, texte_commission, texte_adopte, etude_impact, avis_ce,
    -- compte_rendu, saisine, decision, loi, autre
    type       TEXT NOT NULL,
    type_source TEXT,
    titre      TEXT,
    numero     TEXT,
    date       DATE,
    url        TEXT
);
CREATE INDEX ON canon.document (dossier_id);

-- Texte à un instant du parcours. Jamais écrasé : une étape = une version.
CREATE TABLE canon.version_texte (
    entite_id   UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id  UUID NOT NULL REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    document_id UUID REFERENCES canon.document DEFERRABLE INITIALLY DEFERRED,
    etape_id    UUID REFERENCES canon.etape DEFERRABLE INITIALLY DEFERRED,
    -- depose, commission, adopte, transmis, cmp, definitif, promulgue, consolide
    nature      TEXT NOT NULL,
    chambre     TEXT,
    date        DATE,
    format      TEXT                              -- html_an, akn_senat, legi
);

-- Identité d'un article à travers les versions (renumérotations, « bis », suppressions).
CREATE TABLE canon.article_suivi (
    entite_id      UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id     UUID NOT NULL REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    numero_initial TEXT,
    intitule       TEXT
);

CREATE TABLE canon.version_article (
    entite_id        UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    version_texte_id UUID NOT NULL REFERENCES canon.version_texte DEFERRABLE INITIALLY DEFERRED,
    article_suivi_id UUID REFERENCES canon.article_suivi DEFERRABLE INITIALLY DEFERRED,
    numero           TEXT NOT NULL,
    intitule         TEXT,
    ordre            INTEGER NOT NULL,
    texte            TEXT NOT NULL,
    empreinte        TEXT NOT NULL,
    statut           TEXT NOT NULL DEFAULT 'present'   -- present, supprime, ajoute
);
CREATE INDEX ON canon.version_article (article_suivi_id);

-- Ce qui a fait passer un article d'une version à la suivante. L'attribution à un amendement
-- n'est certaine que si elle est vérifiée ; sinon l'interface affiche « origine non établie ».
CREATE TABLE canon.modification_article (
    version_article_id   UUID NOT NULL REFERENCES canon.version_article DEFERRABLE INITIALLY DEFERRED,
    version_precedente_id UUID REFERENCES canon.version_article DEFERRABLE INITIALLY DEFERRED,
    origine              TEXT NOT NULL CHECK (origine IN ('amendement', 'compromis_cmp', 'inconnue')),
    amendement_id        UUID,                    -- canon.amendement, cf. 0004
    statut               TEXT NOT NULL CHECK (statut IN ('VERIFIED', 'NEEDS_REVIEW', 'REJECTED')),
    diff                 JSONB,
    source_id            UUID NOT NULL REFERENCES brut.enregistrement_source
);
CREATE UNIQUE INDEX modification_article_unique ON canon.modification_article
    (version_article_id, origine, COALESCE(amendement_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Prochaines étapes annoncées (Accueil : « lecture définitive le 05/11 »).
CREATE TABLE canon.evenement_agenda (
    entite_id  UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    dossier_id UUID REFERENCES canon.dossier DEFERRABLE INITIALLY DEFERRED,
    reunion_id UUID,                              -- canon.reunion, cf. 0005
    date       DATE NOT NULL,
    libelle    TEXT NOT NULL,
    type_etape TEXT
);
