import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConsulterGroupe, type FicheGroupe, type ThemeDeGroupe } from '@/core';
import { useAller, type Pages } from '@/navigation';
import { BoutonSecondaire, Label, OngletsFiche, Panneau, Pastille, Puce, Repartition, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Retour, Source } from '@/ui/components/Ecran';
import { date, mois, pluriel, pourcent } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { libelleScrutin } from '@/ui/natures';
import { usePalette } from '@/ui/theme/ThemeProvider';
import { fonts, space } from '@/ui/theme/tokens';
import { couleurVerdict, verdictTheme } from '@/ui/verdicts';

type Onglet = 'synthese' | 'themes' | 'membres';

export function Groupe() {
  const p = usePalette();
  const { ref, legislature } = useRoute<RouteProp<Pages, 'Groupe'>>().params;
  const fiche = useCommand(ConsulterGroupe({ ref, legislature }));
  const [onglet, setOnglet] = useState<Onglet>('synthese');

  return (
    <Ecran section="assemblee">
      <Retour libelle="HÉMICYCLE" />
      {fiche.statut === 'erreur' ? (
        <Erreur message={fiche.message} onReessayer={fiche.recharger} />
      ) : fiche.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <View style={styles.titre}>
              <Pastille couleur={fiche.donnees.groupe.couleur ?? p.inkMuted} taille={14} />
              <T variant="display" style={{ flex: 1, fontSize: 36 }}>
                {fiche.donnees.groupe.libelle}
              </T>
            </View>
            <T ton="inkMuted">
              {`${pluriel(fiche.donnees.sieges, 'député')} · ${fiche.donnees.groupe.abrege} · composition au ${date(fiche.donnees.date)}`}
            </T>
          </View>
          <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line, marginHorizontal: -space[4], paddingHorizontal: space[4] }}>
            <OngletsFiche<Onglet>
              label="Sections du groupe"
              options={[
                { cle: 'synthese', libelle: 'SYNTHÈSE' },
                { cle: 'themes', libelle: 'PAR THÈME' },
                { cle: 'membres', libelle: 'MEMBRES' },
              ]}
              valeur={onglet}
              onChange={setOnglet}
            />
          </View>
          {onglet === 'synthese' && <Synthese fiche={fiche.donnees} />}
          {onglet === 'themes' && <Themes fiche={fiche.donnees} />}
          {onglet === 'membres' && <Membres fiche={fiche.donnees} />}
        </>
      )}
      <Source precision="tous les scrutins publics de la législature, amendements compris" />
    </Ecran>
  );
}

function Synthese({ fiche }: { fiche: FicheGroupe }) {
  const p = usePalette();
  const { stats, composition } = fiche;
  const kpis = [
    { label: 'PRÉSENCE', valeur: pourcent(stats.presence), aide: 'moyenne des membres' },
    { label: 'VOTE UNI', valeur: pourcent(stats.voteUni), aide: 'des scrutins, à 90 % ou plus' },
    { label: 'ÉCARTS INTERNES', valeur: pourcent(stats.ecartsInternes), aide: 'des votes individuels' },
    {
      label: 'MOTIONS DE CENSURE',
      valeur: `${stats.motions.soutenues} / ${stats.motions.total}`,
      aide: 'votées par la majorité du groupe',
    },
  ];
  const presenceMax = Math.max(0.01, ...fiche.presenceMensuelle.map((m) => m.presence));
  const total = composition.femmes + composition.hommes;

  return (
    <>
      <View style={styles.kpis}>
        {kpis.map((k) => (
          <Panneau key={k.label} style={styles.kpi}>
            <Label>{k.label}</Label>
            <T variant="dataLarge">{k.valeur}</T>
            <T variant="caption" ton="inkMuted">
              {k.aide}
            </T>
          </Panneau>
        ))}
      </View>

      {fiche.alliances.length > 0 && (
        <View style={{ gap: 10 }}>
          <T variant="heading">Vote le plus souvent avec</T>
          {fiche.alliances.slice(0, 6).map((a) => (
            <View key={a.groupe.ref} style={styles.alliance}>
              <Pastille couleur={a.groupe.couleur ?? p.inkMuted} />
              <T style={{ width: 92 }} numberOfLines={1}>
                {a.groupe.abrege}
              </T>
              <View style={[styles.piste, { backgroundColor: p.surfaceSunken }]}>
                <View style={{ height: 6, width: `${a.accord * 100}%`, backgroundColor: a.groupe.couleur ?? p.inkMuted }} />
              </View>
              <T variant="data" style={{ width: 44, textAlign: 'right' }}>
                {pourcent(a.accord)}
              </T>
            </View>
          ))}
          <T variant="caption" ton="inkMuted">
            Part des scrutins où les deux groupes ont eu la même position majoritaire.
          </T>
        </View>
      )}

      {fiche.presenceMensuelle.length > 1 && (
        <View style={{ gap: 10 }}>
          <T variant="heading">Présence, mois par mois</T>
          <View
            accessibilityRole="image"
            accessibilityLabel={`Présence mensuelle du groupe, de ${pourcent(Math.min(...fiche.presenceMensuelle.map((m) => m.presence)))} à ${pourcent(presenceMax)}`}
            style={[styles.histogramme, { borderBottomColor: p.lineStrong }]}
          >
            {fiche.presenceMensuelle.map((m) => (
              <View key={m.mois} style={{ flex: 1, height: `${(m.presence / presenceMax) * 100}%`, backgroundColor: p.lineStrong }} />
            ))}
          </View>
          <View style={styles.entre}>
            <Label>{mois(`${fiche.presenceMensuelle[0].mois}-01`)}</Label>
            <Label>{mois(`${fiche.presenceMensuelle[fiche.presenceMensuelle.length - 1].mois}-01`)}</Label>
          </View>
          <T variant="caption" ton="inkMuted">
            Hauteurs relatives au mois le plus suivi ({pourcent(presenceMax)} de votes exprimés).
          </T>
        </View>
      )}

      <View style={{ gap: space[2] }}>
        <T variant="heading">Composition</T>
        {[
          ['Femmes / hommes', total ? `${pourcent(composition.femmes / total)} / ${pourcent(composition.hommes / total)}` : '—'],
          ['Arrivées / départs dans la législature', `+${composition.arrivees} / −${composition.departs}`],
        ].map(([cle, valeur]) => (
          <View key={cle} style={styles.entre}>
            <T ton="inkMuted" style={{ flex: 1 }}>
              {cle}
            </T>
            <T variant="data">{valeur}</T>
          </View>
        ))}
      </View>
    </>
  );
}

