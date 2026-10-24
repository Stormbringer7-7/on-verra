-- Fusion d'entités : deux entités se révèlent être le même objet (dossier créé côté Sénat puis cité
-- par l'AN, membre du Gouvernement créé côté Sénat puis relié à un acteur AN, personne RNE établie
-- par revue qui est un parlementaire). Seulement sur décision de revue appliquée, ou sur référence
-- explicite sourcée (une source cite l'identifiant officiel de l'autre entité : l'AMO cite le
-- matricule Sénat d'un acteur, l'AN cite le signet d'un dossier créé côté Sénat).
-- L'absorbée est gardée et marquée (`fusionnee_dans`, `retiree_de_la_source_le`), jamais supprimée ;
-- ses références passent à l'absorbante ; la fusion est enregistrée ici. Cf. docs/rapprochements.md.

ALTER TABLE canon.entite ADD COLUMN fusionnee_dans UUID REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON canon.entite (fusionnee_dans) WHERE fusionnee_dans IS NOT NULL;

CREATE TABLE canon.fusion (
    absorbee_id   UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    absorbante_id UUID NOT NULL REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,  -- au moment de la fusion
    type          TEXT NOT NULL,
    preuve        JSONB NOT NULL,                  -- {cas, decide_par, motif} ou {reference, cite_par, source_id}
    references_   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"table.colonne": lignes re-pointées}
    doublons      INTEGER NOT NULL DEFAULT 0,      -- faits dépendants déjà présents chez l'absorbante (historisés)
    completees    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- colonnes vides de l'absorbante complétées
    conflits      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {colonne: {gardee, ecartee}} : consignés, pas tranchés
    fusionnee_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (preuve ? 'cas' OR (preuve ? 'reference' AND preuve ? 'source_id'))
);
CREATE INDEX ON canon.fusion (absorbante_id);
