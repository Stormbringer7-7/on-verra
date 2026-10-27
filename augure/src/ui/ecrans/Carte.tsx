// Onglet Carte (canevas v4, « Carte ») : la vraie carte des départements, zoomable, colorée par la
// présence des élus d'une chambre (participation comparée à leurs groupes, query `ConsulterCarte
// { mesure: 'presence' }`) ou par les votes d'un scrutin (`{ mesure: 'scrutin' }`, part des « pour »
// parmi les votes exprimés). Toucher un département ouvre sa fiche. Les scrutins proposés sont ceux
// de la semaine (Accueil) ; un lien profond `/carte?scrutin=…` en ouvre un autre. Pour un scrutin de
// l'Assemblée, la carte peut aussi montrer chaque circonscription et la position de son député.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsulterAccueil, ConsulterCarte, type Chambre, type NiveauCarte } from '@/core';
import { useAller, type Onglets } from '../../navigation';
import { Puce, Segmente, T, TitreEcran } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Requete } from '../components/dossiers/blocs';
import { Ecran } from '../components/Ecran';
import { Avertissement, Puces } from '../components/fondations';
import { LectureCarte } from '../components/territoires/LectureCarte';
import { useCommand } from '../hooks/core';
import { space } from '../theme/tokens';

type Mesure = 'presence_AN' | 'presence_SENAT' | 'scrutin';

const NIVEAUX: { cle: NiveauCarte; libelle: string }[] = [
  { cle: 'departement', libelle: 'Départements' },
  { cle: 'circonscription', libelle: 'Circonscriptions' },
];

const MESURES: { cle: Mesure; libelle: string }[] = [
  { cle: 'presence_AN', libelle: 'Présence des députés' },
  { cle: 'presence_SENAT', libelle: 'Présence des sénateurs' },
  { cle: 'scrutin', libelle: 'Un vote' },
];

export function Carte() {
  const params = useRoute<RouteProp<Onglets, 'Carte'>>().params;
  const aller = useAller();
  const [mesure, setMesure] = useState<Mesure>(params?.scrutin ? 'scrutin' : params?.chambre === 'SENAT' ? 'presence_SENAT' : 'presence_AN');
  const [scrutinChoisi, setScrutinChoisi] = useState<string | undefined>(params?.scrutin);
  const accueil = useCommand(mesure === 'scrutin' ? ConsulterAccueil({}) : null);
  const votes = (accueil.statut !== 'erreur' && accueil.donnees?.votes) || [];
  const scrutin = scrutinChoisi ?? votes[0]?.id;
  const chambre: Chambre = mesure === 'presence_SENAT' ? 'SENAT' : 'AN';
  const [niveau, setNiveau] = useState<NiveauCarte>(params?.niveau ?? 'departement');
  // Député par député : Assemblée seulement (les sénateurs sont élus par département). Un scrutin
  // ouvert par lien profond n'est pas dans la liste de la semaine : on laisse l'API décider.
  const chambreDuScrutin = votes.find((s) => s.id === scrutin)?.chambre ?? null;
  const parCirconscription = niveau === 'circonscription' && chambreDuScrutin !== 'SENAT';
  const carte = useCommand(
    mesure === 'scrutin'
      ? scrutin
        ? ConsulterCarte(parCirconscription ? { mesure: 'scrutin', scrutin, niveau: 'circonscription' } : { mesure: 'scrutin', scrutin })
        : null
      : ConsulterCarte({ mesure: 'presence', chambre }),
  );

  return (
    <Ecran>
      <View style={styles.entete}>
        <TitreEcran>Carte</TitreEcran>
        <T ton="inkSoft">Votes et présence des élus, département par département. Zoomez, puis touchez un département pour voir ses élus.</T>
      </View>
      <Segmente<Mesure> label="Ce que montre la carte" options={MESURES} valeur={mesure} onChange={setMesure} />
      {mesure === 'scrutin' && votes.length > 0 && (
        <Puces label="Votes de la semaine">
          {votes.map((s) => (
            <Puce key={s.id} actif={s.id === scrutin} onPress={() => setScrutinChoisi(s.id)}>
              {`${s.chambre === 'AN' ? 'AN' : 'Sénat'} n° ${s.numero}`}
            </Puce>
          ))}
        </Puces>
      )}
      {mesure === 'scrutin' && scrutin && chambreDuScrutin !== 'SENAT' && (
        <Segmente<NiveauCarte> label="Maille de la carte" options={NIVEAUX} valeur={niveau} onChange={setNiveau} />
      )}
      {mesure === 'scrutin' && !scrutin && accueil.statut !== 'chargement' && (
        <Avertissement type="info" titre="Aucun vote cette semaine">
          Ouvrez un scrutin depuis sa fiche pour le voir sur la carte.
        </Avertissement>
      )}
      {(mesure !== 'scrutin' || scrutin) && (
        <Requete resultat={carte}>
          {(c) => (
            <LectureCarte carte={c} onDepartement={(code) => aller.departement(code, c.scrutin?.id)} onPersonne={(id) => aller.personne(id)} />
          )}
        </Requete>
      )}
      <Signaler cible={{ type: 'autre', id: null }} ecran="Carte" />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
});
