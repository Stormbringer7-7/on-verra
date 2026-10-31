-- Banc de revue : lots, réponses signées, issues, travaux de génération (docs/TODO.md, « Banc de
-- revue »). Un objet de revue (registre `src/banc/objets.py`) dit quoi montrer, quoi demander et
-- quel effet a l'issue ; ces tables gardent seulement ce qui s'est passé, en ajout seul.
-- Un relecteur est désigné par l'empreinte de sa clé publique Ed25519 (fichier des clés du service).

-- Ce qu'un modèle ou une personne a rédigé : une version par empreinte, la précédente citée.
ALTER TABLE analytique.affirmation
    ADD COLUMN empreinte  TEXT,                   -- sha256 du texte : ce que jugent les réponses
    ADD COLUMN version_de UUID REFERENCES analytique.affirmation,   -- version corrigée ou régénérée
    ADD COLUMN consigne   TEXT,                   -- consigne de régénération donnée en revue
    ADD COLUMN controle   JSONB;                  -- contrôle automatique (éléments introuvables…)

CREATE TABLE analytique.lot_revue (
    lot_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objet      TEXT NOT NULL,                     -- clé du registre : synthese.expose_amendement…
    mode       TEXT NOT NULL CHECK (mode IN ('OnlyOne', 'Majority', 'Everyone')),   -- figé à la création
    relecteurs TEXT[] NOT NULL CHECK (cardinality(relecteurs) >= 1),
    graine     BIGINT NOT NULL,                   -- ordre propre à chaque relecteur, rejouable
    filtre     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- comment l'échantillon a été tiré
    cree_par   TEXT NOT NULL,
    cree_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut     TEXT NOT NULL DEFAULT 'OUVERT' CHECK (statut IN ('OUVERT', 'CLOS'))
);

-- Un sujet du lot : un cas de rapprochement, ou une affirmation (sa version courante).
CREATE TABLE analytique.element_lot (
    element_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id         UUID NOT NULL REFERENCES analytique.lot_revue,
    rang           INT NOT NULL,
    sujet_type     TEXT NOT NULL,
    sujet_id       UUID,
    cas_cle        TEXT REFERENCES analytique.cas_revue (cle),
    affirmation_id UUID REFERENCES analytique.affirmation,
    empreinte      TEXT NOT NULL,                 -- version présentée aux relecteurs
    UNIQUE (lot_id, rang),
    CHECK ((cas_cle IS NULL) <> (affirmation_id IS NULL))
);

-- Réponse d'un relecteur, telle que signée. Une réponse plus récente du même relecteur sur la même
-- version remplace la précédente pour le décompte ; aucune n'est effacée.
CREATE TABLE analytique.reponse_revue (
    reponse_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    element_id UUID NOT NULL REFERENCES analytique.element_lot,
    relecteur  TEXT NOT NULL,
    empreinte  TEXT NOT NULL,                     -- version jugée
    valeurs    JSONB NOT NULL,                    -- formulaire de l'objet : {"reponse": …, "note": …}
    requete    JSONB NOT NULL,                    -- méthode, chemin, date, nonce, sha256 du corps
    signature  TEXT NOT NULL,                     -- de quoi revérifier la réponse plus tard
    recu_le    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON analytique.reponse_revue (element_id, relecteur, recu_le);

-- Issue d'un élément : par le mode (réponses suffisantes et concordantes) ou par arbitrage admin.
CREATE TABLE analytique.issue_revue (
    element_id UUID PRIMARY KEY REFERENCES analytique.element_lot,
    empreinte  TEXT NOT NULL,
    issue      JSONB NOT NULL,
    par        TEXT NOT NULL CHECK (par IN ('mode', 'arbitrage')),
    arbitre    TEXT,
    motif      TEXT,
    signature  TEXT,
    tranche_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (par = 'mode' OR (arbitre IS NOT NULL AND motif IS NOT NULL AND signature IS NOT NULL))
);

-- Rédiger (ou régénérer) un sujet : fait par le service ou pris sous bail par un poste.
CREATE TABLE analytique.travail_generation (
    travail_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objet        TEXT NOT NULL,
    sujet_type   TEXT NOT NULL,
    sujet_id     UUID NOT NULL,
    element_id   UUID REFERENCES analytique.element_lot,     -- régénération demandée en revue
    precedente   UUID REFERENCES analytique.affirmation,
    consigne     TEXT,
    statut       TEXT NOT NULL DEFAULT 'A_FAIRE' CHECK (statut IN ('A_FAIRE', 'PRIS', 'RENDU', 'ABANDONNE')),
    poste        TEXT,                            -- empreinte de la clé du poste qui l'a pris
    bail_jusqu_a TIMESTAMPTZ,                     -- passé ce délai, le travail redevient A_FAIRE
    tentatives   INT NOT NULL DEFAULT 0,
    resultat     UUID REFERENCES analytique.affirmation,
    demande_par  TEXT NOT NULL,
    demande_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
    rendu_le     TIMESTAMPTZ
);
CREATE INDEX ON analytique.travail_generation (statut, objet);

-- Anti-rejeu : un nonce n'est accepté qu'une fois par clé, jusqu'à son expiration.
CREATE TABLE analytique.nonce_revue (
    cle       TEXT NOT NULL,
    nonce     TEXT NOT NULL,
    expire_le TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (cle, nonce)
);
