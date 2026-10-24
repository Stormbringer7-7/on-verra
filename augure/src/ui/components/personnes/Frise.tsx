// Onglet « Parcours » de la fiche personne (canevas : « Ses fonctions dans le temps ») : une barre
// par fonction sur une frise d'années, le badge de sa source (AN, SÉNAT, GOUV., RNE) et sa source
// précise. Un mandat RNE dit comment il est rattaché : par la revue humaine, ou pas du tout (fiche
// RNE seule, « selon le RNE »). Puis les mandats locaux en cours.

import { StyleSheet, View } from 'react-native';

import type { EntetePersonne, FonctionDatee } from '@/core';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { Source } from '../commun/Source';
import { Avertissement, Badge, Carte, TitreSection } from './elements';
import { badgeFonction, datesFonction, frise, jour, rattachementFonction } from './regles';

export function Frise({
  fonctions,
  mandatsLocauxEnCours,
  identite,
  aujourdhui,
}: {
  fonctions: FonctionDatee[];
  mandatsLocauxEnCours: FonctionDatee[];
  identite: EntetePersonne['identite'];
  aujourdhui: string;
}) {
  const p = usePalette();
  const { annees, barres } = frise(fonctions, aujourdhui);
  return (
    <View style={{ gap: space[3] }}>
      <TitreSection>Ses fonctions dans le temps</TitreSection>
      <View style={[styles.graduations, { borderBottomColor: p.line }]} aria-hidden>
        {annees.map((a) => (
          <T key={a.annee} variant="caption" ton="inkMuted" style={[styles.annee, { left: `${a.position * 100}%` }]}>
            {String(a.annee)}
          </T>
        ))}
      </View>
      {fonctions.map((f, i) => {
        const rattachement = rattachementFonction(f, identite);
        return (
          <View key={`${f.provenance.idNatif}-${i}`} style={styles.fonction}>
            <View style={styles.titre}>
              <T variant="body" style={{ flex: 1, fontWeight: '600' }}>
                {f.titre}
              </T>
              <Badge>{badgeFonction(f)}</Badge>
            </View>
            <View style={[styles.piste, { backgroundColor: p.surfaceRaised }]} aria-hidden>
              <View
                style={[
                  styles.barre,
                  {
                    left: `${barres[i].gauche * 100}%`,
                    width: `${Math.min(barres[i].largeur, 1 - barres[i].gauche) * 100}%`,
                    backgroundColor: barres[i].enCours ? p.ink : p.lineStrong,
                  },
                ]}
              />
            </View>
            <T variant="caption" ton="inkMuted">
              {datesFonction(f)}
              {f.debut ? ` · depuis le ${jour(f.debut)}` : ''}
              {f.fin ? ` jusqu’au ${jour(f.fin)}` : ''}
            </T>
            {rattachement && (
              <View style={styles.rattachement}>
                <Label couleur={f.rattachement ? p.inkMuted : p.signal}>{rattachement}</Label>
                {f.rattachement && (
                  <T variant="caption" ton="inkMuted">
                    {f.rattachement.motif}
                  </T>
                )}
              </View>
            )}
            <Source provenance={f.provenance} compact />
          </View>
        );
      })}
      {fonctions.length === 0 && <T ton="inkMuted">Aucune fonction publiée.</T>}
      <Avertissement>
        Fonctions publiques documentées par l’Assemblée nationale, le Sénat, le Gouvernement et le Répertoire national des élus.
        Une fonction sans date de fin est en cours. Un mandat du RNE n’est relié à une personne que par une revue humaine.
      </Avertissement>
      {mandatsLocauxEnCours.length > 0 && (
        <Carte>
          <View style={styles.titre}>
            <Label style={{ flex: 1 }}>Mandats locaux en cours</Label>
            <Badge>RNE</Badge>
          </View>
          {mandatsLocauxEnCours.map((m) => (
            <View key={m.provenance.idNatif} style={[styles.local, { borderTopColor: p.line }]}>
              <T variant="heading">{m.titre}</T>
              <T variant="caption" ton="inkMuted">
                {m.debut ? `Depuis le ${jour(m.debut)}` : 'Date de début non publiée'}
                {m.organisation ? ` · ${m.organisation.nom}` : ''}
              </T>
              {m.rattachement && <Label>Rattaché par la revue humaine</Label>}
            </View>
          ))}
        </Carte>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  graduations: { position: 'relative', height: 22, borderBottomWidth: StyleSheet.hairlineWidth },
  annee: { position: 'absolute', top: 0 },
  fonction: { gap: space[1], paddingVertical: 6 },
  titre: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  piste: { position: 'relative', height: 10, borderRadius: radius.sm, overflow: 'hidden' },
  barre: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.sm },
  rattachement: { gap: 2 },
  local: { gap: 2, paddingVertical: space[2], borderTopWidth: StyleSheet.hairlineWidth },
});
