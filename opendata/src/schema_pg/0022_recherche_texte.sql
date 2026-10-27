-- Recherche d'expressions dans le texte publié (Explorer : filtre « textes ») : vecteurs plein
-- texte français et index GIN, sur le modèle de `canon.intervention.texte_recherche` (0005). Le
-- filtre retient des faits dont le texte contient l'expression ; il ne crée aucun lien.

ALTER TABLE canon.amendement
    ADD COLUMN texte_recherche TSVECTOR GENERATED ALWAYS AS
        (to_tsvector('french', coalesce(dispositif, '') || ' ' || coalesce(expose, ''))) STORED;
CREATE INDEX ON canon.amendement USING gin (texte_recherche);

ALTER TABLE canon.question
    ADD COLUMN texte_recherche TSVECTOR GENERATED ALWAYS AS
        (to_tsvector('french', coalesce(titre, '') || ' ' || coalesce(texte_question, '') || ' ' || coalesce(texte_reponse, '')))
        STORED;
CREATE INDEX ON canon.question USING gin (texte_recherche);
