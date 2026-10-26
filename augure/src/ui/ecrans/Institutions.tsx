// Onglet Institutions (canevas : artboard « Institutions ») : sélecteur Assemblée nationale /
// Sénat / Gouvernement / Conseil constitutionnel, puis l'institution choisie (`InstitutionVue`).

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ConsulterInstitution, type TypeInstitution } from '@/core';
import type { Pages } from '@/navigation';
import { OngletsFiche, T } from '@/ui/components/base';
import { Signaler } from '@/ui/components/commun/Signaler';
import { Chargement, Ecran, Erreur } from '@/ui/components/Ecran';
import { InstitutionVue } from '@/ui/components/personnes/InstitutionVue';
import { INSTITUTIONS } from '@/ui/components/personnes/regles';
import { useCommand } from '@/ui/hooks/core';

export function Institutions() {
  const params = useRoute<RouteProp<Pages, 'Institutions'>>().params;
  const [institution, setInstitution] = useState<TypeInstitution>(params?.institution ?? 'an');
  const resultat = useCommand(ConsulterInstitution({ institution }));

  return (
    <Ecran largeur="pleine">
      <View style={{ gap: 4 }}>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
          Institutions
        </T>
        <T ton="inkMuted">Qui siège où, aujourd’hui. Chaque institution mène à ses membres et à ses dossiers.</T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: '100%' }}>
        <OngletsFiche<TypeInstitution> label="Institution" options={INSTITUTIONS} valeur={institution} onChange={setInstitution} />
      </ScrollView>
      {resultat.statut === 'erreur' ? (
        <Erreur message={resultat.message} onReessayer={resultat.recharger} />
      ) : resultat.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <InstitutionVue institution={resultat.donnees} />
      )}
      <Signaler cible={{ type: 'institution', id: institution }} ecran="Institutions" />
    </Ecran>
  );
}
