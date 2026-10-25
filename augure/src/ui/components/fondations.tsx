// Composants du design system Panoptique v2 (README du design system, « Composants ») : Avertissement,
// Indicateur à échelle, Puces, Interrupteur, Avant / Après, Pastille de statut ; le sélecteur segmenté
// est `Segmente` (base.tsx), réexporté ici sous son nom du design system. Aucune donnée métier ici.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useLarge } from '../hooks/miseEnPage';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Segmente, T } from './base';

export { Segmente as SelecteurSegmente };

// ---------- Avertissement ----------

export type TypeAvertissement = 'info' | 'prudence' | 'ia' | 'simulation';

const GLYPHES: Record<TypeAvertissement, string> = { info: 'i', prudence: '!', ia: '✦', simulation: '?' };

/**
 * Avertissement (NOTE) : carte bordée, pastille ronde 26 px avec son symbole, titre, texte `ink-soft`,
 * lien facultatif. Un ou deux par écran au plus, à côté du contenu qu'ils qualifient.
 */
export function Avertissement({
  type = 'info',
  titre,
  children,
  lien,
}: {
  type?: TypeAvertissement;
  titre: string;
  children?: ReactNode;
  lien?: { libelle: string; onPress(): void };
}) {
  const p = usePalette();
  const couleur = type === 'prudence' ? p.caution : type === 'ia' ? p.ai : p.inkSoft;
  return (
    <View accessibilityRole="summary" style={[styles.avertissement, { backgroundColor: p.surfaceRaised, borderColor: p.line }]}>
      <View aria-hidden style={[styles.glyphe, { borderColor: couleur }]}>
        <T variant="label" couleur={couleur} style={styles.glypheTexte}>
          {GLYPHES[type]}
        </T>
      </View>
      <View style={styles.avertissementTexte}>
        <T variant="heading" style={styles.avertissementTitre}>
          {titre}
        </T>
        {children !== undefined && <T ton="inkSoft">{children}</T>}
        {lien && (
          <Pressable accessibilityRole="link" onPress={lien.onPress} style={[styles.lienSouligne, { borderBottomColor: p.lineStrong }]}>
            <T variant="label" ton="ink">
              {lien.libelle}
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------- Indicateur à échelle ----------

/**
 * Échelle 0–100 qui situe une valeur parmi les autres : zone grisée = la moitié du milieu (q1 à q3),
 * trait = médiane, rond = la valeur. Rien n'est dessiné pour une distribution inconnue.
 */
export function EchelleIndicateur({
  valeur,
  mediane,
  quartiles,
  libelle,
}: {
  valeur: number;
  mediane?: number | null;
  quartiles?: [number, number] | null;
  /** Phrase lue par un lecteur d'écran (« 88 votes sur 100 ; médiane 79 »). */
  libelle: string;
}) {
  const p = usePalette();
  const pc = (v: number) => `${Math.max(0, Math.min(100, v))}%` as const;
  return (
    <View accessibilityRole="image" accessibilityLabel={libelle} style={styles.echelle}>
      <View style={[styles.piste, { backgroundColor: p.surfaceSunken }]} />
      {quartiles && (
        <View style={[styles.bande, { left: pc(quartiles[0]), width: pc(quartiles[1] - quartiles[0]), backgroundColor: p.lineFaint }]} />
      )}
      {mediane != null && <View style={[styles.mediane, { left: pc(mediane), backgroundColor: p.inkMuted }]} />}
      <View style={[styles.ici, { left: pc(valeur), backgroundColor: p.ink, borderColor: p.surfaceRaised }]} />
    </View>
  );
}

/**
 * Indicateur : étiquette, grand chiffre mono et son unité en phrase, phrase qui l'explique, échelle
 * facultative, note de calcul.
 */
export function IndicateurEchelle({
  etiquette,
  valeur,
  unite,
  phrase,
  echelle,
  calcul,
}: {
  etiquette: string;
  valeur: string;
  unite: string;
  phrase?: string;
  echelle?: { valeur: number; mediane?: number | null; quartiles?: [number, number] | null; libelle: string };
  calcul?: string;
}) {
  const large = useLarge();
  return (
    <View style={styles.indicateur}>
      <T variant="label" ton="inkMuted">
        {etiquette}
      </T>
      <View style={styles.chiffre}>
        <T variant={large ? 'dataXL' : 'dataLarge'}>{valeur}</T>
        <T ton="inkSoft">{unite}</T>
      </View>
      {phrase && <T>{phrase}</T>}
      {echelle && (
        <>
          <EchelleIndicateur {...echelle} />
          <T variant="caption" ton="inkMuted">
            Ici · Médiane · La moitié du milieu
          </T>
        </>
      )}
      {calcul && (
        <T variant="caption" ton="inkMuted">
          {calcul}
        </T>
      )}
    </View>
  );
}

// ---------- Puces ----------

/** Rangée de puces de filtre : défilement horizontal en portrait, retour à la ligne en paysage. */
export function Puces({ children, label }: { children: ReactNode; label: string }) {
  const large = useLarge();
  if (large) {
    return (
      <View accessibilityRole="toolbar" accessibilityLabel={label} style={styles.pucesLarges}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView accessibilityRole="toolbar" accessibilityLabel={label} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pucesPortrait}>
      {children}
    </ScrollView>
  );
}

// ---------- Interrupteur ----------

/** Interrupteur 52 × 32, actif `ink`, toujours avec son libellé. */
export function Interrupteur({ valeur, onChange, libelle, aide }: { valeur: boolean; onChange(v: boolean): void; libelle: string; aide?: string }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: valeur }} accessibilityLabel={libelle} onPress={() => onChange(!valeur)} style={styles.interrupteur}>
      <View style={styles.interrupteurTexte}>
        <T>{libelle}</T>
        {aide && (
          <T variant="small" ton="inkMuted">
            {aide}
          </T>
        )}
      </View>
      <Switch
        value={valeur}
        onValueChange={onChange}
        trackColor={{ false: p.surfaceSoft, true: p.ink }}
        thumbColor={valeur ? p.surface : p.inkMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

// ---------- Avant / Après ----------

/** Morceau de texte : inchangé, retiré (surligné dans Avant) ou ajouté (surligné dans Après). Jamais barré. */
export type Morceau = { type: 'egal' | 'retire' | 'ajoute'; texte: string };

/** Deux blocs : Avant bordé, Après sur `surface-soft` ; les morceaux changés surlignés. */
export function AvantApres({ morceaux, avant = 'Avant', apres = 'Après' }: { morceaux: Morceau[]; avant?: string; apres?: string }) {
  const p = usePalette();
  const large = useLarge();
  const bloc = (garde: Morceau['type'], surligne: string) =>
    morceaux
      .filter((m) => m.type === 'egal' || m.type === garde)
      .map((m, i) => (
        <T key={i} style={m.type === garde ? { backgroundColor: surligne } : undefined}>
          {m.texte}
        </T>
      ));
  return (
    <View style={[styles.avantApres, large && styles.avantApresLarge]}>
      <View style={[styles.blocAvant, { borderColor: p.inkSoft }]}>
        <T variant="label" ton="inkMuted">
          {avant}
        </T>
        <T>{bloc('retire', p.diffRemoved)}</T>
      </View>
      <View style={[styles.blocApres, { backgroundColor: p.surfaceSoft }]}>
        <T variant="label" ton="inkMuted">
          {apres}
        </T>
        <T>{bloc('ajoute', p.diffAdded)}</T>
      </View>
    </View>
  );
}

// ---------- Pastille de statut ----------

/** « Fait établi » (`ink-soft`) ou « Rapprochement à vérifier » (`caution`). */
export function PastilleStatut({ statut, libelle }: { statut: 'etabli' | 'a_verifier'; libelle?: string }) {
  const p = usePalette();
  const texte = libelle ?? (statut === 'etabli' ? 'Fait établi' : 'Rapprochement à vérifier');
  return (
    <View style={[styles.pastilleStatut, { backgroundColor: p.surfaceSoft }]}>
      <T variant="caption" couleur={statut === 'a_verifier' ? p.caution : p.inkSoft} style={styles.pastilleTexte}>
        {texte}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  avertissement: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: space[4], borderWidth: 1, borderRadius: radius.lg },
  glyphe: { width: 26, height: 26, borderRadius: radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  glypheTexte: { lineHeight: 18 },
  avertissementTexte: { flex: 1, gap: space[1], minWidth: 0 },
  avertissementTitre: { fontSize: 15, lineHeight: 22 },
  lienSouligne: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', borderBottomWidth: 1 },
  echelle: { height: 24, justifyContent: 'center' },
  piste: { position: 'absolute', left: 0, right: 0, top: 9, height: 6, borderRadius: radius.full },
  bande: { position: 'absolute', top: 9, height: 6, borderRadius: radius.full },
  mediane: { position: 'absolute', top: 4, width: 2, height: 16, marginLeft: -1 },
  ici: { position: 'absolute', top: 4, width: 16, height: 16, marginLeft: -8, borderRadius: radius.full, borderWidth: 3 },
  indicateur: { gap: space[2] },
  chiffre: { gap: 2 },
  pucesLarges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  pucesPortrait: { flexDirection: 'row', gap: space[2], paddingBottom: 2 },
  interrupteur: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4], minHeight: 64 },
  interrupteurTexte: { flex: 1, gap: 2 },
  avantApres: { gap: space[4] },
  avantApresLarge: { flexDirection: 'row' },
  blocAvant: { flex: 1, gap: space[2], padding: space[5], borderRadius: radius.lg, borderWidth: 1 },
  blocApres: { flex: 1, gap: space[2], padding: space[5], borderRadius: radius.lg },
  pastilleStatut: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: space[2], borderRadius: radius.full, justifyContent: 'center' },
  pastilleTexte: { fontSize: 13 },
});
