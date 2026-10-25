// Une institution (canevas : artboard « Institutions ») : Assemblée et Sénat par groupe
// (hémicycle, couleurs officielles des groupes), Gouvernement (membres, gouvernements de la
// législature, textes déposés), Conseil constitutionnel (saisines en cours, décisions reliées au
// dossier). Partagée par l'onglet Institutions et la page empilée Institution.

import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { Institution } from '@/core';
import { useAller } from '@/navigation';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, Label, Pastille, T } from '../base';
import { Source } from '../commun/Source';
import { disposerSieges, RAPPORT, tracesParCouleur } from '../disposition';
import { Avertissement, Carte, Colonnes, Ligne, TitreSection } from './elements';
import { couleursSieges, jour, moisCourt, nombre } from './regles';

type Chambre = Extract<Institution, { type: 'an' | 'senat' }>;
type Gouvernement = Extract<Institution, { type: 'gouvernement' }>;
type Conseil = Extract<Institution, { type: 'cc' }>;

export function InstitutionVue({ institution }: { institution: Institution }) {
  switch (institution.type) {
    case 'an':
    case 'senat':
      return <VueChambre chambre={institution} />;
    case 'gouvernement':
      return <VueGouvernement gouvernement={institution} />;
    case 'cc':
      return <VueConseil conseil={institution} />;
  }
}

// ---------- Assemblée, Sénat ----------

function Hemicycle({ chambre }: { chambre: Chambre }) {
  const p = usePalette();
  const { width } = useWindowDimensions();
  const largeur = Math.min(Math.max(width - 2 * space[4] - 2, 240), 520);
  const traces = useMemo(() => {
    const couleurs = couleursSieges(chambre, p.lineStrong);
    const { sieges, rayonPoint } = disposerSieges(couleurs.length, largeur, chambre.type === 'an' ? 11 : 9);
    return tracesParCouleur(sieges, couleurs, rayonPoint * (chambre.type === 'an' ? 1 : 1.25));
  }, [chambre, p.lineStrong, largeur]);
  const libelle = `Hémicycle de ${chambre.sieges} sièges par groupe : ${[...chambre.groupes]
    .sort((a, b) => a.rang - b.rang)
    .map((g) => `${g.groupe.libelle} ${g.sieges}`)
    .join(', ')}${chambre.sansGroupe ? `, sans groupe ${chambre.sansGroupe}` : ''}`;
  return (
    <View style={[styles.hemicycle, { borderColor: p.line, backgroundColor: p.surfaceSunken }]}>
      <Svg width={largeur} height={largeur * RAPPORT} role="img" aria-label={libelle} accessibilityLabel={libelle}>
        {traces.map((t) => (
          <Path key={t.couleur} d={t.d} fill={t.couleur} />
        ))}
      </Svg>
    </View>
  );
}

function VueChambre({ chambre }: { chambre: Chambre }) {
  const p = usePalette();
  const aller = useAller();
  const an = chambre.type === 'an';
  const sousTitre = `${nombre(chambre.sieges)} sièges${chambre.legislature ? ` · ${chambre.legislature}e législature` : ''} · composition au ${jour(chambre.date)}`;
  return (
    <Colonnes
      principal={
        <View style={{ gap: space[3] }}>
          <Label>{sousTitre}</Label>
          <Hemicycle chambre={chambre} />
          <T variant="caption" ton="inkMuted">
            Chaque point est un siège, coloré selon le groupe. Les couleurs de groupe sont des données publiées, pas un jugement.
          </T>
        </View>
      }
      cote={
        <View>
          {[...chambre.groupes]
            .sort((a, b) => a.rang - b.rang)
            .map((g) => (
              <Ligne key={g.groupe.id}>
                <Pastille couleur={g.groupe.couleur} />
                <T style={{ flex: 1 }}>{g.groupe.libelle}</T>
                <T variant="data" ton="inkMuted">
                  {nombre(g.sieges)}
                </T>
              </Ligne>
            ))}
          {chambre.sansGroupe > 0 && (
            <Ligne>
              <Pastille couleur={p.lineStrong} creuse />
              <T style={{ flex: 1 }}>Sans groupe</T>
              <T variant="data" ton="inkMuted">
                {nombre(chambre.sansGroupe)}
              </T>
            </Ligne>
          )}
          <Action onPress={() => aller.onglet('Personnes', { vue: 'annuaire', role: an ? 'depute' : 'senateur' })}>{`Les ${nombre(chambre.sieges)} ${an ? 'députés' : 'sénateurs'} →`}</Action>
          <Action onPress={() => aller.onglet('Dossiers')}>Dossiers en cours →</Action>
        </View>
      }
    />
  );
}

// ---------- Gouvernement ----------

