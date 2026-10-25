-- Adresses des comptes rendus cités par l'AN, corrigées (même règle que `url_compte_rendu` de
-- src/adaptateurs/sources/an/commun.py) sur les documents déjà chargés : un document brut inchangé
-- n'est pas réécrit par le chargement incrémental.
--   séance AN (CRSAN…) : le .html de dyn/opendata répond 404 ; page lisible dyn/<leg>/comptes-rendus/seance/<uid>
--   séance Sénat (CRSSN…, citée par l'agenda AN) : l'AN ne l'héberge pas ; aucune adresse supposée
UPDATE canon.document
   SET url = 'https://www.assemblee-nationale.fr/dyn/' || substring(numero FROM 'L(\d+)')
             || '/comptes-rendus/seance/' || numero
 WHERE numero LIKE 'CRSAN%' AND url = 'https://www.assemblee-nationale.fr/dyn/opendata/' || numero || '.html';

UPDATE canon.document
   SET url = NULL
 WHERE numero LIKE 'CRSSN%' AND url = 'https://www.assemblee-nationale.fr/dyn/opendata/' || numero || '.html';
