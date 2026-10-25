// Onglet Personnes (canevas : artboard « Personnes ») : l'annuaire (députés, sénateurs,
// Gouvernement, élus locaux) et les classements par chambre, chaque mesure avec son dénominateur
// et sa référence de comparaison.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Pages } from '@/navigation';
import { Segmente, T } from '@/ui/components/base';
import { Signaler } from '@/ui/components/commun/Signaler';
import { Ecran } from '@/ui/components/Ecran';
import { Annuaire } from '@/ui/components/personnes/Annuaire';
import { Classements } from '@/ui/components/personnes/Classements';

type Vue = 'annuaire' | 'classements';

export function Personnes() {
  const params = useRoute<RouteProp<Pages, 'Personnes'>>().params;
  const [vue, setVue] = useState<Vue>(params?.vue ?? 'annuaire');

  return (
    <Ecran largeur="pleine">
      <View style={{ gap: 4 }}>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
          Personnes
        </T>
        <T ton="inkMuted">Députés, sénateurs, membres du Gouvernement et élus locaux : leurs fonctions, leurs choix, leurs déclarations.</T>
      </View>
      <Segmente<Vue>
        label="Vue"
        valeur={vue}
        onChange={setVue}
        options={[
          { cle: 'annuaire', libelle: 'Annuaire' },
          { cle: 'classements', libelle: 'Classements' },
        ]}
      />
      {vue === 'annuaire' ? <Annuaire role={params?.role} /> : <Classements />}
      <Signaler cible={{ type: 'personne', id: null }} ecran={vue === 'annuaire' ? 'Personnes · annuaire' : 'Personnes · classements'} />
    </Ecran>
  );
}
