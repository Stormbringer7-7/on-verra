// Barre compacte du parcours d'un dossier (projection `lecture.parcours_dossier`) : une case par
// étape du modèle, de gauche à droite, sa longueur suit le modèle (1 étape pour un rapport, 16
// pour une loi). Faite : pleine (encre) ; en cours / courante : signal ; attendue : cerclée ; à
// venir : filet ; inconnu : contour (donnée non publiée) ; sans objet : masquée. Une déviation dans
// le parcours ajoute son icône (dessinée) au bout de la barre. La case de l'écran (`ici`) est cernée.
// Le rail complet de la fiche Dossier est dans `RailParcours` ; le rappel du dossier en tête de ses
// sous-écrans (étape, article, amendement, scrutin) dans `RappelDossier`, qui utilise cette barre.

import { Pressable, StyleSheet, View } from 'react-native';

import type { CaseCompacte, CleCase } from '@/core';
import { usePalette } from '../../theme/ThemeProvider';
import { space, type Palette } from '../../theme/tokens';
import { IconeDeviation } from '../base';
import { casesVisibles, LIBELLES_ETATS, renduCase } from './statuts';

function styleCase(p: Palette, c: CaseCompacte, cernee: boolean) {
  const rendu = renduCase(c);
  return [
    styles.case,
    rendu === 'plein' && { backgroundColor: p.ink },
    rendu === 'signal' && { backgroundColor: p.signal },
    rendu === 'vide' && { backgroundColor: p.line },
    rendu === 'inconnu' && { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: p.lineStrong },
    c.attendue && rendu === 'vide' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: p.ink },
    cernee && { outlineWidth: 1, outlineOffset: 2, outlineColor: p.ink, outlineStyle: 'solid' as const },
  ];
}

const descriptionCase = (c: CaseCompacte) =>
  `${c.libelle} : ${LIBELLES_ETATS[c.etat]}${c.courante ? ', étape actuelle' : c.attendue ? ', étape attendue' : ''}${c.deviation ? ', avec une déviation' : ''}`;

/** Les points de la barre (listes). Décrite en entier pour les lecteurs d'écran. */
export function BarreCompacte({ cases, ici = null, onCase }: { cases: CaseCompacte[]; ici?: CleCase | null; onCase?: (cle: CleCase) => void }) {
  const p = usePalette();
  const visibles = casesVisibles(cases);
  if (!visibles.length) return null;
  const deviation = visibles.some((c) => c.deviation);
  const marque = deviation && (
    <View style={styles.marque}>
      <IconeDeviation couleur={p.ink} taille={14} />
    </View>
  );
  if (!onCase) {
    return (
      <View accessibilityRole="image" accessibilityLabel={`Parcours : ${visibles.map(descriptionCase).join(' ; ')}`} style={styles.rangee}>
        {visibles.map((c) => (
          <View key={c.cle} style={styleCase(p, c, c.cle === ici)} />
        ))}
        {marque}
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
      {marque}
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  zone: { flex: 1, minHeight: 28, justifyContent: 'center' },
  case: { flex: 1, height: 6, borderRadius: 1 },
  // Dans sa zone tactile (colonne) : toute la largeur, 6 px de haut.
  caseDansZone: { flex: 0, alignSelf: 'stretch' },
  marque: { marginLeft: space[1] },
});
