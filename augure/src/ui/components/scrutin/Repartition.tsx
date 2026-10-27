// Répartition des voix : tableau par groupe ou par département (sur la sélection de la liste : un
// groupe choisi donne ses votes département par département), avec pour chaque ligne la barre pour /
// contre / abstention, la participation et la cohésion, chacune avec sa base. Puis les écarts à la
// ligne, regroupés par groupe. Toucher une ligne filtre la liste ; toucher un nom ouvre « Pourquoi ce
// vote ».

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PositionDeGroupe, VoteNominatif } from '@/core';
import { nombre } from '../../format';
import {
  ecartsParGroupe,
  estExprime,
  exprimes,
  HORS_DEPARTEMENT,
  parDepartement,
  parGroupe,
  partExprimee,
  textePart,
  type LigneRepartition,
} from '../../repartition';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { BoutonSecondaire, Label, Ligne, Pastille, Repartition as Barre, Segmente, T } from '../base';
import { POSITION } from '../dossiers/presentation';

type Vue = 'groupes' | 'departements';

export function TableauRepartition({
  votes,
  groupes,
  choisirGroupe,
  choisirDepartement,
}: {
  /** Les votes de la sélection (filtres de groupe, département, recherche ; toutes positions). */
  votes: VoteNominatif[];
  groupes: PositionDeGroupe[];
  choisirGroupe(id: string): void;
  choisirDepartement(code: string): void;
}) {
  const [vue, setVue] = useState<Vue>('groupes');
  const [toutes, setToutes] = useState(false);
  const lignes = vue === 'groupes' ? parGroupe(votes, groupes) : parDepartement(votes, groupes);
  const montrees = vue === 'departements' && !toutes ? lignes.slice(0, 15) : lignes;
  return (
    <View style={styles.racine}>
      <Segmente
        label="Répartir par"
        options={[
          { cle: 'groupes', libelle: 'Par groupe' },
          { cle: 'departements', libelle: 'Par département' },
        ]}
        valeur={vue}
        onChange={(v) => {
          setVue(v);
          setToutes(false);
        }}
      />
      <T variant="caption" ton="inkMuted">
        Participation : votes publiés (non-votants compris) parmi les membres en mandat ce jour-là. Cohésion : votes exprimés qui suivent la
        ligne de leur groupe sur l’ensemble du scrutin, parmi ceux des groupes qui ont une ligne.
      </T>
      {montrees.map((l) => (
        <LigneTableau
          key={l.cle}
          ligne={l}
          onPress={
            vue === 'groupes'
              ? l.groupe
                ? () => choisirGroupe(l.groupe!.id)
                : undefined
              : () => choisirDepartement(l.departement?.code ?? HORS_DEPARTEMENT)
          }
        />
      ))}
      {montrees.length < lignes.length && (
        <BoutonSecondaire onPress={() => setToutes(true)}>{`Voir les ${nombre(lignes.length)} départements`}</BoutonSecondaire>
      )}
    </View>
  );
}

