-- Questions de l'AN (au Gouvernement, écrites, orales sans débat), telles que publiées.
-- Auteur, groupe et ministères par leurs identifiants AN (acteurRef, organes PO…) : l'AN ne
-- publie pas la personne du ministre qui répond, seulement le ministère ; le nom du ministre ne
-- figure que dans le texte de la réponse (QAG, QOSD : extrait du compte rendu). Aucun lien vers la
-- séance : l'AN n'en publie pas pour les questions (date et page du JO débats seulement).
--
-- `ministere` (0005) garde le libellé publié du ministère interrogé ; `titre`, l'analyse publiée.

ALTER TABLE canon.question
    ADD COLUMN groupe_auteur_id          UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    ADD COLUMN ministere_interroge_id    UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    -- dernière attribution dans l'ordre de la liste publiée (les dates JO n'y sont pas toujours
    -- croissantes) : le ministère chargé de répondre, pas une personne
    ADD COLUMN ministere_attributaire_id UUID REFERENCES canon.organisation DEFERRABLE INITIALLY DEFERRED,
    ADD COLUMN ministere_attributaire    TEXT,
    ADD COLUMN texte_question            TEXT,             -- tel que publié (HTML pour QAG et QOSD)
    ADD COLUMN texte_reponse             TEXT,             -- tel que publié ; QAG : l'échange en séance
    ADD COLUMN page_jo_reponse           TEXT,
    ADD COLUMN cloture                   TEXT,             -- code publié : REP_PUB, FM, AU, ID, ANSE…
    ADD COLUMN cloture_libelle           TEXT,
    ADD COLUMN date_cloture              DATE,
    -- parcours au JO tel que publié : attributions successives, errata, renouvellements, signalement
    ADD COLUMN publication_jo            JSONB;
CREATE INDEX ON canon.question (ministere_attributaire_id);
CREATE INDEX ON canon.question (date);
