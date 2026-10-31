// Fiche d'un sous-dossier (maquette v3, planche « SousDossier ») : un dossier publié comme événement
// d'un autre (49.3 sur un texte, motion référendaire, prérogatives d'une commission d'enquête). Même
// route que la fiche Dossier, rendu adapté : le lien vers le parent (à son étape), l'en-tête, un mini
// parcours horizontal (chaque étape ouvre l'écran Étape), l'effet sur le dossier parent (la branche
// prise et l'autre, selon le modèle), la carte de la motion qui mène au Scrutin (scrutin du dossier,
// sinon les motions du rattachement : `DossierLie.scrutins` de son parent), les interventions.
// Une issue que rien ne permet de conclure n'est jamais tranchée : « Issue non publiée ».

import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CleCase, FicheDossier } from '@/core';
import { useAller } from '../../../navigation';
import { date } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space } from '../../theme/tokens';
import { Action, Label, T, TitreSection } from '../base';
import { Icone } from '../Icone';
import { Apparition, Appui } from '../mouvement';
import { CarteVoteCle, JaugeCensure, LigneActeur, Marque } from './fiche';
import { effetSousDossier, etapesSousDossier, iconeType, ligneVoteRattache, MAJORITE_CENSURE, motionsRattachees, scrutinMotion, SIEGES_AN } from './parcoursVue';
import { etatDossier } from './presentation';

/** Étape où se tiennent les débats (interventions), sinon la dernière étape faite. */
function etapeDesDebats(f: FicheDossier): CleCase | null {
  const cases = f.parcours?.cases ?? [];
  const debat = cases.find((c) => ['debat', 'seance', 'seance_o', 'seance_1_o'].includes(c.cle) && c.etat !== 'sans_objet');
  return (debat ?? [...cases].reverse().find((c) => c.etat === 'faite'))?.cle ?? null;
}