function VueGouvernement({ gouvernement: g }: { gouvernement: Gouvernement }) {
  const p = usePalette();
  const aller = useAller();
  const actuel = g.actuel;
  return (
    <Colonnes
      principal={
        actuel ? (
          <View>
            <Label>
              {`${actuel.nom}${actuel.debut ? `, en fonction depuis le ${jour(actuel.debut)}` : ''} · ${actuel.membres.length} membres`}
            </Label>
            {actuel.membres.map((m) => (
              <Ligne key={m.personne.id} onPress={() => aller.personne(m.personne.id)} accessibilityLabel={`${m.personne.nom}, ${m.fonction}`}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T variant="heading">{m.personne.nom}</T>
                  <T variant="caption" ton="inkMuted">
                    {m.ancienne ? `${m.fonction} · ${m.ancienne}` : m.fonction}
                  </T>
                </View>
                {m.depuis && (
                  <T variant="caption" ton="inkMuted">
                    {`depuis ${moisCourt(m.depuis)}`}
                  </T>
                )}
              </Ligne>
            ))}
          </View>
        ) : (
          <T ton="inkMuted">Aucun gouvernement en fonction publié.</T>
        )
      }
      cote={
        <>
          <Carte cernee>
            <Label>Gouvernements de la législature</Label>
            {g.gouvernements.map((x) => (
              <View key={x.id} style={[styles.gouv, { borderTopColor: p.line }]}>
                <T style={{ flex: 1 }}>{x.nom}</T>
                <T variant="caption" ton="inkMuted">
                  {x.fin ? `${x.debut ? moisCourt(x.debut) : '?'} – ${moisCourt(x.fin)}` : x.debut ? `depuis ${moisCourt(x.debut)}` : 'en cours'}
                </T>
              </View>
            ))}
          </Carte>
          <Carte cernee>
            <Label>Textes déposés par ce gouvernement</Label>
            {g.textesDeposes.dossiers.map((d) => (
              <Ligne key={d.id} onPress={() => aller.dossier(d.id)}>
                <T style={{ flex: 1 }}>{d.titre}</T>
              </Ligne>
            ))}
            <T variant="caption" ton="inkMuted">{`${nombre(g.textesDeposes.total)} projets de loi déposés`}</T>
          </Carte>
        </>
      }
    />
  );
}

// ---------- Conseil constitutionnel ----------

function VueConseil({ conseil: c }: { conseil: Conseil }) {
  const p = usePalette();
  const aller = useAller();
  return (
    <Colonnes
      principal={
        <View style={{ gap: space[2] }}>
          {c.saisinesEnCours.length > 0 && (
            <View>
              <TitreSection>Saisines en cours</TitreSection>
              {c.saisinesEnCours.map((s) => (
                <Ligne key={s.dossier.id} onPress={() => aller.etape(s.dossier.id, 'cc')} accessibilityLabel={`Saisine en cours : ${s.dossier.titre}`}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.entete}>
                      <Label style={{ flex: 1 }}>{`Saisi${s.date ? ` le ${jour(s.date)}` : ''}${s.saisissants ? ` · ${s.saisissants}` : ''}`}</Label>
                      <Label ton="signal">En cours</Label>
                    </View>
                    <T variant="heading">{s.dossier.titre}</T>
                  </View>
                </Ligne>
              ))}
            </View>
          )}
          <TitreSection>Décisions récentes</TitreSection>
          {c.decisions.map((d) => (
            <View key={d.id} style={[styles.decision, { borderBottomColor: p.line }]}>
              <View style={styles.entete}>
                <Label style={{ flex: 1 }}>{`${d.numero}${d.date ? ` · ${jour(d.date)}` : ''}`}</Label>
                <Label ton="ink">{d.solution ?? 'Solution non publiée'}</Label>
              </View>
              {d.dossier ? (
                <Action onPress={() => aller.dossier(d.dossier!.id)} accessibilityLabel={`Dossier : ${d.dossier.titre}`}>
                  {`${d.dossier.titre} →`}
                </Action>
              ) : (
                <T variant="caption" ton="inkMuted">
                  {d.type === 'QPC' ? 'Question prioritaire de constitutionnalité : pas de dossier législatif relié.' : 'Aucun dossier relié par la référence de l’AN.'}
                </T>
              )}
              <Source provenance={d.provenance} compact />
            </View>
          ))}
        </View>
      }
      cote={
        <Avertissement>
          Les membres du Conseil constitutionnel ne sont pas encore chargés. Une décision est reliée à un dossier seulement quand la
          référence de l’Assemblée le cite.
        </Avertissement>
      }
    />
  );
}

const styles = StyleSheet.create({
  hemicycle: { alignItems: 'center', paddingVertical: space[3], borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  gouv: { flexDirection: 'row', gap: space[2], paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  entete: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  decision: { gap: 4, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
});
