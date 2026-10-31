// Rail vertical du parcours d'un dossier (maquette v3, planches « Dossier » et « DossierTypes ») :
// en tête, l'interrupteur « Seulement les décisions » (les réunions et séances intermédiaires se
// plient, pli animé) ; puis un nœud par étape, l'icône de son lieu dans un cercle d'état (fait,
// actuel avec halo, terminal en aplat, à venir en bordure prévue / si… / facultative), relié au
// suivant par un trait (plein jusqu'à la dernière étape établie, pointillé ensuite). Chaque nœud
// ouvre l'écran Étape ; un événement (49.3, retrait…) est une étiquette qui ouvre sa feuille ; les
// dossiers rattachés sont des blocs sous leur étape, qui mènent à leur fiche, avec leurs motions
// (nombre, issue, voix pour : `resumeRattache`). Les étapes sans objet
// sont masquées. Rien n'est jamais un échec : « Donnée non publiée ». Nœuds : `noeudsRail`
// (dossiers/parcoursVue.ts), testés sous Node.

import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import type { CleCase, DeviationParcours, EtapeResume, Parcours } from '@/core';
import { date } from '../../format';
import { useAnimationsReduites } from '../../hooks/reglages';
import { usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space, type Palette } from '../../theme/tokens';
import { Label, T } from '../base';
import { groupesRail, noeudsRail, resumeRattache, sousTitreDecisions, type NoeudRail } from '../dossiers/parcoursVue';
import { Icone } from '../Icone';
import { animerMiseEnPage, Appui, Halo } from '../mouvement';

type Props = {
  parcours: Parcours;
  /** Étapes de la fiche (chiffres de chaque étape), par clé. */
  etapes?: EtapeResume[];
  onEtape(cle: CleCase): void;
  onDeviation(d: DeviationParcours): void;
  onDossier(id: string): void;
};

/** Diamètre du cercle d'un nœud. */
const CERCLE = 30;
const MINEUR = 22;

