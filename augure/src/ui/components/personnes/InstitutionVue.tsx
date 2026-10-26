// Une institution (canevas : artboard « Institutions ») : Assemblée et Sénat par groupe
// (hémicycle, couleurs officielles des groupes), Gouvernement (membres, gouvernements de la
// législature, textes déposés), Conseil constitutionnel (saisines en cours, décisions reliées au
// dossier). Partagée par l'onglet Institutions et la page empilée Institution.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Institution } from '@/core';
import { useAller } from '@/navigation';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, Label, Pastille, T } from '../base';
import { Source } from '../commun/Source';
import { HemicycleZoom, type SiegeHemicycle } from '../hemicycle/HemicycleZoom';
import { Avertissement, Carte, Colonnes, Ligne, TitreSection } from './elements';
import { jour, moisCourt, nombre } from './regles';

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

function Hemicycle({ chambre, onPersonne }: { chambre: Chambre; onPersonne: (id: string) => void }) {
  const p = usePalette();
  const an = chambre.type === 'an';
  const groupes = useMemo(() => [...chambre.groupes].sort((a, b) => a.rang - b.rang), [chambre.groupes]);
  // Chaque parlementaire quand le contrat le donne (de la gauche vers la droite), sinon un siège par groupe.
  const sieges = useMemo<SiegeHemicycle[]>(
    () =>
      chambre.membres.length
        ? chambre.membres.map((m) => ({
            couleur: m.personne.groupe?.couleur ?? p.lineStrong,
            groupe: m.personne.groupe,
            personne: { id: m.personne.id, nom: m.personne.nom },
            detail: m.personne.groupe ? undefined : 'Sans groupe',
          }))
        : [
            ...groupes.flatMap((g) => Array.from({ length: g.sieges }, () => ({ couleur: g.groupe.couleur, groupe: g.groupe }))),
            ...Array.from({ length: chambre.sansGroupe }, () => ({ couleur: p.lineStrong, groupe: null, detail: 'Sans groupe' })),
          ],
    [chambre.membres, groupes, chambre.sansGroupe, p.lineStrong],
  );
  const libelle = `Hémicycle de ${chambre.sieges} sièges par groupe : ${groupes
    .map((g) => `${g.groupe.libelle} ${g.sieges}`)
    .join(', ')}${chambre.sansGroupe ? `, sans groupe ${chambre.sansGroupe}` : ''}`;
  const parId = new Map(groupes.map((g) => [g.groupe.id, g]));
  return (
    <View style={[styles.hemicycle, { borderColor: p.line, backgroundColor: p.surfaceSunken }]}>
      <HemicycleZoom
        sieges={sieges}
        rangs={an ? 11 : 9}
        taillePoint={an ? 1 : 1.25}
        largeurMax={520}
        libelle={libelle}
        onPersonne={onPersonne}
        infoGroupe={(g) => {
          const n = parId.get(g.id)?.sieges ?? 0;
          return `${nombre(n)} ${an ? 'députés' : 'sénateurs'} sur ${nombre(chambre.sieges)}`;
        }}
      />
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
          <Hemicycle chambre={chambre} onPersonne={(id) => aller.personne(id)} />
          <T variant="caption" ton="inkMuted">
            Chaque point est un parlementaire, coloré selon son groupe, dans l’ordre des sièges publiés (pas le plan exact de la salle). Une couleur est officielle quand la chambre la publie ; sinon elle est attribuée.
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
          <Action onPress={() => aller.personnes({ vue: 'annuaire', role: an ? 'depute' : 'senateur' })}>{`Les ${nombre(chambre.sieges)} ${an ? 'députés' : 'sénateurs'} →`}</Action>
          <Action onPress={() => aller.dossiers()}>Dossiers en cours →</Action>
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
  hemicycle: { alignItems: 'center', padding: space[3], borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  gouv: { flexDirection: 'row', gap: space[2], paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  entete: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  decision: { gap: 4, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
});
