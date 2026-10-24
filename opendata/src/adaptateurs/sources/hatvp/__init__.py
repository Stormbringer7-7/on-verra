"""HATVP : déclarations publiées des parlementaires et membres du Gouvernement, répertoire des
représentants d'intérêts. Seul ce que la HATVP publie, tel quel ; ni adresse, ni téléphone, ni
e-mail, ni date de naissance, ni rien de marqué « [Données non publiées] ».
"""

from . import declarations, representants

ETAPES = [declarations.ETAPE, representants.ETAPE]
