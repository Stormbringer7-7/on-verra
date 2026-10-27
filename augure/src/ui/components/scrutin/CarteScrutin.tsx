// Carte d'un scrutin, sur l'écran du scrutin.
//   - Départements : chaque département coloré selon la mesure choisie (part des « pour »,
//     participation, écarts au groupe), calculée depuis les votes nominatifs de la sélection ;
//     toucher un département filtre la liste.
//   - Circonscriptions (Assemblée seulement : les sénateurs sont élus par département) : chaque
//     circonscription colorée par la position de son député (ConsulterCarte, niveau circonscription).

import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Chambre, PositionDeGroupe, VoteNominatif } from '@/core';
import { MESURES_CARTE, valeursCarte, type MesureCarte } from '../../repartition';
import { formaterPourcentage } from '../../territoires';
import { space } from '../../theme/tokens';
import { Segmente, T } from '../base';
import { CarteDepartements } from '../carte/CarteDepartements';
import { Avertissement } from '../fondations';

export type NiveauCarte = 'departement' | 'circonscription';

const NIVEAUX: { cle: NiveauCarte; libelle: string }[] = [
  { cle: 'departement', libelle: 'Départements' },
  { cle: 'circonscription', libelle: 'Circonscriptions' },
];

export function CarteScrutin({
  chambre,
  parCirconscription,
  votes,
  groupes,
  mesure,
  choisirMesure,
  onDepartement,
}: {
  chambre: Chambre;
  /** La carte par circonscription (écran : CarteCirconscriptionsScrutin), montrée au choix pour l'AN. */
  parCirconscription: ReactNode;
  votes: VoteNominatif[];
  groupes: PositionDeGroupe[];
  mesure: MesureCarte;
  choisirMesure(m: MesureCarte): void;
  onDepartement(code: string): void;
}) {
  const [choisi, setNiveau] = useState<NiveauCarte>('departement');
  const niveau = chambre === 'AN' ? choisi : 'departement';
  const definition = MESURES_CARTE.find((m) => m.cle === mesure)!;
  const valeurs = valeursCarte(votes, groupes, mesure);
  const localises = votes.filter((v) => v.departement).length;
  return (
    <View style={styles.racine}>
      {chambre === 'AN' && <Segmente label="Maille de la carte" options={NIVEAUX} valeur={niveau} onChange={(c) => setNiveau(c as NiveauCarte)} />}
      {niveau === 'circonscription' ? (
        parCirconscription
      ) : (
        <>
          <Segmente label="Ce que montre la carte" options={MESURES_CARTE.map((m) => ({ cle: m.cle, libelle: m.libelle }))} valeur={mesure} onChange={choisirMesure} />
          <ParDepartement votes={votes} localises={localises} valeurs={valeurs} titre={definition.titre} onDepartement={onDepartement} />
        </>
      )}
    </View>
  );
}

function ParDepartement({
  votes,
  localises,
  valeurs,
  titre,
  onDepartement,
}: {
  votes: VoteNominatif[];
  localises: number;
  valeurs: ReturnType<typeof valeursCarte>;
  titre: string;
  onDepartement(code: string): void;
}) {
  return (
    <>
      {localises === 0 ? (
        <Avertissement type="info" titre="Rien à dessiner">
          Le département des parlementaires n’est pas encore connu pour ce scrutin.
        </Avertissement>
      ) : (
        <CarteDepartements valeurs={valeurs} titre={titre} formater={formaterPourcentage} onDepartement={onDepartement} />
      )}
      <T variant="caption" ton="inkMuted">
        {`${titre}. Touchez un département pour filtrer la liste. ${votes.length - localises > 0 ? `${votes.length - localises} parlementaires sans département (Français établis hors de France) ne sont pas sur la carte.` : ''}`}
      </T>
    </>
  );
}

const styles = StyleSheet.create({
  racine: { gap: space[3] },
});