export function SousDossier({ fiche: f }: { fiche: FicheDossier }) {
  const p = usePalette();
  const aller = useAller();
  const parcours = f.parcours!;
  const parent = parcours.parent!;
  const e = f.entete;
  const etapes = etapesSousDossier(parcours);
  const derniere = [...parcours.cases].reverse().find((c) => c.etat === 'faite' || c.courante);
  const le = derniere ? (derniere.fin ?? derniere.debut) : null;
  const effet = effetSousDossier(f);
  const motion = scrutinMotion(f);
  const rattachees = motion ? [] : motionsRattachees(f);
  const attendMotion = ['responsabilite_gouvernement', 'motion_referendaire'].includes(parcours.modele.cle);
  const debats = etapeDesDebats(f);
  const intervenants = f.acteurs.flatMap((g) => g.acteurs);

  return (
    <View style={styles.pile}>
      <Apparition rang={0}>
        <Appui
          accessibilityRole="link"
          accessibilityLabel={`Rattaché à ${parent.dossier.titre}${parent.etapeLibelle ? `, ${parent.etapeLibelle}` : ''}`}
          onPress={() => (parent.etape ? aller.etape(parent.dossier.id, parent.etape) : aller.dossier(parent.dossier.id))}
          style={[styles.parent, { borderColor: p.line }]}
        >
          <Icone nom="rejoint" couleur={p.inkMuted} taille={18} />
          <View style={{ flex: 1, gap: 1 }}>
            <T variant="caption" ton="inkMuted">Rattaché à</T>
            <T variant="small" style={styles.gras}>{`${parent.dossier.titre}${parent.etapeLibelle ? ` · ${parent.etapeLibelle}` : ''}`}</T>
          </View>
          <T ton="inkMuted">›</T>
        </Appui>
      </Apparition>

      <Apparition rang={1} style={{ gap: 10 }}>
        <View style={styles.ligne}>
          <Icone nom={iconeType(parcours.modele, e.type)} couleur={p.signalHover} taille={16} />
          <T variant="label" couleur={p.signalHover} style={{ flexShrink: 1 }}>{`${e.type} · ${parcours.modele.libelle}`}</T>
        </View>
        <T variant="screen" accessibilityRole="header">{e.titreEnClair ?? e.titre}</T>
        <View style={styles.ligneStatut}>
          <Marque fort>{derniere?.conclusion ?? etatDossier(e.etat)}</Marque>
          <T variant="small" ton="inkSoft">{le ? `le ${date(le)}` : 'le [jj/mm/aaaa]'}</T>
        </View>
      </Apparition>

      <Apparition rang={2}>
        <View style={styles.horizontal} accessibilityLabel={`Parcours : ${etapes.map((s) => s.cas.libelle).join(', ')}`}>
          {etapes.map((s, i) => (
            <Fragment key={s.cas.cle}>
              {i > 0 && <View style={[styles.liaison, { backgroundColor: s.aVenir ? p.lineFaint : p.inkSoft }]} />}
              <Appui
                accessibilityRole="link"
                accessibilityLabel={`Étape ${s.cas.libelle}${s.date ? `, ${s.date}` : ''}`}
                onPress={() => aller.etape(e.id, s.cas.cle)}
                style={styles.etape}
              >
                <View
                  style={[
                    styles.cercle,
                    s.aVenir
                      ? { borderStyle: 'dashed', borderColor: p.lineStrong, backgroundColor: p.surface }
                      : { borderColor: s.cle ? p.signal : p.lineStrong, backgroundColor: p.surfaceRaised },
                  ]}
                >
                  <Icone nom={s.icone} couleur={s.aVenir ? p.inkMuted : p.ink} taille={16} />
                </View>
                <T variant="caption" ton="inkSoft" style={styles.centre}>{s.cas.libelle}</T>
                <T variant="data" ton="inkMuted" style={[styles.centre, { fontSize: 11 }]}>{s.date}</T>
              </Appui>
            </Fragment>
          ))}
        </View>
      </Apparition>

      {effet && (
        <Apparition rang={3} style={{ gap: 10 }}>
          <TitreSection>Effet sur le dossier</TitreSection>
          <View style={[styles.effet, { backgroundColor: p.surfaceRaised }]}>
            {effet.pris ? (
              <View style={styles.ligne}>
                <Icone nom="transmission" couleur={p.signal} taille={18} />
                <T style={[styles.gras, { flex: 1 }]}>{effet.pris}</T>
              </View>
            ) : (
              <T variant="small" ton="inkMuted">Issue non publiée : aucune des deux branches n’est établie.</T>
            )}
            {effet.autres.map((a) => (
              <View key={a} style={styles.ligne}>
                <View style={[styles.tiret, { backgroundColor: p.lineStrong }]} />
                <T couleur={effet.pris ? p.lineStrong : p.inkSoft} style={{ flex: 1 }}>{a}</T>
              </View>
            ))}
          </View>
        </Apparition>
      )}

      {motion ? (
        <Apparition rang={4} style={{ gap: space[1] }}>
          <CarteVoteCle scrutin={motion} />
          {motion.nature === 'motion_censure' && <T variant="caption" ton="inkMuted">Seuls les « pour » sont comptés.</T>}
        </Apparition>
      ) : rattachees.length > 0 ? (
        <Apparition rang={4} style={{ gap: space[1] }}>
          <TitreSection>{rattachees.length > 1 ? 'Les motions' : 'La motion'}</TitreSection>
          {rattachees.map((v) => (
            <Appui
              key={v.id}
              accessibilityRole="link"
              accessibilityLabel={ligneVoteRattache(v)}
              onPress={() => aller.scrutin(v.id)}
              style={[styles.motion, { borderColor: p.line }]}
            >
              <T variant="caption" ton="inkMuted">{`AN · ${date(v.date)}`}</T>
              <T variant="small" style={styles.gras}>{ligneVoteRattache(v)}</T>
              {v.nature === 'motion_censure' && <JaugeCensure pour={v.pour} />}
            </Appui>
          ))}
          {rattachees.some((v) => v.nature === 'motion_censure') && (
            <T variant="caption" ton="inkMuted">
              {`Seuls les « pour » sont comptés. ${MAJORITE_CENSURE} : majorité absolue des ${SIEGES_AN} sièges (règle de l’article 49) ; le nombre requis n’est pas publié dans les données.`}
            </T>
          )}
        </Apparition>
      ) : (
        attendMotion && (
          <View style={[styles.absent, { borderColor: p.lineStrong }]}>
            <T variant="small" ton="inkMuted">Scrutin de la motion : non publié dans les données chargées.</T>
          </View>
        )
      )}

      <View style={{ gap: space[1] }}>
        <TitreSection>Interventions</TitreSection>
        {intervenants.length === 0 && <T ton="inkMuted">Aucun orateur publié pour ce dossier.</T>}
        {intervenants.map((a, i) => (
          <LigneActeur key={i} acteur={a} />
        ))}
        {debats && (
          <Action onPress={() => aller.discussions({ type: 'etape', dossier: e.id, cle: debats })}>Les interventions, verbatim →</Action>
        )}
        <Label>Extraits verbatim : dans le compte rendu de chaque étape.</Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pile: { gap: 18 },
  gras: { fontFamily: fonts.sansSemiBold },
  parent: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.lg, borderWidth: 1 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  ligneStatut: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
  horizontal: { flexDirection: 'row', alignItems: 'flex-start' },
  liaison: { flex: 1, height: 2, marginTop: 15, minWidth: 8 },
  etape: { width: 72, alignItems: 'center', gap: 6 },
  cercle: { width: 32, height: 32, borderRadius: radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  centre: { textAlign: 'center', fontSize: 12, lineHeight: 15 },
  effet: { gap: space[2], padding: space[3], borderRadius: radius.lg },
  tiret: { width: 18, height: 1.5, marginHorizontal: 0 },
  motion: { gap: 6, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1 },
  absent: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: space[3], paddingHorizontal: 14 },
});
