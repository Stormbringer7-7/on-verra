// Rail vertical du parcours d'un dossier (fiche Dossier, canevas « 11 · Parcours : le rail du
// dossier » à « 13 · Dossiers rattachés ») : en tête, le modèle suivi et son fondement (dépliable),
// l'interrupteur « Comparer au droit commun » ; puis chaque étape du modèle reliée par un trait
// (plein jusqu'à la dernière étape établie, pointillé ensuite), l'attente entre deux étapes, les
// déviations décrochées d'un seul niveau (icône dessinée, jamais un emoji), les branches du droit
// commun prises, les dossiers rattachés dépliables sous leur étape. Les étapes sans objet ne
// paraissent qu'en comparant, barrées. Rien n'est jamais un échec : « Donnée non publiée ».
// Lignes : `lignesRail` (statuts.ts), testées sous Node.

import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { CleCase, DeviationParcours, EtapeResume, Parcours } from '@/core';
import { date } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space, type Palette } from '../../theme/tokens';
import { IconeDeviation, Label, T } from '../base';
import { CHAMBRE_COURTE } from '../dossiers/presentation';
import { lignesRail, nombreRattaches, type LigneRail, type TraitRail } from './statuts';

type Props = {
  parcours: Parcours;
  /** Étapes de la fiche (organe de chaque étape), par clé. */
  etapes?: EtapeResume[];
  onEtape(cle: CleCase): void;
  onDeviation(d: DeviationParcours): void;
  onDossier(id: string): void;
};

/** Largeur de la colonne du rail (trait, points, coude des déviations). */
const RAIL = 40;

export function RailParcours({ parcours, etapes = [], onEtape, onDeviation, onDossier }: Props) {
  const p = usePalette();
  const [comparer, setComparer] = useState(false);
  const [fondement, setFondement] = useState(false);
  const [deplie, setDeplie] = useState<CleCase | null>(null);
  const lignes = lignesRail(parcours, comparer);
  const organes = new Map(etapes.map((e) => [e.cle, e.organe?.nom ?? null]));
  const echeance = parcours.prochaineEcheance;
  const sautees = parcours.cases.filter((c) => c.etat === 'sans_objet').length;

  return (
    <View style={styles.bloc}>
      <View style={[styles.entete, { backgroundColor: p.surfaceRaised, borderColor: p.line }]}>
        <View style={styles.ligneEntete}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="caption" ton="inkMuted">Parcours suivi</T>
            <T variant="heading">{parcours.modele.libelle}</T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fondement du parcours"
            accessibilityState={{ expanded: fondement }}
            onPress={() => setFondement(!fondement)}
            style={[styles.info, { borderColor: p.inkSoft }]}
          >
            <Label ton="ink">i</Label>
          </Pressable>
        </View>
        {fondement && <T variant="small" ton="inkSoft">{parcours.modele.fondement}</T>}
        <View style={[styles.ligneEntete, styles.separe, { borderTopColor: p.line }]}>
          <T variant="heading" style={{ flex: 1 }}>Comparer au droit commun</T>
          <Switch
            accessibilityLabel="Comparer au droit commun"
            value={comparer}
            onValueChange={setComparer}
            trackColor={{ false: p.lineFaint, true: p.ink }}
            thumbColor={comparer ? p.surface : p.inkSoft}
          />
        </View>
        {comparer && (
          <T variant="small" ton="inkSoft">
            {sautees
              ? `Les ${sautees} étapes du droit commun que ce dossier n’a pas eues sont montrées barrées.`
              : 'Ce dossier a suivi toutes les étapes du droit commun.'}
          </T>
        )}
      </View>

      <View accessibilityRole="list" accessibilityLabel="Parcours">
        {lignes.map((l, i) => (
          <LigneDuRail
            key={i}
            ligne={l}
            organe={l.type === 'etape' ? (organes.get(l.etape.cle) ?? null) : null}
            ouvert={l.type === 'enfants' && deplie === l.etape}
            onEtape={onEtape}
            onDeviation={onDeviation}
            onDossier={onDossier}
            onDeplier={(cle) => setDeplie(deplie === cle ? null : cle)}
          />
        ))}
      </View>

      <Legende comparer={comparer} />
      {echeance && (
        <T variant="small">
          Prochaine échéance : {echeance.libelle} le {date(echeance.date)}
          {echeance.etat ? ` (${echeance.etat})` : ''}
        </T>
      )}
    </View>
  );
}