export function RailParcours({ parcours, etapes = [], onEtape, onDeviation, onDossier }: Props) {
  const p = usePalette();
  const reduites = useAnimationsReduites();
  const [decisions, setDecisions] = useState(true);
  const noeuds = noeudsRail(parcours, etapes);
  const groupes = groupesRail(noeuds);
  const pliables = noeuds.some((n) => n.intermediaire);
  const echeance = parcours.prochaineEcheance;
  const basculer = (v: boolean) => {
    animerMiseEnPage(reduites);
    setDecisions(v);
  };

  return (
    <View style={styles.bloc}>
      {pliables && (
        <View style={[styles.filtre, { backgroundColor: p.surfaceRaised }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="small" style={styles.gras}>Seulement les décisions</T>
            <T variant="caption" ton="inkMuted">{sousTitreDecisions(noeuds, decisions)}</T>
          </View>
          <Switch
            accessibilityLabel="Seulement les décisions"
            value={decisions}
            onValueChange={basculer}
            trackColor={{ false: p.lineFaint, true: p.ink }}
            thumbColor={decisions ? p.surface : p.inkMuted}
          />
        </View>
      )}

      <View accessibilityRole="list" accessibilityLabel="Parcours">
        {groupes.map((g, i) =>
          g.type === 'noeud' ? (
            <Noeud key={g.noeud.cas.cle} noeud={g.noeud} onEtape={onEtape} onDeviation={onDeviation} onDossier={onDossier} />
          ) : (
            !decisions && (
              <View key={`pli-${i}`}>
                {g.noeuds.map((n) => (
                  <Noeud key={n.cas.cle} noeud={n} mineur onEtape={onEtape} onDeviation={onDeviation} onDossier={onDossier} />
                ))}
              </View>
            )
          ),
        )}
      </View>

      <Legende p={p} />
      {echeance && (
        <T variant="small">
          Prochaine échéance : {echeance.libelle} le {date(echeance.date)}
          {echeance.etat ? ` (${echeance.etat})` : ''}
        </T>
      )}
    </View>
  );
}

/** Bordure du cercle selon la nature d'une étape qui n'a pas encore eu lieu. */
const BORDURE = { obligatoire: 'solid', conditionnelle: 'dashed', facultative: 'dotted' } as const;

function styleCercle(n: NoeudRail, p: Palette) {
  if (n.devie) return { backgroundColor: p.surface, borderColor: p.signal, borderStyle: 'solid' as const, icone: p.signalHover };
  switch (n.rendu) {
    case 'actuel':
    case 'terminal':
      return { backgroundColor: p.ink, borderColor: p.ink, borderStyle: 'solid' as const, icone: p.surface };
    case 'attendu':
      return { backgroundColor: p.surface, borderColor: p.ink, borderStyle: BORDURE[n.nature], icone: p.ink };
    case 'fait':
      return { backgroundColor: p.surfaceSoft, borderColor: p.lineStrong, borderStyle: 'solid' as const, icone: p.ink };
    case 'inconnu':
      return { backgroundColor: p.surface, borderColor: p.lineFaint, borderStyle: 'solid' as const, icone: p.inkMuted };
    case 'a_venir':
      return { backgroundColor: p.surface, borderColor: p.lineStrong, borderStyle: BORDURE[n.nature], icone: p.inkSoft };
  }
}

const MARQUE: Partial<Record<NoeudRail['rendu'], string>> = { actuel: 'étape actuelle', attendu: 'étape attendue', terminal: 'dernière étape' };

function Noeud({
  noeud: n,
  mineur = false,
  onEtape,
  onDeviation,
  onDossier,
}: {
  noeud: NoeudRail;
  mineur?: boolean;
  onEtape(cle: CleCase): void;
  onDeviation(d: DeviationParcours): void;
  onDossier(id: string): void;
}) {
  const p = usePalette();
  const c = styleCercle(n, p);
  const taille = mineur ? MINEUR : CERCLE;
  const aVenir = n.rendu === 'a_venir' || n.rendu === 'inconnu';
  const description = [n.cas.libelle, MARQUE[n.rendu], n.lignes[0], n.date].filter(Boolean).join(', ');
  return (
    <View style={styles.rangee}>
      <View style={styles.colonne}>
        <View style={[styles.cercleZone, { width: CERCLE, height: CERCLE }]}>
          {n.rendu === 'actuel' && <Halo couleur={p.signal} taille={CERCLE} />}
          <View
            style={[
              styles.cercle,
              { width: taille, height: taille, backgroundColor: c.backgroundColor, borderColor: c.borderColor, borderStyle: c.borderStyle },
            ]}
          >
            <Icone nom={n.icone} couleur={c.icone} taille={mineur ? 12 : 14} />
          </View>
        </View>
        {n.trait !== 'aucun' && (
          <View
            style={[
              styles.trait,
              n.trait === 'plein'
                ? { backgroundColor: p.lineStrong }
                : { borderLeftWidth: 2, borderStyle: 'dashed', borderColor: p.lineFaint, backgroundColor: 'transparent' },
            ]}
          />
        )}
      </View>
      <View style={[styles.corps, n.trait === 'aucun' && { paddingBottom: 0 }]}>
        <Appui accessibilityRole="link" accessibilityLabel={`Étape ${description}`} onPress={() => onEtape(n.cas.cle)} style={styles.titreZone}>
          <T
            variant={mineur ? 'small' : 'heading'}
            couleur={mineur || aVenir ? p.inkMuted : p.ink}
            style={[{ flex: 1 }, mineur ? { fontSize: 15 } : { fontSize: 16, lineHeight: 22 }]}
          >
            {n.cas.libelle}
          </T>
          <T variant="data" ton="inkMuted" style={styles.date}>{n.date}</T>
        </Appui>
        {n.evenements.map((e) => (
          <Appui
            key={e.cle}
            accessibilityRole="button"
            accessibilityLabel={`Voir l’événement : ${e.deviation.libelle}`}
            onPress={() => onDeviation(e.deviation)}
            style={[styles.etiquette, { backgroundColor: p.signalSoft }]}
          >
            <Icone nom={e.icone} couleur={p.signalHover} taille={12} />
            <Label couleur={p.signalHover} style={styles.etiquetteTexte}>{`${e.libelle} ›`}</Label>
          </Appui>
        ))}
        {n.lignes.map((l, i) => (
          <T key={i} variant="small" ton={i === 0 && n.cas.conclusion ? 'inkSoft' : 'inkMuted'}>{l}</T>
        ))}
        {n.enfants.map((k) => (
          <Appui
            key={k.dossier.id}
            accessibilityRole="link"
            accessibilityLabel={`Dossier rattaché : ${k.dossier.titre}${resumeRattache(k) ? `. ${resumeRattache(k)}` : ''}`}
            onPress={() => onDossier(k.dossier.id)}
            style={[styles.enfant, { borderColor: p.line }]}
          >
            <T variant="small" style={styles.gras}>{k.dossier.titre}</T>
            {resumeRattache(k) && <T variant="caption" ton="inkSoft">{resumeRattache(k)}</T>}
            <T variant="caption" ton="inkMuted">{`Dossier rattaché${k.etapeLibelle ? ` · ${k.etapeLibelle}` : ''} ›`}</T>
          </Appui>
        ))}
      </View>
    </View>
  );
}

function Legende({ p }: { p: Palette }) {
  const items: [string, 'solid' | 'dashed' | 'dotted'][] = [
    ['prévue', 'solid'],
    ['si…', 'dashed'],
    ['facultative', 'dotted'],
  ];
  return (
    <View style={styles.legende}>
      {items.map(([libelle, bordure]) => (
        <View key={libelle} style={styles.itemLegende}>
          <View style={[styles.pointLegende, { borderColor: p.lineStrong, borderStyle: bordure }]} />
          <T variant="caption" ton="inkMuted">{libelle}</T>
        </View>
      ))}
      <View style={styles.itemLegende}>
        <View style={[styles.pointLegende, { borderColor: p.signal }]} />
        <T variant="caption" ton="inkMuted">événement</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[3] },
  filtre: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg },
  gras: { fontFamily: fonts.sansSemiBold },
  rangee: { flexDirection: 'row', gap: space[3], minWidth: 0 },
  colonne: { width: CERCLE, alignItems: 'center' },
  cercleZone: { alignItems: 'center', justifyContent: 'center' },
  cercle: { borderRadius: radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  trait: { flex: 1, width: 2, minHeight: 14 },
  corps: { flex: 1, minWidth: 0, gap: 3, paddingTop: 4, paddingBottom: space[4] },
  titreZone: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], minHeight: 28 },
  date: { paddingTop: 3, textAlign: 'right' },
  etiquette: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 7, borderRadius: 2 },
  etiquetteTexte: { fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemiBold },
  enfant: { alignSelf: 'stretch', gap: 2, marginTop: 6, paddingVertical: space[2], paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, minHeight: 44 },
  legende: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 },
  itemLegende: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointLegende: { width: 12, height: 12, borderRadius: radius.full, borderWidth: 1.5 },
});
