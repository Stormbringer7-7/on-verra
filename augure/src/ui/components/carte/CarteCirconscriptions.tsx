// Carte d'un scrutin de l'Assemblée, député par député : une circonscription colorée par la position
// de son député (pour, contre, abstention, non-votant, absent, vacante), les départements tracés
// par-dessus pour se repérer. Même cadre et même zoom que CarteDepartements (molette, pincement,
// double tap) ; toucher une circonscription montre son député et mène à sa fiche. Une liste par
// département donne la même information sans la carte. Les circonscriptions sans contour officiel
// (Nouvelle-Calédonie, Polynésie : pas de découpage publié par l’INSEE) n’y
// sont qu’en liste ; les Français établis hors de France ne sont pas sur la carte.

import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect, Text as TexteSvg } from 'react-native-svg';

import type { Position, ValeurCirconscription } from '@/core';
import { couleurVote, usePalette } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/tokens';
import { radius, space } from '../../theme/tokens';
import { Action, Label, Pastille, T } from '../base';
import { ZoomPan } from '../zoom/ZoomPan';
import { CIRCONSCRIPTIONS, SOURCE_CIRCONSCRIPTIONS } from './circonscriptions';
import { CADRE_CARTE, ENCARTS } from './departements';
import { contourSous, preparer, TERRITOIRES } from './geometrie';

/** Les 561 contours, prêts à dessiner (calculés au premier affichage). */
let prets: ReturnType<typeof preparer<(typeof CIRCONSCRIPTIONS)[number]>> | null = null;
const contours = () => (prets ??= preparer(CIRCONSCRIPTIONS));

export type Etat = Position | 'vacante' | 'sans_donnee';

export const LIBELLES_ETAT: Record<Etat, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  non_votant: 'Non-votant',
  absent: 'Absent (pas de vote publié)',
  vacante: 'Siège vacant',
  sans_donnee: 'Pas de donnée',
};

const ORDRE: Etat[] = ['pour', 'contre', 'abstention', 'non_votant', 'absent', 'vacante', 'sans_donnee'];

/** Couleur d'un état : celles des votes (hémicycle), puis des neutres distincts en clarté. */
export function couleurEtat(p: Palette, e: Etat): string {
  if (e === 'pour' || e === 'contre' || e === 'abstention') return couleurVote(p, e);
  if (e === 'non_votant') return p.lineStrong;
  if (e === 'absent') return p.line;
  if (e === 'vacante') return p.surfaceSunken;
  return p.surfaceRaised;
}

export const etatDe = (v: ValeurCirconscription | undefined): Etat => (!v ? 'sans_donnee' : !v.depute ? 'vacante' : (v.position ?? 'absent'));

const libelleCirco = (numero: number) => `${numero}${numero === 1 ? 're' : 'e'} circ.`;

interface Props {
  circonscriptions: ValeurCirconscription[];
  onPersonne?: (id: string) => void;
  onDepartement?: (code: string) => void;
  largeurMax?: number;
}

