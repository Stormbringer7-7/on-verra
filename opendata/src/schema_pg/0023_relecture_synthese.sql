-- Relecture humaine des synthèses rédigées par un modèle (banc de relecture, `python -m src revue
-- servir`) : une personne dit si la synthèse correspond au texte officiel. Un jugement vaut pour
-- une synthèse précise (son empreinte) : une synthèse réécrite est à juger de nouveau.

CREATE TABLE analytique.relecture_synthese (
    synthese_id TEXT NOT NULL,                    -- identifiant de la synthèse dans son lot
    empreinte   TEXT NOT NULL,                    -- empreinte du texte jugé
    lot         TEXT NOT NULL,
    verdict     TEXT NOT NULL CHECK (verdict IN ('fidele', 'infidele')),
    commentaire TEXT NOT NULL DEFAULT '',
    juge_par    TEXT NOT NULL,
    juge_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (synthese_id, empreinte)
);
