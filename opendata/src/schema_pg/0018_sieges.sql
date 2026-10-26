-- Sièges publiés dans l'hémicycle.
--   AN : `numPlace` de chaque votant d'un scrutin public (le siège occupé ce jour-là). Les documents
--        de scrutin déjà chargés ne sont pas relus d'office : relire l'étape `an.scrutins` une fois.
--   Sénat : `sen.sennumsie` (« N° de siège Hémicycle ») de l'export « Les Sénateurs », porté par un
--        lien `siege` sénateur → Sénat (attributs.numero) : pas de colonne nouvelle.
ALTER TABLE canon.vote ADD COLUMN IF NOT EXISTS siege INTEGER;