/** Trait vertical du rail, dans la colonne de gauche. */
function Trait({ trait, haut = 0, p }: { trait: TraitRail; haut?: number; p: Palette }) {
  if (trait === 'aucun') return null;
  return (
    <View
      style={[
        styles.trait,
        { top: haut },
        trait === 'plein'
          ? { backgroundColor: p.lineStrong }
          : { borderLeftWidth: 2, borderStyle: 'dashed', borderColor: p.lineFaint, backgroundColor: 'transparent' },
      ]}
    />
  );
}

/** Point d'une étape : plein (faite), signal (en cours), creux (à venir), pointillé (inconnu), tirets (sans objet), cerclé (attendue). */
function Point({ etat, attendue, p }: { etat: string; attendue: boolean; p: Palette }) {
  const style = attendue
    ? { backgroundColor: p.surface, borderWidth: 2, borderColor: p.ink }
    : etat === 'faite'
      ? { backgroundColor: p.inkSoft }
      : etat === 'en_cours'
        ? { backgroundColor: p.signal }
        : etat === 'inconnu'
          ? { backgroundColor: p.surface, borderWidth: 2, borderStyle: 'dotted' as const, borderColor: p.inkSoft }
          : etat === 'sans_objet'
            ? { backgroundColor: p.surface, borderWidth: 2, borderStyle: 'dashed' as const, borderColor: p.lineFaint }
            : { backgroundColor: p.surface, borderWidth: 2, borderColor: p.lineStrong };
  return <View style={[styles.point, style]} />;
}

