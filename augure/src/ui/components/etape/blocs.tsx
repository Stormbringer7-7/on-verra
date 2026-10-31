// Blocs de l'écran Étape (planche « Étape ») : bande d'icônes du parcours, en-tête, chiffres clés,
// jauge, personne, lien d'événement, fourche, note, lignes, étapes voisines. Chaque écran d'étape
// est fait de ces mêmes blocs, choisis selon la sorte (regles.ts). Couleurs : la palette du thème ;
// mouvement : mouvement.tsx (animations réduites respectées).

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { Chiffre } from '@/core';
import { nombre } from '../../format';
import { usePalette, useStyles } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { Icone, type NomIcone } from '../Icone';
import { Appui, BarreQuiPousse, Halo } from '../mouvement';
import type { Fourche, Jauge, PasBande } from './regles';

// ---------- Bande du parcours ----------

const PAS = 32;

/** Bande d'icônes : une case par étape visible, l'étape affichée cernée, l'étape en cours avec halo. */
export function BandeParcours({ pas, libelle, onPas }: { pas: PasBande[]; libelle: string; onPas?: (cle: string) => void }) {
  const p = usePalette();
  if (!pas.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={libelle} contentContainerStyle={styles.bande}>
      {pas.map((s, i) => {
        const bord = s.rendu === 'ici' ? p.signal : s.rendu === 'faite' ? p.lineStrong : p.lineFaint;
        const cercle = (
          <View
            style={[
              styles.pas,
              {
                borderColor: bord,
                backgroundColor: s.rendu === 'faite' ? p.surfaceRaised : p.surface,
                borderStyle: s.rendu === 'inconnue' ? 'dashed' : 'solid',
                opacity: s.rendu === 'inconnue' ? 0.5 : 1,
              },
            ]}
          >
            {s.courante && <Halo couleur={p.signal} taille={PAS} />}
            <Icone nom={s.icone} couleur={s.rendu === 'ici' ? p.ink : p.inkSoft} />
          </View>
        );
        return (
          <View key={`${s.cle}-${i}`} style={styles.rangee}>
            {i > 0 && <View style={[styles.trait, { backgroundColor: s.traitPlein ? p.inkSoft : p.lineFaint }]} />}
            {onPas && s.rendu !== 'ici' ? (
              <Appui accessibilityRole="link" accessibilityLabel={`Étape ${s.libelle}`} onPress={() => onPas(s.cle)} hitSlop={6}>
                {cercle}
              </Appui>
            ) : (
              <View accessibilityLabel={s.rendu === 'ici' ? `Étape affichée : ${s.libelle}` : s.libelle}>{cercle}</View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------- En-tête ----------

export function EnteteEtape({ icone, surtitre, titre, statut, quand }: { icone: NomIcone; surtitre: string; titre: string; statut: string; quand: string }) {
  const p = usePalette();
  const s = useStyles();
  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.rangee}>
        <Icone nom={icone} couleur={p.inkMuted} />
        <T style={s.surtitre}>{surtitre}</T>
      </View>
      <T style={s.titreEcran} accessibilityRole="header">
        {titre}
      </T>
      <View style={[styles.rangee, { flexWrap: 'wrap', gap: space[3] }]}>
        <Puce>{statut}</Puce>
        <T variant="small" ton="inkSoft" style={{ fontSize: 15 }}>
          {quand}
        </T>
      </View>
    </View>
  );
}

/** Pastille d'état encadrée (« Faite », « Désaccord »). */
export function Puce({ children }: { children: string }) {
  const p = usePalette();
  return (
    <View style={[styles.puce, { borderColor: p.inkSoft, backgroundColor: p.surfaceSoft }]}>
      <T variant="heading" style={{ fontSize: 15, lineHeight: 20 }}>
        {children}
      </T>
    </View>
  );
}

// ---------- Chiffres clés ----------

const valeurChiffre = (c: Chiffre) => (typeof c.valeur === 'number' ? nombre(c.valeur) : c.valeur);

/** Chiffres publiés de l'étape, en grille (trois par rangée au plus). */
export function ChiffresCles({ chiffres }: { chiffres: Chiffre[] }) {
  const p = usePalette();
  if (!chiffres.length) {
    return (
      <View style={[styles.kpi, { backgroundColor: p.surfaceRaised }]}>
        <T variant="small" ton="inkSoft">
          Chiffres clés : non publiés pour cette étape.
        </T>
      </View>
    );
  }
  return (
    <View style={styles.grille}>
      {chiffres.map((c) => (
        <View
          key={c.libelle}
          style={[styles.kpi, { backgroundColor: p.surfaceRaised, flexBasis: chiffres.length > 2 ? '30%' : '45%' }]}
          accessibilityLabel={`${valeurChiffre(c)} ${c.libelle}`}
        >
          <T variant="data" style={styles.kpiValeur}>
            {valeurChiffre(c)}
          </T>
          <T variant="caption" ton="inkSoft">
            {c.libelle}
            {c.detail ? ` · ${c.detail}` : ''}
          </T>
        </View>
      ))}
    </View>
  );
}

// ---------- Jauge ----------

export function JaugeVue({ jauge }: { jauge: Jauge }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`${jauge.libelle} : ${jauge.valeur}`}>
      <View style={styles.entre}>
        <T variant="small" ton="inkSoft" style={{ flex: 1 }}>
          {jauge.libelle}
        </T>
        <T variant="data">{jauge.valeur}</T>
      </View>
      <View style={[styles.jauge, { backgroundColor: p.surfaceSunken }]}>
        {jauge.fraction !== null && <BarreQuiPousse fraction={jauge.fraction} couleur={p.inkSoft} />}
      </View>
      {jauge.fraction === null && (
        <T variant="caption" ton="inkMuted">
          {jauge.absence ?? 'Donnée non publiée.'}
        </T>
      )}
    </View>
  );
}

// ---------- Personne ----------

/** Personne attendue (rapporteur, président…) que la fiche ne publie pas : la marque, pas un nom. */
export function PersonneIndisponible({ role }: { role: string }) {
  const p = usePalette();
  return (
    <View style={[styles.personne, { backgroundColor: p.surfaceRaised }]} accessibilityLabel={`${role} : non publié`}>
      <View style={[styles.pastille, { borderColor: p.lineStrong }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="heading">{role}</T>
        <T variant="small" ton="inkSoft">
          [—] non publié dans la fiche de l’étape
        </T>
      </View>
    </View>
  );
}

/** Personne publiée : pastille de la couleur de son groupe (toujours montrée). */
export function PersonneBloc({ nom, detail, couleur, onPress }: { nom: string; detail: string; couleur: string; onPress?: () => void }) {
  const p = usePalette();
  const contenu = (
    <>
      <View style={[styles.pastille, { backgroundColor: couleur, borderColor: couleur }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="heading">{nom}</T>
        <T variant="small" ton="inkSoft">
          {detail}
        </T>
      </View>
    </>
  );
  if (!onPress) return <View style={[styles.personne, { backgroundColor: p.surfaceRaised }]}>{contenu}</View>;
  return (
    <Appui accessibilityRole="link" accessibilityLabel={`${nom}, ${detail}`} onPress={onPress} style={[styles.personne, { backgroundColor: p.surfaceRaised }]}>
      {contenu}
    </Appui>
  );
}

// ---------- Lien d'événement ----------

/** Événement du parcours à cette étape (déviation, dossier rattaché) : bordé du signal. */
export function LienEvenement({ icone, libelle, fin, onPress, accessibilityLabel }: { icone: NomIcone; libelle: string; fin: string; onPress(): void; accessibilityLabel: string }) {
  const p = usePalette();
  return (
    <Appui accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.evenement, { borderColor: p.signal }]}>
      <Icone nom={icone} couleur={p.signalHover} taille={18} />
      <T variant="heading" style={{ flex: 1, fontSize: 15 }}>
        {libelle}
      </T>
      <T variant="small" couleur={p.signalHover}>
        {fin}
      </T>
    </Appui>
  );
}

// ---------- Fourche ----------

/** Les deux branches du droit commun : celle prise en clair, l'autre barrée ; aucune si non publiée. */
export function FourcheVue({ fourche }: { fourche: Fourche }) {
  const p = usePalette();
  const lignes: [string, boolean | null][] = fourche.prise
    ? [
        [fourche.prise, true],
        [fourche.autre, false],
      ]
    : fourche.branches.map((b) => [b, null]);
  return (
    <View style={[styles.fourche, { backgroundColor: p.surfaceRaised }]}>
      {lignes.map(([libelle, prise]) => (
        <View key={libelle} style={styles.rangee}>
          <Icone nom={prise ? 'transmission' : 'termine'} couleur={prise ? p.signal : p.lineStrong} taille={18} />
          <T
            variant="small"
            style={[{ flex: 1, fontSize: 15 }, prise === false && { textDecorationLine: 'line-through' }]}
            couleur={prise === false ? p.lineStrong : p.ink}
            accessibilityLabel={prise === false ? `Branche non prise : ${libelle}` : prise ? `Branche prise : ${libelle}` : libelle}
          >
            {libelle}
          </T>
        </View>
      ))}
      {!fourche.prise && (
        <T variant="caption" ton="inkMuted">
          Issue non publiée : aucune branche n’est établie.
        </T>
      )}
    </View>
  );
}

// ---------- Note, lignes ----------

export function Note({ children }: { children: ReactNode }) {
  return (
    <T variant="small" ton="inkSoft">
      {children}
    </T>
  );
}

/** Groupe de lignes (« Ce qu'elle a changé », « Documents »), titre facultatif. */
export function Lignes({ titre, children }: { titre?: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View>
      {titre && (
        <T style={[s.titreSection, { fontSize: 18, lineHeight: 24, paddingBottom: space[1] }]} accessibilityRole="header">
          {titre}
        </T>
      )}
      {children}
    </View>
  );
}

/** Ligne de 48 px au moins, filet en haut ; « › » vers une fiche, « ↗ » vers une page officielle. */
export function LigneEtape({
  libelle,
  detail,
  fin = '›',
  onPress,
  accessibilityLabel,
}: {
  libelle: string;
  detail?: string | null;
  fin?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const contenu = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T>{libelle}</T>
        {detail ? (
          <T variant="caption" ton="inkMuted">
            {detail}
          </T>
        ) : null}
      </View>
      {onPress && (
        <T variant="data" ton="inkMuted" style={{ fontSize: 14 }}>
          {fin}
        </T>
      )}
    </>
  );
  const style = [styles.ligne, { borderTopColor: p.line }];
  if (!onPress) return <View style={style}>{contenu}</View>;
  return (
    <Appui accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? libelle} onPress={onPress} style={style}>
      {contenu}
    </Appui>
  );
}

// ---------- Étapes voisines ----------

export function Voisines({
  precedente,
  suivante,
  onPrecedente,
  onSuivante,
}: {
  precedente: string | null;
  suivante: string | null;
  onPrecedente(): void;
  onSuivante(): void;
}) {
  const p = usePalette();
  const carte = (sens: 'Précédente' | 'Suivante', libelle: string | null, onPress: () => void) => {
    const contenu = (
      <>
        <Label style={{ fontSize: 12, lineHeight: 16, textAlign: sens === 'Suivante' ? 'right' : 'left' }}>{sens === 'Précédente' ? '‹ Précédente' : 'Suivante ›'}</Label>
        <T variant="heading" style={{ fontSize: 15, textAlign: sens === 'Suivante' ? 'right' : 'left' }} ton={libelle ? 'ink' : 'inkMuted'}>
          {libelle ?? '—'}
        </T>
      </>
    );
    const style = [styles.voisine, { borderColor: p.line }];
    return libelle ? (
      <Appui accessibilityRole="link" accessibilityLabel={`Étape ${sens.toLowerCase()} : ${libelle}`} onPress={onPress} style={style}>
        {contenu}
      </Appui>
    ) : (
      <View style={style}>{contenu}</View>
    );
  };
  return (
    <View style={styles.voisines} accessibilityLabel="Étapes voisines">
      {carte('Précédente', precedente, onPrecedente)}
      {carte('Suivante', suivante, onSuivante)}
    </View>
  );
}

const styles = StyleSheet.create({
  bande: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  trait: { width: 14, height: 2, marginRight: 6 },
  pas: { width: PAS, height: PAS, borderRadius: PAS / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  puce: { paddingVertical: 6, paddingHorizontal: space[3], borderWidth: 1, borderRadius: 2 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  kpi: { flexGrow: 1, gap: space[1], padding: space[3], borderRadius: radius.lg, minWidth: 0 },
  kpiValeur: { fontSize: 22, lineHeight: 26 },
  jauge: { height: 8, borderRadius: 4, overflow: 'hidden' },
  personne: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.lg },
  pastille: { width: 10, height: 10, borderRadius: radius.full, borderWidth: 1.5 },
  evenement: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1, minHeight: 48 },
  fourche: { gap: space[2], padding: space[3], borderRadius: radius.lg },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: space[2], borderTopWidth: 1 },
  voisines: { flexDirection: 'row', gap: space[2] },
  voisine: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1, minHeight: 48 },
});
