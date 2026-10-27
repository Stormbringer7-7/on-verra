// Page d'une institution, empilée depuis une fiche (dossier, personne, étape) : la même vue que
// l'onglet Institutions, sans le sélecteur.

import { useRoute, type RouteProp } from '@react-navigation/native';

import { ConsulterInstitution } from '@/core';
import type { Pages } from '@/navigation';
import { T } from '@/ui/components/base';
import { Signaler } from '@/ui/components/commun/Signaler';
import { RACINES } from '../ariane';
import { Chargement, Ecran, Erreur } from '@/ui/components/Ecran';
import { InstitutionVue } from '@/ui/components/personnes/InstitutionVue';
import { INSTITUTIONS } from '@/ui/components/personnes/regles';
import { useCommand } from '@/ui/hooks/core';

export function Institution() {
  const { institution } = useRoute<RouteProp<Pages, 'Institution'>>().params;
  const resultat = useCommand(ConsulterInstitution({ institution }));
  const titre = INSTITUTIONS.find((i) => i.cle === institution)?.libelle ?? 'Institution';

  return (
    <Ecran largeur="pleine" titre={resultat.statut === 'pret' ? resultat.donnees.libelle : titre} parents={[RACINES.elus, RACINES.institutions]}>
      <T variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
        {resultat.statut === 'pret' ? resultat.donnees.libelle : titre}
      </T>
      {resultat.statut === 'erreur' ? (
        <Erreur message={resultat.message} onReessayer={resultat.recharger} />
      ) : resultat.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <InstitutionVue institution={resultat.donnees} />
      )}
      <Signaler cible={{ type: 'institution', id: institution }} ecran="Institution" />
    </Ecran>
  );
}
