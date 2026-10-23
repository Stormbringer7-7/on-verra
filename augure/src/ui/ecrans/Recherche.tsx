import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Explorer, ListerScrutins, type Catalogue, type Nature, type ScrutinResume } from '@/core';
import { normaliser } from '@/core/domain/texte';
import { verdict } from '@/core/domain/votes';
import { useAller } from '@/navigation';
import { IconeRecherche, Label, Pastille, Puce, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Source } from '@/ui/components/Ecran';
import { date, pluriel } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { libelleScrutin, NATURES } from '@/ui/natures';
import { usePalette } from '@/ui/theme/ThemeProvider';
import { radius, space, type } from '@/ui/theme/tokens';

type Type = 'tout' | 'deputes' | 'groupes' | 'scrutins' | 'themes' | 'territoires';
type NatureFiltre = 'tous' | 'texte' | 'article' | 'amendement' | 'motion';
type Resultat = 'tous' | 'adopte' | 'rejete';

const TYPES: [Type, string][] = [
  ['tout', 'TOUT'],
  ['deputes', 'DÉPUTÉS'],
  ['groupes', 'GROUPES'],
  ['scrutins', 'SCRUTINS'],
  ['themes', 'THÈMES'],
  ['territoires', 'TERRITOIRES'],
];
const NATURES_FILTRE: Record<NatureFiltre, { libelle: string; natures: readonly Nature[] }> = {
  tous: { libelle: 'TOUS', natures: ['ensemble', 'article_unique', 'article', 'amendement', 'motion', 'autre'] },
  texte: { libelle: 'ENSEMBLE DU TEXTE', natures: ['ensemble', 'article_unique'] },
  article: { libelle: 'ARTICLE', natures: ['article'] },
  amendement: { libelle: 'AMENDEMENT', natures: ['amendement'] },
  motion: { libelle: 'MOTION', natures: ['motion'] },
};
const DELAI_MS = 150;
const APERCU = 3;

interface Element {
  cle: string;
  titre: string;
  meta: string;
  tag?: string;
  /** Couleur de pastille (député, groupe) ; carré vide sinon. */
  pastille?: string | null;
  onPress(): void;
}

export function Recherche() {
  const catalogue = useCommand(Explorer({}));
  return (
    <Ecran>
      {catalogue.statut === 'erreur' ? (
        <Erreur message={catalogue.message} onReessayer={catalogue.recharger} />
      ) : catalogue.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <Exploration catalogue={catalogue.donnees} />
      )}
      <Source />
    </Ecran>
  );
}

