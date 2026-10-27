// Qui a voté quoi, nom par nom : une position à la fois (Pour / Contre / Abstention / Non-votants /
// Absents, avec leur nombre comptés avec les autres filtres), recherche par nom, puis les noms rangés
// par groupe de la gauche vers la droite : en-tête du groupe (couleur, sigle, combien sur ses
// membres, barre de ses votes ; le toucher filtre sur ce groupe), noms en grille avec département,
// délégation et mise au point. Chaque nom ouvre la fiche Personne ; un groupe long se déplie.

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { GroupeRef, Position, PositionDeGroupe, VoteNominatif } from '@/core';
import { nombre } from '../../format';
import { useLarge } from '../../hooks/miseEnPage';
import { compter, filtrer, POSITIONS, SANS_GROUPE, type FiltreVotes } from '../../repartition';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space } from '../../theme/tokens';
import { IconeRecherche, Label, Pastille, Puce, Repartition as Barre, T } from '../base';
import { Puces } from '../fondations';

const ONGLET: Record<Position, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  non_votant: 'Non-votants',
  absent: 'Absents',
};

/** Noms montrés d'un groupe avant « Voir les … autres ». */
const TRANCHE = 24;

interface Bloc {
  cle: string;
  groupe: GroupeRef | null;
  /** Les votes du groupe dans la sélection, toutes positions (pour la barre et la base). */
  membres: VoteNominatif[];
  /** Ceux de la position choisie. */
  liste: VoteNominatif[];
}

function parGroupe(votes: VoteNominatif[], groupes: PositionDeGroupe[], position: Position): Bloc[] {
  const blocs: Bloc[] = groupes.map((g) => ({ cle: g.groupe.id, groupe: g.groupe, membres: [], liste: [] }));
  const index = new Map(blocs.map((b) => [b.cle, b]));
  const sans: Bloc = { cle: SANS_GROUPE, groupe: null, membres: [], liste: [] };
  for (const v of votes) {
    const b = (v.personne.groupe && index.get(v.personne.groupe.id)) || sans;
    b.membres.push(v);
    if (v.position === position) b.liste.push(v);
  }
  return [...blocs, sans].filter((b) => b.liste.length > 0);
}

export function ListeNominative({
  votes,
  groupes,
  filtre,
  changer,
  onPersonne,
}: {
  votes: VoteNominatif[];
  groupes: PositionDeGroupe[];
  filtre: FiltreVotes;
  changer(f: Partial<FiltreVotes>): void;
  onPersonne(id: string): void;
}) {
  const p = usePalette();
  const position = filtre.position ?? 'pour';
  const selection = filtrer(votes, filtre, true);
  const comptes = compter(selection);
  const blocs = parGroupe(selection, groupes, position);
  const total = blocs.reduce((n, b) => n + b.liste.length, 0);

  return (
    <View style={styles.racine}>
      <Puces label="Position">
        {POSITIONS.map((pos) => (
          <Puce key={pos} actif={position === pos} onPress={() => changer({ position: pos })} accessibilityLabel={`${ONGLET[pos]} : ${comptes[pos]}`}>
            {`${ONGLET[pos]} ${nombre(comptes[pos])}`}
          </Puce>
        ))}
      </Puces>
      <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
        <IconeRecherche couleur={p.inkMuted} taille={16} />
        <TextInput
          accessibilityLabel="Rechercher un nom"
          value={filtre.recherche ?? ''}
          onChangeText={(t) => changer({ recherche: t })}
          placeholder="Rechercher un nom"
          placeholderTextColor={p.inkMuted}
          style={[styles.saisie, { color: p.ink }]}
        />
      </View>

      <T variant="small" ton="inkMuted">
        {`${nombre(total)} ${ONGLET[position].toLowerCase()} sur ${nombre(comptes.membres)} parlementaires de la sélection${filtre.groupe ? '' : ', par groupe'}`}
      </T>
      {blocs.length === 0 ? (
        <T ton="inkMuted">Personne dans cette sélection.</T>
      ) : (
        blocs.map((b) => (
          <BlocGroupe
            key={`${b.cle}:${position}`}
            bloc={b}
            position={position}
            choisi={filtre.groupe === b.cle}
            basculer={() => changer({ groupe: filtre.groupe === b.cle ? null : b.cle })}
            onPersonne={onPersonne}
          />
        ))
      )}
    </View>
  );
}

