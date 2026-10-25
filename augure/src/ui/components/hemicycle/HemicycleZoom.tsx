// Hémicycle cliquable et zoomable (molette, pincement, double tap) : un point par siège, de la
// gauche vers la droite dans l'ordre reçu (groupe, puis siège publié). Toucher un siège :
//   - siège d'une personne (Scrutin, Institutions) : son nom, son groupe, ce qu'elle a fait, et
//     « Voir sa fiche » ;
//   - siège de groupe (seulement des décomptes) : le groupe est mis en avant, les autres estompés,
//     avec ce que l'écran en dit. Aucune personne n'est inventée pour un siège.
// La même chose en liste, groupe par groupe, pour un lecteur d'écran (« Liste des sièges »).
// Le dessin reste léger : un tracé SVG par couleur (disposition.tracesParCouleur), le siège touché
// est retrouvé par le calcul (zoom/geometrie.plusProche), pas par un composant par point.

import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { GroupeRef } from '@/core';
import { usePalette } from '../../theme/ThemeProvider';
import { ESTOMPE, radius, space } from '../../theme/tokens';
import { Action, BoutonSecondaire, Label, Pastille, T } from '../base';
import { disposerSieges, RAPPORT, tracesParCouleur } from '../disposition';
import { plusProche } from '../zoom/geometrie';
import { ZoomPan } from '../zoom/ZoomPan';

export interface SiegeHemicycle {
  /** Couleur du point : position de vote, ou couleur du groupe. */
  couleur: string;
  groupe: GroupeRef | null;
  /** Personne de ce siège, seulement si le contrat la donne. */
  personne?: { id: string; nom: string } | null;
  /** Ce que dit le siège (« Pour », « Absent »), affiché quand il est touché. */
  detail?: string;
}

interface Props {
  sieges: SiegeHemicycle[];
  /** Rangs du dessin (11 à l'AN, 9 au Sénat). */
  rangs?: number;
  /** Taille relative des points (1 par défaut). */
  taillePoint?: number;
  largeurMax?: number;
  /** Ce que montre l'hémicycle, pour les lecteurs d'écran. */
  libelle: string;
  /** Lignes affichées sous un groupe touché (sièges, position…). */
  infoGroupe?: (groupe: GroupeRef) => string;
  onPersonne?: (id: string) => void;
}

export type Choix = { type: 'siege'; index: number } | { type: 'groupe'; id: string } | null;

/**
 * Ce que désigne un toucher en (x, y) (unités du dessin) : le siège d'une personne, sinon son
 * groupe (un second toucher sur le même groupe le relâche), sinon rien. Zone de toucher : au moins
 * 22 px à l'écran quel que soit le zoom.
 */
export function choisir(
  sieges: SiegeHemicycle[],
  points: readonly { x: number; y: number }[],
  rayon: number,
  x: number,
  y: number,
  echelle: number,
  groupeChoisi: string | null,
): Choix {
  const i = plusProche(points, x, y, Math.max(rayon * 1.8, 11 / echelle));
  if (i < 0) return null;
  const s = sieges[i];
  if (s.personne) return { type: 'siege', index: i };
  if (s.groupe) return groupeChoisi === s.groupe.id ? null : { type: 'groupe', id: s.groupe.id };
  return { type: 'siege', index: i };
}

