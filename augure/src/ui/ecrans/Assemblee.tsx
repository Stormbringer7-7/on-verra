import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  ConsulterAssemblee,
  ConsulterGroupe,
  ListerLegislatures,
  type Assemblee as DonneesAssemblee,
  type Decompte,
  type MembreHemicycle,
} from '@/core';
import { normaliser } from '@/core/domain/texte';
import { majoritaire, verdict } from '@/core/domain/votes';
import { useAller } from '@/navigation';
import { Action, IconeRecherche, Label, Panneau, Pastille, Repartition, Segmente, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Source } from '@/ui/components/Ecran';
import { HemicycleZoom, type HemicycleZoomRef, type ModeHemicycle } from '@/ui/components/HemicycleZoom';
import { dateCourte, legislature as libelleLegislature, pluriel, pourcent } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { useFenetre, useLarge } from '@/ui/hooks/miseEnPage';
import { libelleScrutin } from '@/ui/natures';
import { couleurVote, LIBELLE_VOTE, usePalette } from '@/ui/theme/ThemeProvider';
import { fonts, radius, space, type } from '@/ui/theme/tokens';

type Selection = { type: 'depute'; index: number } | { type: 'groupe'; ref: string } | null;

export function Assemblee() {
  const p = usePalette();
  const aller = useAller();
  const large = useLarge();
  const fenetre = useFenetre();
  const [legislature, setLegislature] = useState<string | undefined>();
  const [mode, setMode] = useState<ModeHemicycle>('groupes');
  const legislatures = useCommand(ListerLegislatures({}));
  const assemblee = useCommand(ConsulterAssemblee({ legislature }));
  const donnees = assemblee.statut !== 'erreur' ? assemblee.donnees : undefined;

  const choixMode = (
    <Segmente<ModeHemicycle>
      label="Colorer les sièges par"
      options={[
        { cle: 'groupes', libelle: 'GROUPES' },
        { cle: 'vote', libelle: 'DERNIER SCRUTIN' },
      ]}
      valeur={mode}
      onChange={setMode}
    />
  );

  return (
    <Ecran largeur="pleine">
      <View style={[styles.entete, large && styles.enteteLarge]}>
        <View style={{ flex: 1, gap: 4 }}>
          <T variant={large && !fenetre.basse ? 'display' : 'title'}>Assemblée nationale</T>
          <View style={styles.ligne}>
            <Label>{donnees ? `${donnees.membres.length} SIÈGES · ${libelleLegislature(donnees.legislature)}` : ' '}</Label>
            {legislatures.statut === 'pret' && legislatures.donnees.length > 1 && (
              <View style={styles.legislatures} accessibilityLabel="Législature">
                {legislatures.donnees.map((l) => {
                  const active = l.numero === (legislature ?? legislatures.donnees[legislatures.donnees.length - 1]?.numero);
                  return (
                    <Pressable
                      key={l.numero}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${l.numero}e législature`}
                      hitSlop={8}
                      onPress={() => setLegislature(l.numero)}
                    >
                      <Label ton={active ? 'ink' : 'inkMuted'} style={active ? { textDecorationLine: 'underline' } : undefined}>
                        {`${l.numero}E`}
                      </Label>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
        {large ? (
          <View style={{ width: 340 }}>{choixMode}</View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rechercher"
            onPress={() => aller.onglet('Recherche')}
            style={[styles.loupe, { borderColor: p.lineStrong }]}
          >
            <IconeRecherche couleur={p.ink} />
          </Pressable>
        )}
      </View>

      {!large && choixMode}

      {assemblee.statut === 'erreur' ? (
        <Erreur message={assemblee.message} onReessayer={assemblee.recharger} />
      ) : !donnees ? (
        <Chargement libelle={legislature ? `OUVERTURE DE LA ${legislature}E LÉGISLATURE` : 'CHARGEMENT'} />
      ) : (
        <Contenu key={donnees.legislature} assemblee={donnees} mode={mode} large={large} />
      )}

      <Source precision={donnees ? `composition au ${dateCourte(donnees.date)}` : undefined} />
    </Ecran>
  );
}

function Contenu({ assemblee, mode, large }: { assemblee: DonneesAssemblee; mode: ModeHemicycle; large: boolean }) {
  const p = usePalette();
  const aller = useAller();
  const fenetre = useFenetre();
  const hemicycle = useRef<HemicycleZoomRef>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const couleurs = useMemo(() => new Map(assemblee.groupes.map((g) => [g.ref, g.couleur])), [assemblee.groupes]);
  const s = assemblee.scrutin;
  const depute = selection?.type === 'depute' ? assemblee.membres[selection.index] : null;
  const groupeActif = selection?.type === 'groupe' ? selection.ref : null;

  const choisirDepute = (index: number) => {
    setSelection({ type: 'depute', index });
    hemicycle.current?.zoomerSurSiege(index);
  };

  const totaux = useMemo(() => {
    const t = { pour: 0, contre: 0, abstention: 0, absent: 0 };
    for (const m of assemblee.membres) {
      if (m.position === 'pour' || m.position === 'contre' || m.position === 'abstention') t[m.position]++;
      else t.absent++;
    }
    return t;
  }, [assemblee.membres]);

  const scrutin = mode === 'vote' && s && (
    <Pressable accessibilityRole="link" onPress={() => aller.scrutin(s.uid)} style={styles.scrutin}>
      <T style={{ flex: 1, minWidth: 220 }} numberOfLines={2}>
        {libelleScrutin(s)} <T ton="inkMuted">· {dateCourte(s.date)}</T>
      </T>
      <View style={styles.totaux}>
        <Label ton="ink">{verdict(s.sort, s.decompte).toUpperCase()}</Label>
        <Label couleur={p.votePour}>{`+ ${totaux.pour}`}</Label>
        <Label couleur={p.voteContre}>{`− ${totaux.contre}`}</Label>
        <Label couleur={p.voteAbstention}>{`Ø ${totaux.abstention}`}</Label>
        <Label>{`· ${totaux.absent}`}</Label>
      </View>
    </Pressable>
  );

  const plan = (
    <HemicycleZoom
      ref={hemicycle}
      membres={assemblee.membres}
      couleurs={couleurs}
      mode={mode}
      groupe={groupeActif}
      depute={depute?.acteur ?? null}
      // En large, l'hémicycle occupe la hauteur de la fenêtre (téléphone en paysage compris), 540 px au plus.
      hauteur={large ? Math.max(280, Math.min(540, fenetre.hauteur - 180)) : 360}
      onSelection={(index) => setSelection({ type: 'depute', index })}
      onOuvrir={(index) => aller.depute(assemblee.membres[index].acteur, assemblee.legislature)}
    />
  );

  const groupes = large ? (
    <View style={styles.grilleGroupes}>
      {assemblee.groupes.map((g) => (
        <BoutonGroupe key={g.ref} g={g} actif={groupeActif === g.ref} large onPress={() => setSelection(groupeActif === g.ref ? null : { type: 'groupe', ref: g.ref })} />
      ))}
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
      {assemblee.groupes.map((g) => (
        <BoutonGroupe key={g.ref} g={g} actif={groupeActif === g.ref} onPress={() => setSelection(groupeActif === g.ref ? null : { type: 'groupe', ref: g.ref })} />
      ))}
    </ScrollView>
  );

  const panneau = depute ? (
    <PanneauDepute depute={depute} assemblee={assemblee} couleurs={couleurs} large={large} />
  ) : groupeActif ? (
    <PanneauGroupe
      assemblee={assemblee}
      refGroupe={groupeActif}
      mode={mode}
      large={large}
      onZoomer={() => hemicycle.current?.zoomerSur(assemblee.membres.flatMap((m, i) => (m.groupe === groupeActif ? [i] : [])))}
    />
  ) : (
    <T ton="inkMuted">
      {large
        ? 'Cliquez un siège pour identifier le député, cliquez-le à nouveau une fois zoomé pour ouvrir sa fiche. Un groupe pour l’isoler.'
        : 'Touchez un siège pour zoomer sur le député, puis touchez-le pour ouvrir sa fiche. Touchez un groupe pour l’isoler.'}
    </T>
  );

  const trouver = <TrouverDepute membres={assemblee.membres} onChoisir={choisirDepute} />;

  if (large) {
    return (
      <View style={styles.colonnes}>
        <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
          {scrutin}
          <View style={[styles.cadreLarge, { borderColor: p.line }]}>{plan}</View>
        </View>
        <View style={styles.aside}>
          {groupes}
          {trouver}
          {panneau}
        </View>
      </View>
    );
  }
  return (
    <>
      {scrutin}
      <View style={{ marginHorizontal: -space[4] }}>{plan}</View>
      {groupes}
      {trouver}
      {panneau}
    </>
  );
}

function BoutonGroupe({
  g,
  actif,
  large,
  onPress,
}: {
  g: DonneesAssemblee['groupes'][number];
  actif: boolean;
  large?: boolean;
  onPress(): void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={`${g.libelle}, ${g.sieges} sièges`}
      onPress={onPress}
      style={[
        styles.groupe,
        large && styles.groupeLarge,
        { borderColor: actif ? p.ink : p.line, backgroundColor: actif ? p.surfaceRaised : 'transparent' },
      ]}
    >
      <Pastille couleur={g.couleur ?? p.inkMuted} />
      <T variant="data" style={{ fontFamily: fonts.monoMedium, fontSize: 12, flex: large ? 1 : undefined }} numberOfLines={1}>
        {g.abrege}
      </T>
      {large && (
        <T variant="data" ton="inkMuted" style={{ fontSize: 12 }}>
          {g.sieges}
        </T>
      )}
    </Pressable>
  );
}

/** Trouver un député par son nom : son siège est mis en avant et zoomé. */
function TrouverDepute({ membres, onChoisir }: { membres: MembreHemicycle[]; onChoisir(index: number): void }) {
  const p = usePalette();
  const [saisie, setSaisie] = useState('');
  const q = normaliser(saisie.trim());
  const trouves = useMemo(
    () =>
      q.length < 2
        ? []
        : membres
            .map((m, index) => ({ m, index }))
            .filter(({ m }) => normaliser(`${m.prenom} ${m.nom}`).includes(q))
            .slice(0, 6),
    [membres, q],
  );
  return (
    <View style={{ gap: space[1] }}>
      <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
        <IconeRecherche couleur={p.inkMuted} taille={16} />
        <TextInput
          accessibilityLabel="Trouver un député dans l'hémicycle"
          value={saisie}
          onChangeText={setSaisie}
          placeholder="Trouver un député dans l’hémicycle"
          placeholderTextColor={p.inkMuted}
          autoCorrect={false}
          style={[type.body, { flex: 1, color: p.ink, minHeight: 42 }]}
        />
      </View>
      {trouves.map(({ m, index }) => (
        <Pressable
          key={m.acteur}
          accessibilityRole="button"
          onPress={() => {
            onChoisir(index);
            setSaisie('');
          }}
          style={[styles.trouve, { borderBottomColor: p.line }]}
        >
          <T style={{ flex: 1 }}>{`${m.prenom} ${m.nom}`}</T>
          <Label>{[m.departement, m.place !== null && `SIÈGE ${m.place}`].filter(Boolean).join(' · ')}</Label>
        </Pressable>
      ))}
    </View>
  );
}

function PanneauDepute({
  depute,
  assemblee,
  couleurs,
  large,
}: {
  depute: MembreHemicycle;
  assemblee: DonneesAssemblee;
  couleurs: Map<string, string | null>;
  large: boolean;
}) {
  const p = usePalette();
  const aller = useAller();
  const absent = depute.position === 'absent' || depute.position === 'non_votant';
  return (
    <Panneau style={{ gap: space[3], padding: large ? 20 : space[4] }}>
      <View style={styles.entre}>
        <T style={[styles.nom, large && { fontSize: 24, lineHeight: 28 }]}>{`${depute.prenom} ${depute.nom}`}</T>
        {depute.place !== null && <Label>{`SIÈGE ${depute.place}`}</Label>}
      </View>
      <View style={styles.ligne}>
        <Pastille couleur={(depute.groupe && couleurs.get(depute.groupe)) ?? p.inkMuted} />
        <T ton="inkMuted" style={{ flex: 1 }}>
          {[
            assemblee.groupes.find((g) => g.ref === depute.groupe)?.libelle,
            depute.departement && `${depute.departement}${depute.circonscription ? `, ${depute.circonscription}e circ.` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>
      <View style={[styles.dl, { borderTopColor: p.line }]}>
        {assemblee.scrutin && depute.position && (
          <Ligne cle="Dernier scrutin">
            <Label couleur={absent ? p.inkMuted : couleurVote(p, depute.position)}>{LIBELLE_VOTE[depute.position]}</Label>
          </Ligne>
        )}
        <Ligne cle="Présence sur la législature">
          <T variant="data">{pourcent(depute.presence)}</T>
        </Ligne>
        <Ligne cle="Votes à l’inverse de son groupe">
          <T variant="data">{pluriel(depute.ecarts, 'fois', 'fois')}</T>
        </Ligne>
      </View>
      <Action onPress={() => aller.depute(depute.acteur, assemblee.legislature)}>VOIR SES CHOIX, THÈME PAR THÈME →</Action>
    </Panneau>
  );
}

function Ligne({ cle, children }: { cle: string; children: React.ReactNode }) {
  return (
    <View style={styles.entre}>
      <T ton="inkMuted" style={{ flex: 1 }}>
        {cle}
      </T>
      {children}
    </View>
  );
}

function PanneauGroupe({
  assemblee,
  refGroupe,
  mode,
  large,
  onZoomer,
}: {
  assemblee: DonneesAssemblee;
  refGroupe: string;
  mode: ModeHemicycle;
  large: boolean;
  onZoomer(): void;
}) {
  const p = usePalette();
  const aller = useAller();
  const g = assemblee.groupes.find((x) => x.ref === refGroupe);
  const fiche = useCommand(g ? ConsulterGroupe({ ref: refGroupe, legislature: assemblee.legislature }) : null);
  if (!g) return null;
  const decompte: Decompte & { absent: number } = { pour: 0, contre: 0, abstention: 0, absent: 0 };
  for (const m of assemblee.membres) {
    if (m.groupe !== refGroupe) continue;
    if (m.position === 'pour' || m.position === 'contre' || m.position === 'abstention') decompte[m.position]++;
    else decompte.absent++;
  }
  const ligne = majoritaire(decompte);
  const f = fiche.statut === 'pret' ? fiche.donnees : null;
  const allie = f?.alliances[0];
  return (
    <Panneau style={{ gap: space[3], padding: large ? 20 : space[4] }}>
      <View style={styles.entre}>
        <T style={[styles.nom, { flex: 1 }, large && { fontSize: 24, lineHeight: 28 }]}>{g.libelle}</T>
        <T variant="data" ton="inkMuted">{`${g.sieges} sièges · ${Math.round((g.sieges / assemblee.membres.length) * 100)} %`}</T>
      </View>
      <View style={[styles.dl, { borderTopColor: p.line }]}>
        <Ligne cle="Présence moyenne">
          <T variant="data">{f ? pourcent(f.stats.presence) : '…'}</T>
        </Ligne>
        <Ligne cle="Vote uni">
          <T variant="data">{f ? pourcent(f.stats.voteUni) : '…'}</T>
        </Ligne>
        <Ligne cle="Vote le plus souvent avec">
          <T variant="data">{allie ? `${allie.groupe.abrege} · ${pourcent(allie.accord)}` : f ? '—' : '…'}</T>
        </Ligne>
      </View>
      {mode === 'vote' && assemblee.scrutin && (
        <View style={{ gap: 6 }}>
          <Repartition decompte={decompte} total={g.sieges} hauteur={8} />
          <T>
            {`Dernier scrutin : ${decompte.pour} pour, ${decompte.contre} contre, ${decompte.abstention} abst., ${decompte.absent} absents`}
            {ligne ? ` — majoritairement ${ligne}.` : '.'}
          </T>
        </View>
      )}
      <View style={styles.actions}>
        <Action onPress={onZoomer}>ZOOMER SUR LE GROUPE</Action>
        <Action onPress={() => aller.groupe(refGroupe, assemblee.legislature)}>STATISTIQUES COMPLÈTES →</Action>
      </View>
    </Panneau>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  enteteLarge: { alignItems: 'flex-end', flexWrap: 'wrap', gap: space[4] },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  legislatures: { flexDirection: 'row', gap: space[3] },
  loupe: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.sm },
  scrutin: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3], minHeight: 44 },
  totaux: { flexDirection: 'row', gap: space[3] },
  colonnes: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  cadreLarge: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  aside: { width: 340, gap: space[4] },
  grilleGroupes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puces: { gap: 6, paddingBottom: 2 },
  groupe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  groupeLarge: { flexBasis: '48%', flexGrow: 1 },
  champ: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.sm },
  trouve: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
  nom: { fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 24 },
  dl: { gap: space[2], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[6] },
});
