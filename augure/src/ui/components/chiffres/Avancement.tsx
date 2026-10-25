// « Où en sont les textes » (écran Chiffres) : la carte de l'engorgement, une barre par étape (en
// examen, en attente, attente médiane) qui ouvre ses textes, les attentes hors du Parlement avec le
// délai fixé par la Constitution (un dépassement est toujours « à vérifier »), et les limites.

import { Pressable, StyleSheet, View } from 'react-native';

import type { AttenteAdministrative, AvancementDesTextes, FileEtape } from '@/core';
import { useAller } from '../../../navigation';
import { ATTENDUS, acteur, compteFile, largeurFile, libelleFile, medianeFile, situationTexte, texteDelai } from '../../avancement';
import { dateLongue, nombre, pluriel } from '../../format';
import { useLarge } from '../../hooks/miseEnPage';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, Carte, Ligne, T, TitreSection } from '../base';
import { Avertissement, PastilleStatut } from '../fondations';

/** Une file : son nom, sa barre (en examen en `ink`, en attente en `line-strong`), ses comptes. */
function BarreFile({ file: f, max }: { file: FileEtape; max: number }) {
  const p = usePalette();
  const aller = useAller();
  const mediane = medianeFile(f);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${libelleFile(f)}. Voir les textes`}
      onPress={() => aller.textes({ etape: f.etape })}
      style={({ pressed }) => [styles.file, { borderBottomColor: p.line }, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.fileEntete}>
        <T variant="heading" style={styles.fileNom}>
          {f.etape}
        </T>
        <T variant="data" ton="inkSoft">
          {nombre(f.enExamen + f.enAttente)}
        </T>
      </View>
      <View style={[styles.piste, { backgroundColor: p.surfaceSunken }]}>
        <View style={[styles.remplie, { width: `${largeurFile(f, max)}%` }]}>
          {f.enExamen > 0 && <View style={{ flex: f.enExamen, backgroundColor: p.ink }} />}
          {f.enAttente > 0 && <View style={{ flex: f.enAttente, backgroundColor: p.lineStrong }} />}
        </View>
      </View>
      <T variant="small" ton="inkSoft">
        {compteFile(f)}
        {mediane ? ` · ${mediane}` : ''}
      </T>
      {f.plusAncien && (
        <T variant="small" ton="inkMuted" numberOfLines={2}>
          Le plus ancien : {f.plusAncien.dossier.titre}
          {f.plusAncien.jours !== null ? ` (${pluriel(f.plusAncien.jours, 'jour')})` : ''}
        </T>
      )}
    </Pressable>
  );
}

function Repere({ couleur, libelle }: { couleur: 'ink' | 'lineStrong'; libelle: string }) {
  const p = usePalette();
  return (
    <View style={styles.repere}>
      <View style={[styles.repereCarre, { backgroundColor: p[couleur] }]} />
      <T variant="small" ton="inkSoft">
        {libelle}
      </T>
    </View>
  );
}

/** Carte « Où en sont les textes ». */
export function CarteAvancement({ avancement: a }: { avancement: AvancementDesTextes }) {
  const aller = useAller();
  const large = useLarge();
  const max = Math.max(0, ...a.files.map((f) => f.enExamen + f.enAttente));
  return (
    <Carte>
      <T variant="label" ton="inkMuted">
        Lois
      </T>
      <T variant="card">Où en sont les textes</T>
      <View style={styles.chiffre}>
        <T variant={large ? 'dataXL' : 'dataLarge'}>{nombre(a.total)}</T>
        <T ton="inkSoft">
          {a.total > 1 ? 'textes en cours ou en attente' : 'texte en cours ou en attente'}, au {dateLongue(a.dateReference)}
        </T>
      </View>
      <T>Chaque texte est rangé à sa dernière étape : « en examen » si l’étape a commencé, sinon il attend la suite. Touchez une étape pour voir ses textes.</T>
      {a.indetermines > 0 && (
        <T variant="small" ton="inkMuted">
          {pluriel(a.indetermines, 'autre texte', 'autres textes')} : le parcours publié ne permet pas de dire où ils en sont.
        </T>
      )}
      <View style={styles.legende} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Repere couleur="ink" libelle="En examen" />
        <Repere couleur="lineStrong" libelle="Attend la suite" />
      </View>
      <View>{a.files.length ? a.files.map((f) => <BarreFile key={f.etape} file={f} max={max} />) : <T ton="inkMuted">Aucun texte en cours.</T>}</View>
      <Action onPress={() => aller.textes()}>Tous les textes, du plus ancien au plus récent →</Action>
    </Carte>
  );
}

/** Un texte qui attend un acte hors du Parlement : qui, depuis quand, délai, dépassement à vérifier. */
function LigneHorsParlement({ attente: a }: { attente: AttenteAdministrative }) {
  const aller = useAller();
  return (
    <Ligne onPress={() => aller.dossier(a.texte.dossier.id)} accessibilityLabel={`${a.texte.dossier.titre}. ${ATTENDUS[a.attendu]} attendue.`}>
      <View style={styles.hors}>
        <T variant="label" ton="inkMuted">
          {ATTENDUS[a.attendu]} · {acteur(a.qui)}
        </T>
        <T variant="heading">{a.texte.dossier.titre}</T>
        <T variant="small" ton="inkSoft">
          {situationTexte(a.texte)}
        </T>
        <T variant="small" ton="inkSoft">
          {texteDelai(a)}
        </T>
        {a.depassement && (
          <View style={styles.depassement}>
            <PastilleStatut statut="a_verifier" libelle={`Délai dépassé de ${pluriel(a.depassement.jours, 'jour')} : à vérifier`} />
            <T variant="small" ton="inkSoft">
              {a.depassement.motif}. {a.depassement.avertissement}
            </T>
          </View>
        )}
      </View>
    </Ligne>
  );
}

/** Attentes hors du Parlement : décision du Conseil, promulgation, publication au JO. */
export function HorsParlement({ avancement: a }: { avancement: AvancementDesTextes }) {
  const aller = useAller();
  return (
    <View style={styles.section}>
      <TitreSection>Hors du Parlement</TitreSection>
      <T ton="inkSoft">Textes votés qui attendent un acte du Conseil constitutionnel, du Président de la République ou du Gouvernement.</T>
      {a.horsParlement.length ? (
        <View>
          {a.horsParlement.map((h) => (
            <LigneHorsParlement key={h.texte.dossier.id} attente={h} />
          ))}
        </View>
      ) : (
        <T ton="inkMuted">Aucun texte n’attend aujourd’hui un acte hors du Parlement.</T>
      )}
      {a.horsParlement.length > 0 && <Action onPress={() => aller.textes({ horsParlement: true })}>Ces textes, en liste →</Action>}
    </View>
  );
}

/** Ce que ces comptes ne disent pas, tel que l'API le donne. */
export function Limites({ limites }: { limites: string[] }) {
  if (!limites.length) return null;
  return (
    <Avertissement type="info" titre="Ce que ces comptes ne disent pas">
      {limites.map((l) => `• ${l}`).join('\n')}
    </Avertissement>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[3] },
  chiffre: { gap: 2 },
  legende: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  repere: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  repereCarre: { width: 10, height: 10, borderRadius: 2 },
  file: { gap: space[2], minHeight: 64, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  fileEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3] },
  fileNom: { flexShrink: 1 },
  piste: { height: 10, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  remplie: { flexDirection: 'row', gap: 2 },
  hors: { flex: 1, gap: space[1], minWidth: 0 },
  depassement: { gap: space[1], paddingTop: space[1] },
});