export const CarteCirconscriptions = memo(function CarteCirconscriptions({ circonscriptions, onPersonne, onDepartement, largeurMax = 720 }: Props) {
  const p = usePalette();
  const [largeurDispo, setLargeurDispo] = useState(0);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [liste, setListe] = useState(false);
  const largeur = Math.min(largeurDispo, largeurMax);
  const k = largeur / CADRE_CARTE.largeur;
  const hauteur = CADRE_CARTE.hauteur * k;

  const parCode = useMemo(() => new Map(circonscriptions.map((c) => [c.circonscription.code, c])), [circonscriptions]);
  const dessinees = contours();
  const sansContour = useMemo(() => {
    const codes = new Set(CIRCONSCRIPTIONS.map((c) => c.code));
    return circonscriptions.filter((c) => !codes.has(c.circonscription.code));
  }, [circonscriptions]);
  const comptes = useMemo(() => {
    const n = new Map<Etat, number>();
    for (const c of circonscriptions) n.set(etatDe(c), (n.get(etatDe(c)) ?? 0) + 1);
    const sansDonnee = CIRCONSCRIPTIONS.filter((c) => !parCode.has(c.code)).length;
    if (sansDonnee) n.set('sans_donnee', sansDonnee);
    return n;
  }, [circonscriptions, parCode]);

  const toucher = (x: number, y: number, z: number) => setChoisie(contourSous(dessinees, x / k, y / k, 8 / (z * k)));

  const valeur = choisie ? parCode.get(choisie) : undefined;
  const contour = choisie ? dessinees.find((c) => c.code === choisie) : undefined;
  const nomDepartement = (code: string) => TERRITOIRES.find((t) => t.code === code)?.nom ?? code;
  const libelle = `Carte du vote par circonscription : ${ORDRE.filter((e) => comptes.get(e))
    .map((e) => `${comptes.get(e)} ${LIBELLES_ETAT[e].toLowerCase()}`)
    .join(', ')}.`;

  return (
    <View style={{ width: '100%', gap: space[2] }}>
      <View onLayout={(e) => setLargeurDispo(e.nativeEvent.layout.width)} style={styles.centre}>
        {largeur > 0 && (
          <ZoomPan largeur={largeur} hauteur={hauteur} max={16} libelle={libelle} onTap={toucher}>
            <Svg width={largeur} height={hauteur} viewBox={`0 0 ${CADRE_CARTE.largeur} ${CADRE_CARTE.hauteur}`}>
              {ENCARTS.map((c) => (
                <G key={c.code}>
                  <Rect x={c.x} y={c.y} width={c.largeur} height={c.hauteur} fill="none" stroke={p.line} strokeWidth={1} />
                  <TexteSvg x={c.x + c.largeur / 2} y={c.y + c.hauteur + 12} fill={p.inkMuted} fontSize={10} textAnchor="middle">
                    {nomDepartement(c.code)}
                  </TexteSvg>
                </G>
              ))}
              {dessinees.map((c) => (
                <Path
                  key={c.code}
                  d={c.d}
                  fill={couleurEtat(p, etatDe(parCode.get(c.code)))}
                  stroke={c.code === choisie ? p.ink : p.surface}
                  strokeWidth={c.code === choisie ? 1.2 : 0.25}
                />
              ))}
              {/* Départements par-dessus, pour se repérer. */}
              {TERRITOIRES.map((t) => (
                <Path key={t.code} d={t.d} fill="none" stroke={p.inkMuted} strokeWidth={0.6} />
              ))}
            </Svg>
          </ZoomPan>
        )}
      </View>

      {choisie && contour && (
        <View style={[styles.fiche, { borderColor: p.line, backgroundColor: p.surfaceRaised }]} accessibilityLiveRegion="polite">
          <View style={styles.ligne}>
            <Pastille couleur={couleurEtat(p, etatDe(valeur))} />
            <T variant="heading" style={{ flex: 1 }}>{`${nomDepartement(contour.departement)}, ${libelleCirco(contour.numero)}`}</T>
            <Label ton="ink">{LIBELLES_ETAT[etatDe(valeur)]}</Label>
          </View>
          {valeur?.depute && (
            <View style={styles.ligne}>
              {valeur.depute.groupe && <Pastille couleur={valeur.depute.groupe.couleur} taille={8} />}
              <T style={{ flex: 1 }}>{`${valeur.depute.nom}${valeur.depute.groupe ? ` · ${valeur.depute.groupe.abrege}` : ''}`}</T>
            </View>
          )}
          {valeur?.depute && onPersonne && <Action onPress={() => onPersonne(valeur.depute!.id)}>{`Fiche de ${valeur.depute.nom} →`}</Action>}
          {onDepartement && <Action onPress={() => onDepartement(contour.departement)}>{`${nomDepartement(contour.departement)} : ses élus →`}</Action>}
        </View>
      )}

      <View style={styles.legende} accessibilityLabel="Légende : position du député">
        <Label>Position du député</Label>
        {ORDRE.filter((e) => comptes.get(e)).map((e) => (
          <View key={e} style={styles.ligne}>
            <Pastille couleur={couleurEtat(p, e)} />
            <T variant="caption" ton="inkMuted">{`${LIBELLES_ETAT[e]} : ${comptes.get(e)}`}</T>
          </View>
        ))}
      </View>

      {sansContour.length > 0 && (
        <View style={styles.legende}>
          <Label>Sans contour dans la source</Label>
          {sansContour.map((c) => (
            <Ligne key={c.circonscription.code} valeur={c} onPersonne={onPersonne} />
          ))}
        </View>
      )}

      <Pressable onPress={() => setListe((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: liste }}>
        <Label ton="signal">{liste ? 'Masquer la liste' : 'Voir la liste des circonscriptions'}</Label>
      </Pressable>
      {liste && (
        <View>
          {circonscriptions.map((c) => (
            <Ligne key={c.circonscription.code} valeur={c} onPersonne={onPersonne} />
          ))}
        </View>
      )}

      <T variant="caption" ton="inkMuted">
        {`Contours : ${SOURCE_CIRCONSCRIPTIONS.licence}. Outre-mer en encarts, à une autre échelle.`}
      </T>
    </View>
  );
});

function Ligne({ valeur, onPersonne }: { valeur: ValeurCirconscription; onPersonne?: (id: string) => void }) {
  const p = usePalette();
  const c = valeur.circonscription;
  const e = etatDe(valeur);
  const texte = `${c.departement.nom}, ${libelleCirco(c.numero)} · ${valeur.depute ? valeur.depute.nom : 'vacante'}`;
  const contenu = (
    <>
      <Pastille couleur={couleurEtat(p, e)} />
      <T style={{ flex: 1 }}>{texte}</T>
      <T variant="data" ton="inkMuted">{LIBELLES_ETAT[e]}</T>
    </>
  );
  if (!valeur.depute || !onPersonne) return <View style={[styles.rangee, { borderBottomColor: p.line }]}>{contenu}</View>;
  const id = valeur.depute.id;
  return (
    <Pressable onPress={() => onPersonne(id)} accessibilityRole="link" accessibilityLabel={`${texte}, ${LIBELLES_ETAT[e]}`} style={[styles.rangee, { borderBottomColor: p.line }]}>
      {contenu}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { width: '100%', alignItems: 'center' },
  fiche: { gap: space[1], padding: space[3], borderWidth: 1, borderRadius: radius.md },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  legende: { gap: space[1] },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
});
