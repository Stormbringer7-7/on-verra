-- Revue humaine des rapprochements : tout cas que le code ne peut pas trancher par référence
-- explicite (ambiguïté, absence, conflit, nom seul) est consigné ici, avec ses candidats et ses
-- preuves. Rien n'est appliqué sans décision humaine tracée. Cf. docs/rapprochements.md.

CREATE TABLE analytique.cas_revue (
    cas_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL,                -- amendement_ambigu, orateur_commission…
    cle             TEXT NOT NULL UNIQUE,         -- stable d'un chargement à l'autre
    -- champ : choisir un candidat renseigne `champ` sur les cibles ;
    -- identite : choisir un candidat relie l'identité du sujet à cette entité (correspondance MANUAL) ;
    -- constat : rien à choisir, on constate (référence absente, document illisible…)
    nature          TEXT NOT NULL CHECK (nature IN ('champ', 'identite', 'constat')),
    constat         TEXT NOT NULL,                -- phrase lisible : ce qui pose problème
    sujet_type      TEXT,
    sujet_identite  TEXT,                         -- identité native, « AN:intervention:CRC…#12 »
    sujet_id        UUID,
    champ           TEXT,
    cibles          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{type, identite, entite_id}]
    candidats       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{type, identite, entite_id, libelle, indices}]
    contexte        JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_id       UUID REFERENCES brut.enregistrement_source,
    statut          TEXT NOT NULL DEFAULT 'A_REVOIR' CHECK (statut IN ('A_REVOIR', 'DECIDE', 'APPLIQUE')),
    -- {"choix": <indice du candidat> | null (aucun), "motif": "..."}
    decision        JSONB,
    decide_par      TEXT,
    decide_le       TIMESTAMPTZ,
    applique_le     TIMESTAMPTZ,
    premiere_vue    TIMESTAMPTZ NOT NULL DEFAULT now(),
    derniere_vue    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON analytique.cas_revue (type, statut);