export const HemicycleZoom = memo(function HemicycleZoom({ sieges, rangs = 11, taillePoint = 1, largeurMax = 560, libelle, infoGroupe, onPersonne }: Props) {
  const p = usePalette();
  const [largeurDispo, setLargeurDispo] = useState(0);
  const [choix, setChoix] = useState<Choix>(null);
  const [liste, setListe] = useState(false);
  const avecPersonnes = useMemo(() => sieges.some((s) => s.personne), [sieges]);
  const largeur = Math.min(largeurDispo, largeurMax);
  const hauteur = largeur * RAPPORT;

  const { points, rayon } = useMemo(() => {
    const d = disposerSieges(sieges.length, Math.max(1, largeur), rangs);
    return { points: d.sieges, rayon: d.rayonPoint * taillePoint };
  }, [sieges.length, largeur, rangs, taillePoint]);

  const groupeChoisi = choix?.type === 'groupe' ? choix.id : null;
  const traces = useMemo(() => {
    const couleurs = sieges.map((s) => s.couleur);
    if (!groupeChoisi) return [{ opacite: 1, traces: tracesParCouleur(points, couleurs, rayon) }];
    const dans = (i: number) => sieges[i].groupe?.id === groupeChoisi;
    const masque = (garder: boolean) => couleurs.map((c, i) => (dans(i) === garder ? c : (undefined as unknown as string)));
    return [
      { opacite: ESTOMPE, traces: tracesParCouleur(points, masque(false), rayon) },
      { opacite: 1, traces: tracesParCouleur(points, masque(true), rayon) },
    ];
  }, [sieges, points, rayon, groupeChoisi]);

  const toucher = useCallback(
    (x: number, y: number, echelle: number) => setChoix(choisir(sieges, points, rayon, x, y, echelle, groupeChoisi)),
    [points, rayon, sieges, groupeChoisi],
  );

  const siege = choix?.type === 'siege' ? sieges[choix.index] : null;
  const groupe = groupeChoisi ? sieges.find((s) => s.groupe?.id === groupeChoisi)?.groupe ?? null : null;
  const marque = choix?.type === 'siege' ? points[choix.index] : null;

  return (
    <View style={{ width: '100%', gap: space[2] }}>
      <View onLayout={(e) => setLargeurDispo(e.nativeEvent.layout.width)} style={styles.centre}>
        {largeur > 0 && (
          <ZoomPan largeur={largeur} hauteur={hauteur} libelle={libelle} onTap={toucher}>
            <Svg width={largeur} height={hauteur}>
              {traces.map((couche, n) => (
                <G key={n} opacity={couche.opacite}>
                  {couche.traces.map((t) => (
                    <Path key={t.couleur} d={t.d} fill={t.couleur} />
                  ))}
                </G>
              ))}
              {marque && <Circle cx={marque.x} cy={marque.y} r={rayon * 2} fill="none" stroke={p.ink} strokeWidth={Math.max(0.6, rayon / 3)} />}
            </Svg>
          </ZoomPan>
        )}
      </View>
      {siege && (
        <View style={[styles.fiche, { borderColor: p.line, backgroundColor: p.surfaceRaised }]} accessibilityLiveRegion="polite">
          <View style={styles.ligne}>
            <Pastille couleur={siege.groupe?.couleur ?? siege.couleur} />
            <T variant="heading" style={{ flex: 1 }}>
              {siege.personne?.nom ?? siege.groupe?.libelle ?? 'Siège sans groupe'}
            </T>
            {siege.detail && <Label ton="ink">{siege.detail}</Label>}
          </View>
          {siege.personne && siege.groupe && <T variant="caption" ton="inkMuted">{siege.groupe.libelle}</T>}
          {siege.personne && onPersonne && <Action onPress={() => onPersonne(siege.personne!.id)}>{`Voir la fiche de ${siege.personne.nom} →`}</Action>}
        </View>
      )}
      {groupe && (
        <View style={[styles.fiche, { borderColor: p.line, backgroundColor: p.surfaceRaised }]} accessibilityLiveRegion="polite">
          <View style={styles.ligne}>
            <Pastille couleur={groupe.couleur} />
            <T variant="heading" style={{ flex: 1 }}>
              {groupe.libelle}
            </T>
          </View>
          {infoGroupe && <T variant="caption" ton="inkMuted">{infoGroupe(groupe)}</T>}
          <Action onPress={() => setChoix(null)}>Tout l’hémicycle</Action>
        </View>
      )}
      <T variant="caption" ton="inkMuted">
        {avecPersonnes
          ? 'Touchez un siège pour voir qui y siège. Zoom : molette, pincement ou double tap.'
          : 'Touchez un siège pour voir son groupe. Zoom : molette, pincement ou double tap.'}
      </T>
      {avecPersonnes && (
        <BoutonSecondaire onPress={() => setListe((l) => !l)}>
          {liste ? 'Masquer la liste des sièges' : 'Liste des sièges, groupe par groupe'}
        </BoutonSecondaire>
      )}
      {liste && <ListeSieges sieges={sieges} onPersonne={onPersonne} />}
    </View>
  );
});

/** Les mêmes sièges en liste, groupe par groupe : l'équivalent de l'hémicycle pour un lecteur d'écran. */
function ListeSieges({ sieges, onPersonne }: { sieges: SiegeHemicycle[]; onPersonne?: (id: string) => void }) {
  const groupes = useMemo(() => {
    const parGroupe = new Map<string, { groupe: GroupeRef | null; sieges: SiegeHemicycle[] }>();
    for (const s of sieges) {
      const cle = s.groupe?.id ?? '';
      (parGroupe.get(cle) ?? parGroupe.set(cle, { groupe: s.groupe, sieges: [] }).get(cle)!).sieges.push(s);
    }
    return [...parGroupe.values()];
  }, [sieges]);
  return (
    <View style={{ gap: space[3] }}>
      {groupes.map((g) => (
        <View key={g.groupe?.id ?? 'sans'} style={{ gap: space[1] }}>
          <View style={styles.ligne}>
            {g.groupe && <Pastille couleur={g.groupe.couleur} />}
            <T variant="heading" accessibilityRole="header">{`${g.groupe?.libelle ?? 'Sans groupe'} · ${g.sieges.length}`}</T>
          </View>
          {g.sieges.map((s, i) =>
            s.personne && onPersonne ? (
              <Action key={s.personne.id} onPress={() => onPersonne(s.personne!.id)}>
                {`${s.personne.nom}${s.detail ? ` · ${s.detail}` : ''}`}
              </Action>
            ) : (
              <T key={s.personne?.id ?? i} variant="caption">{`${s.personne?.nom ?? 'Siège'}${s.detail ? ` · ${s.detail}` : ''}`}</T>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** Libellé lisible d'un hémicycle : ses groupes et leur nombre de sièges, de gauche à droite. */
export function libelleHemicycle(sieges: SiegeHemicycle[], debut: string): string {
  const parGroupe = new Map<string, { libelle: string; n: number }>();
  for (const s of sieges) {
    const cle = s.groupe?.id ?? '';
    const g = parGroupe.get(cle) ?? parGroupe.set(cle, { libelle: s.groupe?.libelle ?? 'sans groupe', n: 0 }).get(cle)!;
    g.n++;
  }
  return `${debut} : ${[...parGroupe.values()].map((g) => `${g.libelle} ${g.n}`).join(', ')}`;
}

const styles = StyleSheet.create({
  centre: { width: '100%', alignItems: 'center' },
  fiche: { gap: space[1], padding: space[3], borderWidth: 1, borderRadius: radius.md },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
