-- Représentant d'intérêts : une entité propre (identifiant du répertoire HATVP), et non une ligne
-- d'organisation (deux tables pour une même entité violeraient la règle « type = table »).

ALTER TABLE canon.exercice_representation DROP CONSTRAINT exercice_representation_representant_id_fkey;
ALTER TABLE canon.action_representation DROP CONSTRAINT action_representation_representant_id_fkey;
ALTER TABLE canon.representant_interets DROP CONSTRAINT representant_interets_entite_id_fkey;
ALTER TABLE canon.representant_interets
    ADD FOREIGN KEY (entite_id) REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    ADD COLUMN denomination TEXT NOT NULL DEFAULT '',
    ADD COLUMN nom_usage TEXT;
ALTER TABLE canon.representant_interets ALTER COLUMN denomination DROP DEFAULT;
ALTER TABLE canon.exercice_representation
    ADD FOREIGN KEY (representant_id) REFERENCES canon.representant_interets DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE canon.action_representation
    ADD FOREIGN KEY (representant_id) REFERENCES canon.representant_interets DEFERRABLE INITIALLY DEFERRED;
