-- Agenda de la séance publique du Sénat (DOSLEG `date_seance`) : un jour de discussion d'un
-- dossier, passé ou prévu par l'ordre du jour. Le vocabulaire suit `canon.etape` (chambre,
-- lecture) ; `organisation_id` est l'assemblée qui publie l'agenda : la relecture marque retirées
-- les dates qu'elle ne donne plus (ordre du jour modifié), jamais supprimées.

ALTER TABLE canon.evenement_agenda
    ADD COLUMN organisation_id UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    ADD COLUMN chambre         TEXT,           -- AN, SENAT
    ADD COLUMN lecture         TEXT,           -- 1, 2, nouvelle, definitive, cmp… (cf. canon.etape)
    ADD COLUMN code_source     TEXT;           -- libellé natif de la lecture (« Première lecture »)
CREATE INDEX ON canon.evenement_agenda (dossier_id, date);
