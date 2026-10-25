-- Index des lectures de l'Explorer (API, faits filtrés) : l'étape d'un amendement ou d'un scrutin
-- (filtre étape, case du parcours) et le scrutin d'un amendement (votes sous un filtre article ou
-- amendement, vote à main levée = amendement sans scrutin).
CREATE INDEX IF NOT EXISTS amendement_etape_id_idx ON canon.amendement (etape_id);
CREATE INDEX IF NOT EXISTS scrutin_amendement_id_idx ON canon.scrutin (amendement_id);
CREATE INDEX IF NOT EXISTS scrutin_etape_id_idx ON canon.scrutin (etape_id);
