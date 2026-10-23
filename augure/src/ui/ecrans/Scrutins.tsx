import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ListerLegislatures, ListerScrutins, NATURES_FINALES, type Nature, type Niveau } from '@/core';
import { Label, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Source } from '@/ui/components/Ecran';
import { LigneScrutin } from '@/ui/components/LigneScrutin';
import { useCommand } from '@/ui/hooks/core';
import { usePalette } from '@/ui/theme/ThemeProvider';
import { radius, space } from '@/ui/theme/tokens';

const NATURES: { cle: string; libelle: string; sousTitre: string; natures?: readonly Nature[] }[] = [
  { cle: 'finaux', libelle: 'VOTES FINAUX', sousTitre: 'VOTES SUR L’ENSEMBLE D’UN TEXTE', natures: NATURES_FINALES },
  { cle: 'amendements', libelle: 'AMENDEMENTS', sousTitre: 'AMENDEMENTS ET SOUS-AMENDEMENTS', natures: ['amendement'] },
  { cle: 'articles', libelle: 'ARTICLES', sousTitre: 'VOTES SUR UN ARTICLE', natures: ['article'] },
  { cle: 'motions', libelle: 'MOTIONS', sousTitre: 'MOTIONS DE PROCÉDURE (REJET PRÉALABLE, RENVOI…)', natures: ['motion'] },
  { cle: 'tous', libelle: 'TOUS', sousTitre: 'TOUS LES SCRUTINS PUBLICS' },
];

const NIVEAUX: { cle: Niveau | undefined; libelle: string }[] = [
  { cle: undefined, libelle: 'TOUS' },
  { cle: 'majeure', libelle: 'MAJEURS' },
  { cle: 'standard', libelle: 'STANDARD' },
  { cle: 'technique', libelle: 'TECHNIQUES' },
];

const TOUTES: readonly Nature[] = ['ensemble', 'article_unique', 'article', 'amendement', 'motion', 'autre'];

export function Scrutins() {
  const legislatures = useCommand(ListerLegislatures({}));
  const [choix, setChoix] = useState<string | undefined>();
  const [niveau, setNiveau] = useState<Niveau | undefined>();
  const [nature, setNature] = useState(NATURES[0]);
  const legislature = choix ?? (legislatures.statut === 'pret' ? legislatures.donnees.at(-1)?.numero : undefined);
  const scrutins = useCommand(
    legislature
      ? ListerScrutins({ legislature, niveau, limite: 300, ...(nature.natures ? { natures: nature.natures } : { natures: TOUTES }) })
      : null,
  );

  return (
    <Ecran>
      <View style={{ gap: space[1] }}>
        <T variant="title">Scrutins</T>
        <Label>{nature.sousTitre}</Label>
      </View>

      <View style={{ gap: space[2] }}>
        <View style={styles.puces}>
          {legislatures.statut === 'pret' &&
            [...legislatures.donnees].reverse().map((l) => (
              <Puce key={l.numero} actif={l.numero === legislature} onPress={() => setChoix(l.numero)}>
                {`${l.numero}E LÉGISLATURE`}
              </Puce>
            ))}
        </View>
        <View style={styles.puces}>
          {NATURES.map((n) => (
            <Puce key={n.cle} actif={n.cle === nature.cle} onPress={() => setNature(n)}>
              {n.libelle}
            </Puce>
          ))}
        </View>
        <View style={styles.puces}>
          {NIVEAUX.map((n) => (
            <Puce key={n.libelle} actif={n.cle === niveau} onPress={() => setNiveau(n.cle)}>
              {n.libelle}
            </Puce>
          ))}
        </View>
      </View>

      {scrutins.statut === 'erreur' ? (
        <Erreur message={scrutins.message} onReessayer={scrutins.recharger} />
      ) : scrutins.statut === 'chargement' || !scrutins.donnees ? (
        <Chargement />
      ) : (
        <View>
          <Label style={{ marginBottom: space[2] }}>
            {scrutins.donnees.length === 300 ? 'LES 300 PLUS RÉCENTS' : `${scrutins.donnees.length} SCRUTINS`}
          </Label>
          {scrutins.donnees.map((s) => (
            <LigneScrutin key={s.uid} scrutin={s} />
          ))}
        </View>
      )}

      <Source precision="niveau : celui du texte visé, classé par on-verra (lois de finances, votes solennels, 49.3… = majeur)" />
    </Ecran>
  );
}

function Puce({ actif, onPress, children }: { actif: boolean; onPress(): void; children: string }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      onPress={onPress}
      style={[
        styles.puce,
        { borderColor: actif ? p.ink : p.lineStrong, backgroundColor: actif ? p.ink : 'transparent' },
      ]}
    >
      <Label couleur={actif ? p.surface : p.inkMuted}>{children}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  puce: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.sm },
});
