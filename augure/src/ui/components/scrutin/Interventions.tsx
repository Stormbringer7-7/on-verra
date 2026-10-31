// Interventions autour d'un vote (planches « Scrutin », « Vote à main levée », « Amendement ») :
// le nombre publié, les premiers extraits verbatim (orateur, couleur de son groupe, compte rendu),
// puis le lien vers toute la discussion. Rien du tout quand il n'y a aucune intervention : la
// section n'apparaît que lorsqu'elle existe.
// `InterventionsScrutin` : celles que la fiche du scrutin relie au vote (`FicheScrutin.interventions`) :
// sur l'amendement mis aux voix, ou « de la séance sur ce texte » (même étape, même séance, le jour
// du vote), jamais attribuées au vote lui-même ; sans lien sûr, « aucune intervention reliée ».
// `InterventionsAmendement` : repli pour une fiche de scrutin antérieure à ce champ, lues sur la
// fiche de l'amendement.

import { StyleSheet, View } from 'react-native';

import { ConsulterAmendement, type InterventionExtrait, type InterventionsDuScrutin } from '@/core';
import { useAller } from '../../../navigation';
import { useCommand } from '../../hooks/core';
import { space } from '../../theme/tokens';
import { Action, T } from '../base';
import { ExtraitVue } from '../dossiers/elements';
import { Apparition } from '../mouvement';

export function Interventions({
  titre = 'Interventions',
  extraits,
  total,
  amendement,
  max = 3,
}: {
  titre?: string;
  extraits: InterventionExtrait[];
  total: number;
  /** Amendement discuté : le lien mène à toutes ses interventions. */
  amendement?: string;
  max?: number;
}) {
  const aller = useAller();
  if (total === 0 && extraits.length === 0) return null;
  const n = Math.max(total, extraits.length);
  return (
    <View style={styles.racine}>
      <View style={styles.entete}>
        <T variant="section" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {titre}
        </T>
        <T variant="data" ton="inkMuted">{`${n}`}</T>
      </View>
      {extraits.slice(0, max).map((e, i) => (
        <Apparition key={e.id} rang={i}>
          <ExtraitVue extrait={e} />
        </Apparition>
      ))}
      {amendement && n > 0 && (
        <Action onPress={() => aller.discussions({ type: 'amendement', id: amendement })}>
          {n > 1 ? `Les ${n} interventions →` : 'L’intervention en entier →'}
        </Action>
      )}
    </View>
  );
}

/**
 * Interventions reliées à un scrutin par la fiche : celles sur l'amendement voté (lien vers toutes),
 * ou celles de la séance sur ce texte (lien vers toute la séance quand elle est unique). Sans lien
 * sûr ou sans intervention : la section le dit.
 */
export function InterventionsScrutin({ interventions: d, amendement, max = 3 }: { interventions: InterventionsDuScrutin | null; amendement: string | null; max?: number }) {
  const aller = useAller();
  const seance = d?.portee === 'seance';
  const titre = seance ? 'Interventions de la séance sur ce texte' : 'Interventions';
  if (!d || (d.total === 0 && d.extraits.length === 0)) {
    return (
      <View style={styles.racine}>
        <T variant="section" accessibilityRole="header">
          Interventions
        </T>
        <T ton="inkMuted">Aucune intervention reliée à ce vote.</T>
      </View>
    );
  }
  const n = Math.max(d.total, d.extraits.length);
  return (
    <View style={styles.racine}>
      <View style={styles.entete}>
        <T variant="section" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {titre}
        </T>
        <T variant="data" ton="inkMuted">{`${n}`}</T>
      </View>
      {seance && (
        <T variant="caption" ton="inkMuted">
          Prises de parole sur ce texte dans la séance du vote, le même jour : aucune n’est rattachée au vote lui-même.
        </T>
      )}
      {d.extraits.slice(0, max).map((e, i) => (
        <Apparition key={e.id} rang={i}>
          <ExtraitVue extrait={e} />
        </Apparition>
      ))}
      {d.portee === 'amendement' && amendement && (
        <Action onPress={() => aller.discussions({ type: 'amendement', id: amendement })}>
          {n > 1 ? `Les ${n} interventions →` : 'L’intervention en entier →'}
        </Action>
      )}
      {seance && d.reunion && <Action onPress={() => aller.discussions({ type: 'reunion', id: d.reunion! })}>Toute la séance →</Action>}
    </View>
  );
}

/** Interventions d'un scrutin sur un amendement (fiche de l'amendement) ; rien tant qu'elles ne sont pas là. */
export function InterventionsAmendement({ id }: { id: string }) {
  const fiche = useCommand(ConsulterAmendement({ id }));
  if (fiche.statut === 'erreur') return <T variant="caption" ton="inkMuted">Interventions : fiche de l’amendement indisponible pour l’instant.</T>;
  if (!fiche.donnees) return null;
  const d = fiche.donnees.discussions;
  return <Interventions extraits={d.extraits} total={d.total} amendement={id} />;
}

const styles = StyleSheet.create({
  racine: { gap: space[1] },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: space[1] },
});