function LigneTableau({ ligne: l, onPress }: { ligne: LigneRepartition; onPress?: () => void }) {
  const p = usePalette();
  const c = l.comptes;
  const nom = l.groupe?.libelle ?? (l.departement ? `${l.departement.nom} (${l.departement.code})` : l.cle === HORS_DEPARTEMENT ? 'Hors département (Français de l’étranger)' : 'Sans groupe');
  const pour = partExprimee(c, 'pour');
  return (
    <Ligne onPress={onPress} accessibilityLabel={`${nom} : ${c.pour} pour, ${c.contre} contre, ${c.abstention} abstentions`}>
      <View style={[styles.entete, l.groupe && { borderLeftWidth: 3, borderLeftColor: l.groupe.couleur, paddingLeft: space[2] }]}>
        <T variant="heading">{l.groupe?.abrege ?? nom}</T>
        {l.groupe && (
          <T variant="small" ton="inkMuted" numberOfLines={1} style={styles.nom}>
            {l.groupe.libelle}
          </T>
        )}
        {!l.groupe && <View style={styles.nom} />}
        {l.ligne && <Label couleur={couleurVote(p, l.ligne)}>{`Ligne : ${POSITION[l.ligne]}`}</Label>}
      </View>
      <Barre decompte={{ pour: c.pour, contre: c.contre, abstention: c.abstention }} total={c.membres} hauteur={8} />
      <View style={styles.mesures}>
        <T variant="data" couleur={p.votePour}>{`+ ${c.pour}`}</T>
        <T variant="data" couleur={p.voteContre}>{`− ${c.contre}`}</T>
        <T variant="data" couleur={p.voteAbstention}>{`Ø ${c.abstention}`}</T>
        <T variant="data" ton="inkMuted">{`${c.non_votant} NV · ${c.absent} abs. · ${c.membres} membres`}</T>
      </View>
      <View style={styles.mesures}>
        <T variant="caption" ton="inkSoft">{`Pour : ${textePart(pour)} des exprimés`}</T>
        <T variant="caption" ton="inkSoft">{`Participation : ${textePart(l.participation)}`}</T>
        <T variant="caption" ton="inkSoft">{`Cohésion : ${textePart(l.cohesion.suivent)}${exprimes(c) && !l.cohesion.suivent.base ? ' (pas de ligne de groupe)' : ''}`}</T>
      </View>
    </Ligne>
  );
}

/** Écarts à la ligne du groupe, groupe par groupe ; chaque nom mène à « Pourquoi ce vote ». */
export function EcartsParGroupe({
  votes,
  groupes,
  onPersonne,
}: {
  votes: VoteNominatif[];
  groupes: PositionDeGroupe[];
  onPersonne(id: string): void;
}) {
  const p = usePalette();
  const par = ecartsParGroupe(votes, groupes);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  if (!par.length) return <T ton="inkMuted">Aucun vote exprimé différent de la ligne de son groupe dans cette sélection.</T>;
  return (
    <View style={styles.racine}>
      {par.map(({ groupe: g, ecarts }) => {
        const ouvert = ouverts.has(g.groupe.id);
        const exprimesGroupe = votes.filter((v) => v.personne.groupe?.id === g.groupe.id && estExprime(v.position)).length;
        return (
          <View key={g.groupe.id} style={styles.groupe}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: ouvert }}
              onPress={() =>
                setOuverts((o) => {
                  const n = new Set(o);
                  if (n.has(g.groupe.id)) n.delete(g.groupe.id);
                  else n.add(g.groupe.id);
                  return n;
                })
              }
              style={styles.entetePressable}
            >
              <Pastille couleur={g.groupe.couleur} />
              <T style={styles.nom}>{g.groupe.libelle}</T>
              <Label>{`${ecarts.length} sur ${exprimesGroupe} exprimés ${ouvert ? '▴' : '▾'}`}</Label>
            </Pressable>
            {g.ligne && (
              <T variant="caption" ton="inkMuted">
                {`Ligne du groupe : ${POSITION[g.ligne]}`}
              </T>
            )}
            {ouvert &&
              ecarts.map((v) => (
                <Ligne key={v.personne.id} onPress={() => onPersonne(v.personne.id)} accessibilityLabel={`Pourquoi ${v.personne.nom} a voté ainsi`}>
                  <View style={styles.entete}>
                    <T style={styles.nom}>
                      {v.personne.nom}
                      <T ton="inkMuted">{v.departement ? ` · ${v.departement.nom}` : ''}</T>
                    </T>
                    <Label couleur={couleurVote(p, v.position)}>{POSITION[v.position]}</Label>
                  </View>
                </Ligne>
              ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { gap: space[3] },
  entete: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  entetePressable: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  nom: { flex: 1 },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: 2 },
  groupe: { gap: space[1] },
});
