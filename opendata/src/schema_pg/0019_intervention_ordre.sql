-- Ordre des interventions dans leur réunion : un index, plus une contrainte d'unicité.
-- Un compte rendu republié (AN : provisoire puis définitif) insère des interventions et décale
-- l'ordre des suivantes ; l'unicité (réunion, ordre), vérifiée ligne à ligne, cassait la relecture
-- (CRSANR5L17S2027O1N039 : 45 interventions insérées, 440 décalées). Les interventions qui ne sont
-- plus publiées sont marquées retirées de la source (elles gardent leur ancien ordre) : l'unicité
-- ne vaut que pour les vivantes, ce que vérifie le contrôle `intervention_ordre_en_double`.
ALTER TABLE canon.intervention DROP CONSTRAINT IF EXISTS intervention_reunion_id_ordre_key;
CREATE INDEX IF NOT EXISTS intervention_reunion_ordre_idx ON canon.intervention (reunion_id, ordre);