function LigneDuRail(props: {
  ligne: LigneRail;
  organe: string | null;
  ouvert: boolean;
  onEtape(cle: CleCase): void;
  onDeviation(d: DeviationParcours): void;
  onDossier(id: string): void;
  onDeplier(cle: CleCase): void;
}) {
  const { ligne: l, organe, ouvert } = props;
  const p = usePalette();

  if (l.type === 'etape') {
    const c = l.etape;
    const sansObjet = c.etat === 'sans_objet';
    const marque = c.courante ? 'Étape actuelle' : c.attendue ? 'Étape attendue' : null;
    const lieu = c.lieu ? CHAMBRE_COURTE[c.lieu] : null;
    const contenu = (
      <>
        <View style={styles.titreEtape}>
          <T
            variant="heading"
            couleur={sansObjet ? p.lineStrong : c.etat === 'a_venir' && !c.attendue ? p.inkSoft : p.ink}
            style={sansObjet ? { textDecorationLine: 'line-through' } : undefined}
          >
            {c.libelle}
          </T>
          {lieu && (
            <View style={[styles.lieu, { borderColor: p.lineFaint }]}>
              <Label style={{ fontSize: 11 }}>{lieu}</Label>
            </View>
          )}
          {l.nature && <Label ton="inkMuted">{l.nature}</Label>}
        </View>
        {marque && (
          <View style={[styles.marque, { backgroundColor: p.ink }]}>
            <Label couleur={p.surface}>{marque}</Label>
          </View>
        )}
        <T variant="small" couleur={c.etat === 'en_cours' ? p.signalHover : c.attendue ? p.ink : sansObjet ? p.lineStrong : p.inkMuted}>
          {l.quand}
        </T>
        {organe && !sansObjet && <T variant="caption" ton="inkMuted">{organe}</T>}
        {c.conclusion && !sansObjet && (
          <View style={[styles.conclusion, { backgroundColor: p.surfaceSoft }]}>
            <T variant="small">{c.conclusion}</T>
          </View>
        )}
      </>
    );
    return (
      <View style={styles.rangee} accessibilityRole="none">
        <View style={styles.colonne}>
          <Trait trait={l.trait} haut={12} p={p} />
          <Point etat={c.etat} attendue={c.attendue} p={p} />
        </View>
        {sansObjet ? (
          <View style={[styles.corps, { opacity: 0.8 }]}>{contenu}</View>
        ) : (
          <Pressable accessibilityRole="link" accessibilityLabel={`Étape ${c.libelle}, ${l.quand}`} onPress={() => props.onEtape(c.cle)} style={styles.corps}>
            {contenu}
          </Pressable>
        )}
      </View>
    );
  }

  if (l.type === 'attente') {
    return (
      <View style={styles.rangee}>
        <View style={styles.colonne}>
          <Trait trait={l.trait} p={p} />
        </View>
        <T variant="caption" ton="inkMuted" style={styles.attente}>
          {l.libelle}
        </T>
      </View>
    );
  }

  if (l.type === 'deviation') {
    const d = l.deviation;
    return (
      <View style={styles.rangee}>
        <View style={styles.colonne}>
          <Trait trait={l.trait} p={p} />
          {/* détour : le coude part du rail (première déviation), y revient si le parcours reprend */}
          <View style={[styles.voie, { backgroundColor: p.ink, top: l.premiere ? 10 : 0, bottom: l.derniere ? 14 : 0 }]} />
          {l.premiere && <View style={[styles.coudeHaut, { borderColor: p.ink }]} />}
          {l.derniere && d.effet !== 'termine' && <View style={[styles.coudeBas, { borderColor: p.ink }]} />}
          <View style={[styles.pastilleDeviation, { backgroundColor: p.surface, borderColor: p.ink }]}>
            <IconeDeviation couleur={p.ink} taille={12} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Voir la déviation : ${d.libelle}`}
          onPress={() => props.onDeviation(d)}
          style={[styles.carteDeviation, { borderColor: p.lineFaint, backgroundColor: p.surfaceRaised }]}
        >
          <View style={styles.entreDeux}>
            <T variant="heading" style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>
              {d.libelle}
            </T>
            <T variant="caption" ton="inkMuted">{d.debut ? date(d.debut) : 'Date non publiée'}</T>
          </View>
          {d.conclusion && <T variant="small" ton="inkSoft">{d.conclusion}</T>}
          <T variant="caption" ton="inkMuted">{`${l.effet} · détails`}</T>
        </Pressable>
      </View>
    );
  }

  if (l.type === 'branche') {
    return (
      <View style={styles.rangee}>
        <View style={styles.colonne}>
          <Trait trait={l.trait} p={p} />
          <View style={[styles.raccourci, { borderColor: p.inkMuted }]} />
        </View>
        <View style={styles.texteBranche}>
          <T variant="small" ton="inkSoft">{l.libelle}</T>
          <T variant="small" ton="inkMuted">{l.vers}</T>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rangee}>
      <View style={styles.colonne}>
        <Trait trait={l.trait} p={p} />
        <View style={[styles.branchement, { backgroundColor: p.inkMuted }]} />
      </View>
      <View style={styles.enfants}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: ouvert }}
          onPress={() => props.onDeplier(l.etape)}
          style={[styles.deplier, { borderColor: p.lineStrong }]}
        >
          <Label ton="ink">{`${ouvert ? 'Replier' : 'Déplier'} : ${nombreRattaches(l.dossiers.length)}`}</Label>
        </Pressable>
        {ouvert &&
          l.dossiers.map((k) => (
            <Pressable
              key={k.dossier.id}
              accessibilityRole="link"
              accessibilityLabel={`Dossier rattaché : ${k.dossier.titre}`}
              onPress={() => props.onDossier(k.dossier.id)}
              style={[styles.enfant, { backgroundColor: p.surfaceRaised }]}
            >
              <T variant="heading" style={{ fontSize: 15, lineHeight: 21 }}>
                {k.dossier.titre}
              </T>
              <T variant="caption" ton="inkMuted">Lien établi par un document cité par les deux dossiers</T>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

function Legende({ comparer }: { comparer: boolean }) {
  const p = usePalette();
  const items: [string, string, boolean][] = [
    ['faite', 'Faite', false],
    ['en_cours', 'En cours', false],
    ['a_venir', 'À venir', false],
    ['attendue', 'Attendue', true],
    ['inconnu', 'Donnée non publiée', false],
    ...(comparer ? ([['sans_objet', 'Sans objet ici', false]] as [string, string, boolean][]) : []),
  ];
  return (
    <View style={styles.legende}>
      {items.map(([etat, libelle, attendue]) => (
        <View key={etat} style={styles.itemLegende}>
          <View style={styles.pointLegende}>
            <Point etat={etat} attendue={attendue} p={p} />
          </View>
          <T variant="caption" ton="inkSoft">{libelle}</T>
        </View>
      ))}
      <View style={styles.itemLegende}>
        <IconeDeviation couleur={p.ink} taille={14} />
        <T variant="caption" ton="inkSoft">Déviation</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[4] },
  entete: { gap: space[3], padding: 14, borderRadius: radius.md, borderWidth: 1 },
  ligneEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  separe: { paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  info: { width: 36, height: 36, borderRadius: radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rangee: { flexDirection: 'row', minWidth: 0 },
  colonne: { width: RAIL, position: 'relative' },
  trait: { position: 'absolute', left: 9, width: 2, bottom: 0 },
  point: { position: 'absolute', left: 2, top: 4, width: 16, height: 16, borderRadius: radius.full },
  corps: { flex: 1, minWidth: 0, gap: space[1], paddingBottom: 22 },
  titreEtape: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space[2] },
  lieu: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6 },
  marque: { alignSelf: 'flex-start', paddingHorizontal: space[2], borderRadius: radius.full },
  conclusion: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.sm },
  attente: { paddingBottom: 18, marginTop: -10, fontStyle: 'italic' },
  voie: { position: 'absolute', left: 29, width: 2 },
  coudeHaut: {
    position: 'absolute', left: 9, top: -6, width: 21, height: 18,
    borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 12,
  },
  coudeBas: {
    position: 'absolute', left: 9, bottom: 0, width: 21, height: 16,
    borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 12,
  },
  pastilleDeviation: {
    position: 'absolute', left: 18, top: 10, width: 24, height: 24, borderRadius: radius.full, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  carteDeviation: { flex: 1, minWidth: 0, marginLeft: 10, marginBottom: 14, gap: space[1], padding: space[3], borderRadius: radius.md, borderWidth: 1 },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  raccourci: {
    position: 'absolute', left: 10, top: 2, width: 20, height: 14,
    borderTopWidth: 1, borderRightWidth: 1, borderTopRightRadius: 10,
  },
  texteBranche: { flex: 1, minWidth: 0, gap: 2, paddingLeft: 10, paddingBottom: 18 },
  branchement: { position: 'absolute', left: 10, top: 22, width: 20, height: 1 },
  enfants: { flex: 1, minWidth: 0, gap: space[2], paddingLeft: 10, paddingBottom: 18 },
  deplier: {
    alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: radius.full, borderWidth: 1, borderStyle: 'dashed',
  },
  enfant: { gap: space[1], padding: space[3], borderRadius: radius.md },
  legende: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, columnGap: space[4] },
  itemLegende: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointLegende: { width: 20, height: 24, position: 'relative' },
});
