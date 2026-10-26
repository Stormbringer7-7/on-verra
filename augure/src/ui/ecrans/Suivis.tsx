// Mes suivis (canevas v4, « Mes suivis ») : les lois et les élus suivis, gardés sur l'appareil, et
// « Ce qui a bougé » depuis 30 jours (query `ConsulterSuivis`, sans état côté serveur). « Nouveau » :
// depuis la dernière ouverture de cet écran. Pas d'alertes : rien ne doit passer par un serveur.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConsulterSuivis, type EvenementSuivi, type Suivis as SuivisDonnees } from '@/core';
import { useAller } from '../../navigation';
import { Action, Carte, Label, Ligne, Pastille, T, TitreEcran, TitreSection } from '../components/base';
import { BarreCompacte } from '../components/commun/BarreParcours';
import { Requete } from '../components/dossiers/blocs';
import { Colonnes, Ecran } from '../components/Ecran';
import { dateLongue } from '../format';
import { useCommand } from '../hooks/core';
import { useSuivis } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

/** Fenêtre de « Ce qui a bougé » : les 30 derniers jours. */
export const FENETRE_JOURS = 30;

export const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function joursAvant(jourIso: string, n: number): string {
  const d = new Date(`${jourIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Phrase d'un événement : ce qui est publié, jamais une interprétation. */
export function phraseEvenement(e: EvenementSuivi): { qui: string; quoi: string } {
  if (e.type === 'acte') return { qui: e.dossier.titre, quoi: e.libelle };
  const sort = e.scrutin.sort ? ` (${e.scrutin.sort})` : '';
  return { qui: e.personne.nom, quoi: `A voté à l’inverse de son groupe : ${e.scrutin.intitule}${sort}` };
}

export function Suivis() {
  const suivis = useSuivis();
  // « Nouveau » : depuis la dernière ouverture ; l'ouverture d'aujourd'hui est notée une fois l'écran affiché.
  const [vuAvant] = useState(suivis.vuLe);
  const [jourJ] = useState(aujourdhui);
  const { marquerVu } = suivis;
  useEffect(() => marquerVu(jourJ), [marquerVu, jourJ]);

  const vide = suivis.dossiers.length === 0 && suivis.personnes.length === 0;
  const resultat = useCommand(
    vide
      ? null
      : ConsulterSuivis({ dossiers: suivis.dossiers.map((d) => d.id), personnes: suivis.personnes.map((p) => p.id), depuis: joursAvant(jourJ, FENETRE_JOURS) }),
  );
  const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`;

  return (
    <Ecran titre="Mes suivis">
      <View style={styles.entete}>
        <TitreEcran>Mes suivis</TitreEcran>
        <T ton="inkSoft">
          {vide
            ? 'Vous ne suivez encore rien. Ces choix restent sur votre appareil.'
            : `${n(suivis.dossiers.length, 'loi', 'lois')} et ${n(suivis.personnes.length, 'élu', 'élus')} suivis. Ces choix restent sur votre appareil.`}
        </T>
      </View>
      {vide ? (
        <AucunSuivi />
      ) : (
        <Requete resultat={resultat}>{(s) => <ContenuSuivis suivis={s} vuAvant={vuAvant} />}</Requete>
      )}
    </Ecran>
  );
}

function AucunSuivi() {
  const aller = useAller();
  return (
    <Carte>
      <T>Touchez « Suivre » sur la fiche d’une loi ou d’un élu : ce qui bouge s’affichera ici.</T>
      <Action onPress={() => aller.dossiers()}>Choisir une loi →</Action>
      <Action onPress={() => aller.personnes()}>Choisir un élu →</Action>
    </Carte>
  );
}

export function ContenuSuivis({ suivis, vuAvant }: { suivis: SuivisDonnees; vuAvant: string | null }) {
  const aller = useAller();
  const p = usePalette();
  const ouvrir = (e: EvenementSuivi) => (e.type === 'acte' ? (e.cle ? aller.etape(e.dossier.id, e.cle) : aller.dossier(e.dossier.id)) : aller.scrutin(e.scrutin.id));

  const principale = (
    <View style={styles.section}>
      <TitreSection>Ce qui a bougé</TitreSection>
      {suivis.evenements.length === 0 ? (
        <T ton="inkSoft">Rien de publié depuis {FENETRE_JOURS} jours sur ce que vous suivez.</T>
      ) : (
        <View accessibilityRole="list">
          {suivis.evenements.map((e, i) => {
            const { qui, quoi } = phraseEvenement(e);
            const nouveau = vuAvant !== null && e.date > vuAvant;
            return (
              <Pressable
                key={`${e.type}-${e.date}-${i}`}
                accessibilityRole="link"
                accessibilityLabel={`${nouveau ? 'Nouveau, ' : ''}${dateLongue(e.date)}, ${qui} : ${quoi}`}
                onPress={() => ouvrir(e)}
                style={[styles.evenement, { borderBottomColor: p.line }]}
              >
                <View style={styles.evenementTete}>
                  {nouveau && (
                    <View style={[styles.nouveau, { backgroundColor: p.signal }]}>
                      <T variant="caption" couleur={p.signalInk}>
                        Nouveau
                      </T>
                    </View>
                  )}
                  <T variant="small" ton="inkMuted">
                    {dateLongue(e.date)}
                  </T>
                </View>
                <T variant="heading">{qui}</T>
                <T ton="inkSoft">{quoi}</T>
              </Pressable>
            );
          })}
        </View>
      )}
      {suivis.inconnus.length > 0 && (
        <T variant="small" ton="inkMuted">
          {suivis.inconnus.length > 1 ? `${suivis.inconnus.length} suivis ne sont plus` : 'Un suivi n’est plus'} dans nos données (retiré de la
          source ou fusionné).
        </T>
      )}
      {suivis.limites.map((l) => (
        <T key={l} variant="small" ton="inkMuted">
          {l}
        </T>
      ))}
    </View>
  );

  const laterale = (
    <>
      <View style={styles.section}>
        <T variant="card" accessibilityRole="header">
          Lois suivies
        </T>
        {suivis.dossiers.map((d) => (
          <Pressable key={d.id} accessibilityRole="link" onPress={() => aller.dossier(d.id)} style={[styles.loi, { backgroundColor: p.surfaceRaised }]}>
            <T variant="heading">{d.titre}</T>
            {d.barre.length > 0 && <BarreCompacte cases={d.barre} />}
            <T variant="small" ton="inkSoft">
              {d.etapeCourante?.libelle ?? d.dernierEvenement?.libelle ?? 'Étape non connue'}
              {d.prochaineEcheance ? ` · prochaine échéance le ${dateLongue(d.prochaineEcheance.date)}` : ''}
            </T>
          </Pressable>
        ))}
        <Action onPress={() => aller.dossiers()}>Suivre une autre loi →</Action>
      </View>
      <View style={styles.section}>
        <T variant="card" accessibilityRole="header">
          Élus suivis
        </T>
        {suivis.personnes.map((e) => {
          const groupe = e.enCours.find((f) => f.groupe)?.groupe ?? null;
          return (
            <Ligne key={e.id} onPress={() => aller.personne(e.id)} accessibilityLabel={e.nom}>
              {groupe ? <Pastille couleur={groupe.couleur} /> : <Pastille couleur={p.lineStrong} creuse />}
              <View style={styles.elu}>
                <T variant="heading">{e.nom}</T>
                <Label>{e.enCours.map((f) => f.libelle).join(' · ') || 'Sans fonction en cours'}</Label>
              </View>
            </Ligne>
          );
        })}
        <Action onPress={() => aller.personnes()}>Suivre un autre élu →</Action>
      </View>
    </>
  );

  return <Colonnes principale={principale} laterale={laterale} />;
}

const styles = StyleSheet.create({
  entete: { gap: space[2] },
  section: { gap: space[4] },
  evenement: { gap: 6, paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  evenementTete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nouveau: { borderRadius: radius.full, paddingHorizontal: space[2], minHeight: 22, justifyContent: 'center' },
  loi: { gap: 10, padding: space[4], borderRadius: radius.lg },
  elu: { flex: 1, gap: space[1] },
});