function phraseTheme(t: ThemeDeGroupe): string {
  if (!t.dernier) return 'Aucune position majoritaire sur ces scrutins.';
  return `Dernier vote : « ${libelleScrutin(t.dernier.scrutin)} » (${date(t.dernier.scrutin.date)}), majoritairement ${t.dernier.ligne === 'abstention' ? 'en abstention' : t.dernier.ligne}.`;
}

function Themes({ fiche }: { fiche: FicheGroupe }) {
  const p = usePalette();
  return (
    <View style={{ gap: space[3] }}>
      <T ton="inkMuted">{`Position majoritaire du groupe sur chaque scrutin, du ${date(fiche.periode.debut)} au ${date(fiche.periode.fin)}.`}</T>
      {fiche.themes.map((t) => {
        const v = verdictTheme(t.decompte);
        const n = t.decompte.pour + t.decompte.contre + t.decompte.abstention;
        return (
          <Panneau key={t.theme} style={{ gap: space[2] }}>
            <View style={styles.entre}>
              <T variant="heading" style={{ fontSize: 18, lineHeight: 24 }}>
                {t.theme}
              </T>
              <Label couleur={couleurVerdict(p, v === 'PEU PRÉSENT' ? 'PARTAGÉ' : v)}>{v === 'PEU PRÉSENT' ? 'SANS LIGNE' : v}</Label>
            </View>
            <Repartition decompte={t.decompte} hauteur={8} />
            <T ton="inkMuted">
              {`${t.decompte.pour} pour · ${t.decompte.contre} contre · ${pluriel(t.decompte.abstention, 'abstention')} sur ${pluriel(n, 'scrutin')}`}
              {t.sansLigne ? ` · ${t.sansLigne} sans ligne commune` : ''}
            </T>
            <T>{phraseTheme(t)}</T>
          </Panneau>
        );
      })}
    </View>
  );
}

type Tri = 'ecarts' | 'presence' | 'az';
const PAR_PAGE = 20;

function Membres({ fiche }: { fiche: FicheGroupe }) {
  const p = usePalette();
  const aller = useAller();
  const [tri, setTri] = useState<Tri>('ecarts');
  const [tous, setTous] = useState(false);
  const tries = useMemo(() => {
    const m = [...fiche.membres];
    if (tri === 'ecarts') m.sort((a, b) => b.ecarts - a.ecarts);
    if (tri === 'presence') m.sort((a, b) => (b.presence ?? -1) - (a.presence ?? -1));
    return m;
  }, [fiche.membres, tri]);
  // Mis en avant : le dixième du groupe qui s'écarte le plus de sa ligne.
  const seuilEcarts = [...fiche.membres].map((m) => m.ecarts).sort((a, b) => b - a)[Math.floor(fiche.membres.length / 10)] ?? Infinity;

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.puces}>
        {(
          [
            ['ecarts', 'ÉCARTS'],
            ['presence', 'PRÉSENCE'],
            ['az', 'A → Z'],
          ] as const
        ).map(([cle, libelle]) => (
          <Puce key={cle} actif={tri === cle} onPress={() => setTri(cle)}>
            {libelle}
          </Puce>
        ))}
      </View>
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line }}>
        {(tous ? tries : tries.slice(0, PAR_PAGE)).map((m) => (
          <Pressable
            key={m.acteur}
            accessibilityRole="link"
            onPress={() => aller.depute(m.acteur, fiche.legislature)}
            style={[styles.membre, { borderBottomColor: p.line }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>{`${m.prenom} ${m.nom}`}</T>
              <T variant="caption" ton="inkMuted">
                {[m.departement, m.circonscription && `${m.circonscription}e circ.`].filter(Boolean).join(', ')}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T variant="data" style={{ fontSize: 12 }}>{`présent ${pourcent(m.presence)}`}</T>
              <T variant="data" style={{ fontSize: 12 }} ton={m.ecarts >= seuilEcarts && m.ecarts > 0 ? 'signal' : 'inkMuted'}>
                {pluriel(m.ecarts, 'écart')}
              </T>
            </View>
          </Pressable>
        ))}
      </View>
      {!tous && tries.length > PAR_PAGE && (
        <BoutonSecondaire onPress={() => setTous(true)}>{`VOIR LES ${tries.length} DÉPUTÉS`}</BoutonSecondaire>
      )}
      <T variant="caption" ton="inkMuted">
        Présence : votes exprimés sur les scrutins tenus pendant le mandat. Écart : vote différent de la majorité du
        groupe. Sur toute la législature.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  kpi: { flexBasis: '48%', flexGrow: 1, padding: space[3], gap: space[1] },
  alliance: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  piste: { flex: 1, height: 6 },
  histogramme: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64, borderBottomWidth: 1 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  puces: { flexDirection: 'row', gap: 6 },
  membre: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
});

