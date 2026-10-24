-- Relire un document peut faire disparaître des objets qu'il donnait avant (règle de lecture
-- corrigée, document modifié à la source) : l'entité est marquée retirée
-- (`canon.entite.retiree_de_la_source_le`), jamais supprimée, et la couche de lecture l'ignore.
-- Un cas de revue qui n'a plus d'objet devient CADUC ; il repasse A_REVOIR s'il réapparaît.

ALTER TABLE analytique.cas_revue DROP CONSTRAINT cas_revue_statut_check;
ALTER TABLE analytique.cas_revue
    ADD CONSTRAINT cas_revue_statut_check CHECK (statut IN ('A_REVOIR', 'DECIDE', 'APPLIQUE', 'CADUC'));

-- Mention publiée avec le numéro d'un article : « Supprimé », « Conforme », « Non modifié »,
-- « nouveau »… Le statut en est déduit (present, supprime, conforme, non_modifie).
ALTER TABLE canon.version_article ADD COLUMN mention TEXT;
CREATE INDEX ON canon.entite (type) WHERE retiree_de_la_source_le IS NOT NULL;