function BlocGroupe({
  bloc: b,
  position,
  choisi,
  basculer,
  onPersonne,
}: {
  bloc: Bloc;
  position: Position;
  choisi: boolean;
  basculer(): void;
  onPersonne(id: string): void;
}) {
  const p = usePalette();
  const large = useLarge();
  const [tous, setTous] = useState(false);
  const c = compter(b.membres);
  const couleur = b.groupe?.couleur ?? p.lineStrong;
  const nom = b.groupe?.libelle ?? 'Sans groupe';
  const montres = tous ? b.liste : b.liste.slice(0, TRANCHE);

  return (
    <View style={[styles.groupe, { borderLeftColor: couleur }]}>
      <Pressable
        onPress={basculer}
        accessibilityRole="button"
        accessibilityState={{ selected: choisi }}
        accessibilityLabel={`${nom} : ${b.liste.length} ${ONGLET[position].toLowerCase()} sur ${c.membres}. ${choisi ? 'Retirer le filtre' : 'Filtrer sur ce groupe'}`}
        style={styles.entete}
      >
        <View style={styles.titreGroupe}>
          <Pastille couleur={couleur} />
          <T variant="heading">{b.groupe?.abrege ?? 'Sans groupe'}</T>
          <T variant="small" ton="inkMuted" numberOfLines={1} style={styles.libelle}>
            {b.groupe?.libelle ?? ''}
          </T>
          <T variant="data" couleur={couleurVote(p, position)}>{`${b.liste.length}`}</T>
          <T variant="data" ton="inkMuted">{`/ ${c.membres}`}</T>
        </View>
        <Barre decompte={{ pour: c.pour, contre: c.contre, abstention: c.abstention }} total={c.membres} hauteur={4} />
      </Pressable>
      <View style={styles.grille}>
        {montres.map((v) => (
          <Nom key={v.personne.id} vote={v} large={large} onPress={() => onPersonne(v.personne.id)} />
        ))}
      </View>
      {b.liste.length > montres.length && (
        <Pressable onPress={() => setTous(true)} accessibilityRole="button" style={styles.plus}>
          <Label ton="signal">{`Voir les ${b.liste.length - montres.length} autres`}</Label>
        </Pressable>
      )}
    </View>
  );
}

function Nom({ vote: v, large, onPress }: { vote: VoteNominatif; large: boolean; onPress(): void }) {
  const p = usePalette();
  const detail = [v.departement?.nom, v.parDelegation ? 'par délégation' : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={[v.personne.nom, ONGLET[v.position], detail, v.miseAuPoint].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.nom, { width: large ? '33.33%' : '50%', backgroundColor: pressed ? p.surfaceSunken : 'transparent' }]}
    >
      <T variant="small" numberOfLines={1}>
        {v.personne.nom}
      </T>
      {detail ? (
        <T variant="caption" ton="inkMuted" numberOfLines={1}>
          {detail}
        </T>
      ) : null}
      {v.miseAuPoint ? (
        <T variant="caption" ton="inkMuted" numberOfLines={2}>
          {`Mise au point : ${v.miseAuPoint}`}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  racine: { gap: space[3] },
  champ: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 44,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.full,
  },
  saisie: { flex: 1, minHeight: 44, fontFamily: fonts.sans, fontSize: 16 },
  groupe: { borderLeftWidth: 3, paddingLeft: space[3], gap: space[2], marginTop: space[2] },
  entete: { gap: space[2], minHeight: 44, justifyContent: 'center' },
  titreGroupe: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  libelle: { flex: 1 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space[1] },
  nom: { paddingHorizontal: space[1], paddingVertical: 6, borderRadius: radius.sm, minHeight: 44, justifyContent: 'center' },
  plus: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
