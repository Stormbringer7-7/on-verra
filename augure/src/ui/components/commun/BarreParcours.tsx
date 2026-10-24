// Barre de parcours d'un dossier (projection `lecture.parcours_dossier`) : une case par étape du
// gabarit, de gauche à droite. Faite : pleine (encre) ; en cours / courante : signal ; à venir :
// filet ; inconnu : contour (la donnée ne permet pas de conclure) ; sans objet : masquée.
// La case de l'écran affiché (`active`, `ici`) est cernée.
//
//   BarreParcours    barre complète d'un `Parcours` (fiche Dossier), cases cliquables, échéance
//   BarreCompacte    les points seuls (listes : Accueil, Dossiers)
//   BarreDossierVue  rappel du dossier en tête de ses sous-écrans (« VOIR LE PARCOURS → »)

import { Pressable, StyleSheet, View } from 'react-native';

import type { BarreDossier, CaseCompacte, CleCase, EtatDossier, Parcours } from '@/core';
import { date } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space, type Palette } from '../../theme/tokens';
import { Label, T } from '../base';
import { casesVisibles, legendeBarre, LIBELLES_ETATS, renduCase } from './statuts';

function styleCase(p: Palette, c: CaseCompacte, cernee: boolean) {
  const rendu = renduCase(c);
  return [
    styles.case,
    rendu === 'plein' && { backgroundColor: p.ink },
    rendu === 'signal' && { backgroundColor: p.signal },
    rendu === 'vide' && { backgroundColor: p.line },
    rendu === 'inconnu' && { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: p.lineStrong },
    cernee && { outlineWidth: 1, outlineOffset: 2, outlineColor: p.ink, outlineStyle: 'solid' as const },
  ];
}

const descriptionCase = (c: CaseCompacte) => `${c.libelle} : ${LIBELLES_ETATS[c.etat]}${c.courante ? ', étape actuelle' : ''}`;

/** Les points de la barre (listes). Décrite en entier pour les lecteurs d'écran. */
export function BarreCompacte({ cases, ici = null, onCase }: { cases: CaseCompacte[]; ici?: CleCase | null; onCase?: (cle: CleCase) => void }) {
  const p = usePalette();
  const visibles = casesVisibles(cases);
  if (!visibles.length) return null;
  if (!onCase) {
    return (
      <View accessibilityRole="image" accessibilityLabel={`Parcours : ${visibles.map(descriptionCase).join(' ; ')}`} style={styles.rangee}>
        {visibles.map((c) => (
          <View key={c.cle} style={styleCase(p, c, c.cle === ici)} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.rangee}>
      {visibles.map((c) => (
        <Pressable
          key={c.cle}
          accessibilityRole="button"
          accessibilityLabel={descriptionCase(c)}
          accessibilityState={{ selected: c.cle === ici }}
          onPress={() => onCase(c.cle)}
          style={styles.zone}
        >
          <View style={[styleCase(p, c, c.cle === ici), styles.caseDansZone]} />
        </Pressable>
      ))}
    </View>
  );
}

/** `etat` : état publié du dossier, pour dire l'état final d'un parcours sans étape courante. */
export function BarreParcours(props: { parcours: Parcours; active?: CleCase; etat?: EtatDossier | null; onCase?: (cle: CleCase) => void }) {
  const { parcours, active, etat = null, onCase } = props;
  const legende = legendeBarre(parcours.cases, active, etat);
  const echeance = parcours.prochaineEcheance;
  return (
    <View style={styles.bloc}>
      <BarreCompacte cases={parcours.cases} ici={active ?? null} onCase={onCase} />
      {legende && (
        <T variant="caption" ton="inkMuted">
          {legende}
        </T>
      )}
      {echeance && (
        <T variant="small">
          Prochaine échéance : {echeance.libelle} le {date(echeance.date)}
          {echeance.etat ? ` (${echeance.etat})` : ''}
        </T>
      )}
    </View>
  );
}

/** Rappel du dossier sur ses sous-écrans : titre, barre, étape actuelle et celle de l'écran. */
export function BarreDossierVue({ barre, onOuvrir }: { barre: BarreDossier; onOuvrir: () => void }) {
  const p = usePalette();
  const legende = legendeBarre(barre.cases, barre.ici);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Dossier ${barre.dossier.titre}, voir le parcours`}
      onPress={onOuvrir}
      style={[styles.rappel, { borderColor: p.line, backgroundColor: p.surface }]}
    >
      <View style={styles.rappelEntete}>
        <Label>Dossier</Label>
        <Label ton="signal">Voir le parcours →</Label>
      </View>
      <T variant="heading">{barre.dossier.titre}</T>
      <BarreCompacte cases={barre.cases} ici={barre.ici} />
      {legende && (
        <T variant="caption" ton="inkMuted">
          {legende}
        </T>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[2] },
  rangee: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  zone: { flex: 1, minHeight: 28, justifyContent: 'center' },
  case: { flex: 1, height: 6, borderRadius: 1 },
  // Dans sa zone tactile (colonne) : toute la largeur, 6 px de haut.
  caseDansZone: { flex: 0, alignSelf: 'stretch' },
  rappel: { gap: space[2], paddingHorizontal: 14, paddingVertical: space[3], borderWidth: 1, borderRadius: radius.md },
  rappelEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
});
