-- Répertoire national des élus (RNE) : une fiche par mandat, telle que publiée.
-- Le RNE ne donne aucun identifiant de personne : la fiche est identifiée par une clé locale
-- (type de mandat, siège ou territoire, date de début, et le nom quand le siège ne suffit pas).
-- `personne_id` n'est posé que par une décision de revue humaine (cas `elu_local`) : relier deux
-- mandats à une même personne, ou un mandat local à un parlementaire, n'est jamais automatique.

CREATE TABLE canon.mandat_rne (
    entite_id           UUID PRIMARY KEY REFERENCES canon.entite DEFERRABLE INITIALLY DEFERRED,
    -- maire, conseiller_communautaire, depute, senateur, representant_parlement_europeen
    type_mandat         TEXT NOT NULL,
    nom                 TEXT NOT NULL,             -- tel que publié (« EVALET TAPONAT »)
    prenom              TEXT,
    nom_affiche         TEXT NOT NULL,
    sexe                TEXT,                      -- code publié : M, F
    categorie_socio_pro TEXT,                      -- libellé publié
    fonction            TEXT,                      -- libellé publié (« 2eme Vice-président… »)
    organisation_id     UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,  -- commune, EPCI
    commune_id          UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,  -- rattachement (EPCI)
    departement_id      UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    territoire          TEXT,                      -- libellé publié (commune, EPCI, circonscription)
    circonscription     TEXT,                      -- code publié (« 0101 »)
    debut_mandat        DATE,
    debut_fonction      DATE,
    personne_id         UUID REFERENCES canon.personne DEFERRABLE INITIALLY DEFERRED  -- revue seulement
);
CREATE INDEX ON canon.mandat_rne (lower(nom));
CREATE INDEX ON canon.mandat_rne (organisation_id);
CREATE INDEX ON canon.mandat_rne (personne_id);