function Exploration({ catalogue }: { catalogue: Catalogue }) {
  const p = usePalette();
  const aller = useAller();
  const [saisie, setSaisie] = useState('');
  const [texte, setTexte] = useState('');
  const [typeActif, setType] = useState<Type>('tout');
  const [nature, setNature] = useState<NatureFiltre>('tous');
  const [resultat, setResultat] = useState<Resultat>('tous');
  const [theme, setTheme] = useState<string | null>(null);
  const [departement, setDepartement] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTexte(saisie.trim()), DELAI_MS);
    return () => clearTimeout(t);
  }, [saisie]);

  const q = normaliser(texte);
  const filtres = !!(q || theme || departement || nature !== 'tous' || resultat !== 'tous');
  const explorer = typeActif === 'tout' && !filtres;
  const correspond = (...champs: (string | null | undefined)[]) => !q || champs.some((c) => c && normaliser(c).includes(q));

  const scrutins = useCommand(
    ListerScrutins({
      legislature: catalogue.legislature,
      natures: NATURES_FILTRE[nature].natures,
      ...(q.length >= 2 ? { texte: q } : {}),
      ...(resultat !== 'tous' ? { resultat } : {}),
      ...(theme ? { theme } : {}),
      limite: typeActif === 'scrutins' ? 100 : 20,
    }),
  );

  const sections = useMemo(() => {
    const deputes: Element[] = catalogue.deputes
      .filter((d) => correspond(`${d.prenom} ${d.nom}`, d.groupe?.abrege, d.groupe?.libelle, d.departement) && (!departement || d.departement === departement))
      .map((d) => ({
        cle: d.acteur,
        titre: `${d.prenom} ${d.nom}`,
        meta: [d.groupe?.abrege, d.departement && `${d.departement}${d.circonscription ? `, ${d.circonscription}e circ.` : ''}`]
          .filter(Boolean)
          .join(' · ')
          .toUpperCase(),
        pastille: d.groupe?.couleur ?? p.inkMuted,
        onPress: () => aller.depute(d.acteur, catalogue.legislature),
      }));
    const groupes: Element[] = catalogue.groupes
      .filter((g) => correspond(g.libelle, g.abrege))
      .map((g) => ({
        cle: g.ref,
        titre: g.libelle,
        meta: `${g.abrege.toUpperCase()} · ${g.sieges} SIÈGES`,
        pastille: g.couleur ?? p.inkMuted,
        onPress: () => aller.groupe(g.ref, catalogue.legislature),
      }));
    const listeScrutins: Element[] = (scrutins.statut === 'pret' ? scrutins.donnees : []).map((s: ScrutinResume) => ({
      cle: s.uid,
      titre: libelleScrutin(s),
      meta: `${date(s.date)} · ${NATURES[s.nature].libelle}`,
      tag: verdict(s.sort, s.decompte).toUpperCase(),
      onPress: () => aller.scrutin(s.uid),
    }));
    const themes: Element[] = catalogue.themes
      .filter((t) => correspond(t.theme))
      .map((t) => ({
        cle: t.theme,
        titre: t.theme,
        meta: pluriel(t.scrutins, 'SCRUTIN'),
        tag: '→',
        onPress: () => {
          setTheme(t.theme);
          setType('scrutins');
          setSaisie('');
        },
      }));
    const territoires: Element[] = catalogue.territoires
      .filter((t) => correspond(t.departement, t.numero))
      .map((t) => ({
        cle: t.departement,
        titre: t.numero ? `${t.departement} (${t.numero})` : t.departement,
        meta: pluriel(t.deputes, 'DÉPUTÉ'),
        tag: '→',
        onPress: () => {
          setDepartement(t.departement);
          setType('deputes');
          setSaisie('');
        },
      }));
    return { deputes, groupes, scrutins: listeScrutins, themes, territoires };
    // `correspond` dépend de q.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue, q, departement, scrutins, aller, p.inkMuted]);

  const cartes: { type: Exclude<Type, 'tout'>; libelle: string; nombre: string }[] = [
    { type: 'deputes', libelle: 'Députés', nombre: String(catalogue.groupes.reduce((s, g) => s + g.sieges, 0)) },
    { type: 'groupes', libelle: 'Groupes', nombre: String(catalogue.groupes.length) },
    { type: 'scrutins', libelle: 'Scrutins', nombre: catalogue.scrutins.toLocaleString('fr-FR') },
    { type: 'themes', libelle: 'Thèmes', nombre: String(catalogue.themes.length) },
    { type: 'territoires', libelle: 'Territoires', nombre: pluriel(catalogue.territoires.length, 'département') },
  ];
  const LIBELLES: Record<Exclude<Type, 'tout'>, string> = {
    deputes: 'DÉPUTÉS',
    groupes: 'GROUPES',
    scrutins: 'SCRUTINS',
    themes: 'THÈMES',
    territoires: 'TERRITOIRES',
  };

  let affichees: { type: Exclude<Type, 'tout'>; libelle: string; elements: Element[]; tout: boolean }[];
  if (typeActif !== 'tout') {
    affichees = [{ type: typeActif, libelle: LIBELLES[typeActif], elements: sections[typeActif], tout: false }];
  } else if (filtres) {
    affichees = (Object.keys(LIBELLES) as Exclude<Type, 'tout'>[])
      .filter((t) => sections[t].length)
      .map((t) => ({ type: t, libelle: LIBELLES[t], elements: sections[t].slice(0, APERCU), tout: sections[t].length > APERCU }));
  } else {
    affichees = [{ type: 'scrutins', libelle: 'SCRUTINS RÉCENTS', elements: sections.scrutins.slice(0, 4), tout: true }];
  }
  const actifs = [
    theme && { libelle: `THÈME : ${theme.toUpperCase()}`, retirer: () => setTheme(null) },
    departement && { libelle: `TERRITOIRE : ${departement.toUpperCase()}`, retirer: () => setDepartement(null) },
  ].filter(Boolean) as { libelle: string; retirer(): void }[];
  const chargeScrutins = scrutins.statut === 'chargement' && affichees.some((a) => a.type === 'scrutins');

  return (
    <>
      <View style={{ gap: space[3], marginHorizontal: -space[4], paddingHorizontal: space[4], paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line }}>
        <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
          <IconeRecherche couleur={p.inkMuted} taille={16} />
          <TextInput
            accessibilityLabel="Rechercher"
            value={saisie}
            onChangeText={setSaisie}
            placeholder="Député, groupe, texte, thème, lieu…"
            placeholderTextColor={p.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            style={[type.lead, { flex: 1, color: p.ink, minHeight: 46 }]}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces} accessibilityRole="tablist">
          {TYPES.map(([cle, libelle]) => (
            <Puce key={cle} actif={typeActif === cle} onPress={() => setType(cle)}>
              {libelle}
            </Puce>
          ))}
        </ScrollView>
      </View>

      {typeActif === 'scrutins' && (
        <View style={{ gap: space[2] }}>
          <Label>NATURE DU VOTE</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
            {(Object.keys(NATURES_FILTRE) as NatureFiltre[]).map((n) => (
              <Puce key={n} actif={nature === n} onPress={() => setNature(n)}>
                {NATURES_FILTRE[n].libelle}
              </Puce>
            ))}
          </ScrollView>
          <Label>RÉSULTAT</Label>
          <View style={styles.puces}>
            {(
              [
                ['tous', 'TOUS'],
                ['adopte', 'ADOPTÉ'],
                ['rejete', 'REJETÉ'],
              ] as const
            ).map(([cle, libelle]) => (
              <Puce key={cle} actif={resultat === cle} onPress={() => setResultat(cle)}>
                {libelle}
              </Puce>
            ))}
          </View>
        </View>
      )}

      {actifs.length > 0 && (
        <View style={[styles.puces, { flexWrap: 'wrap' }]}>
          {actifs.map((f) => (
            <Pressable
              key={f.libelle}
              accessibilityRole="button"
              accessibilityLabel={`Retirer le filtre ${f.libelle.toLowerCase()}`}
              onPress={f.retirer}
              style={[styles.actif, { backgroundColor: p.signalSoft }]}
            >
              <Label ton="ink">{`${f.libelle}  ✕`}</Label>
            </Pressable>
          ))}
        </View>
      )}

      {explorer && (
        <View style={{ gap: space[2] }}>
          <T variant="heading">Explorer par</T>
          <View style={styles.cartes}>
            {cartes.map((c) => (
              <Pressable
                key={c.type}
                accessibilityRole="button"
                onPress={() => setType(c.type)}
                style={[styles.carte, { borderColor: p.line, backgroundColor: p.surfaceRaised }]}
              >
                <T variant="heading">{c.libelle}</T>
                <T variant="data" ton="inkMuted" style={{ fontSize: 12 }}>
                  {c.nombre}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {affichees.map((s) => (
        <Section
          key={s.libelle}
          libelle={s.libelle}
          nombre={s.type === 'scrutins' && scrutins.statut === 'pret' && s.elements.length >= 20 ? `${s.elements.length}+` : String(s.type === 'scrutins' || !s.tout ? s.elements.length : sections[s.type].length)}
          onToutVoir={s.tout ? () => setType(s.type) : undefined}
        >
          {s.type === 'scrutins' && chargeScrutins ? (
            <Chargement />
          ) : (
            s.elements.map((e) => <Ligne key={e.cle} element={e} />)
          )}
        </Section>
      ))}

      {!explorer && !chargeScrutins && affichees.every((s) => s.elements.length === 0) && (
        <T ton="inkMuted">Aucun résultat. Essayez un autre mot ou retirez un filtre.</T>
      )}
    </>
  );
}

function Section({ libelle, nombre, onToutVoir, children }: { libelle: string; nombre: string; onToutVoir?: () => void; children: ReactNode }) {
  const p = usePalette();
  return (
    <View>
      <View style={[styles.enteteSection, { borderBottomColor: p.lineStrong }]}>
        <Label>{`${libelle} · ${nombre}`}</Label>
        {onToutVoir && (
          <Pressable accessibilityRole="button" onPress={onToutVoir} hitSlop={8}>
            <Label ton="signal">TOUT VOIR →</Label>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function Ligne({ element: e }: { element: Element }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="link" onPress={e.onPress} style={[styles.ligne, { borderBottomColor: p.line }]}>
      {e.pastille !== undefined ? (
        <Pastille couleur={e.pastille ?? p.inkMuted} />
      ) : (
        <View style={[styles.carre, { borderColor: p.lineStrong }]} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontSize: 15 }} numberOfLines={3}>
          {e.titre}
        </T>
        <Label style={{ letterSpacing: 0.66 }}>{e.meta}</Label>
      </View>
      {e.tag && <Label ton="ink">{e.tag}</Label>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  champ: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.sm },
  puces: { flexDirection: 'row', gap: 6 },
  actif: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.sm },
  cartes: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  carte: { flexBasis: '48%', flexGrow: 1, minHeight: 76, gap: space[1], padding: space[3], borderWidth: 1, borderRadius: radius.md },
  enteteSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: space[2], borderBottomWidth: 1 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  carre: { width: 10, height: 10, borderWidth: 1.5 },
});
