import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConsulterChampions, type ActiviteTheme, type Champions as DonneesChampions } from '@/core';
import { useAller } from '@/navigation';
import { BoutonSecondaire, Label, Pastille, Puce, Segmente, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Source } from '@/ui/components/Ecran';
import { date, pluriel } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { usePreference } from '@/ui/hooks/preferences';
import { usePalette } from '@/ui/theme/ThemeProvider';
import { fonts, radius, space } from '@/ui/theme/tokens';

type Critere = 'ecarts' | 'absences' | 'positions';
type Ordre = 'desc' | 'asc';

const ORDRES: Record<Critere, [Ordre, string][]> = {
  ecarts: [
    ['desc', 'PLUS D’ÉCARTS'],
    ['asc', 'PLUS ALIGNÉS'],
  ],
  absences: [
    ['desc', 'PLUS ABSENTS'],
    ['asc', 'PLUS PRÉSENTS'],
  ],
  positions: [
    ['desc', '+ PLUS SOUVENT POUR'],
    ['asc', '− PLUS SOUVENT CONTRE'],
  ],
};

const EXPLICATIONS: Record<Critere, string> = {
  ecarts:
    'Un écart est un vote différent de la majorité de son groupe. Ce n’est ni bien ni mal : c’est là que se lisent les choix personnels.',
  absences:
    'Une absence est un scrutin public tenu pendant le mandat sans vote enregistré. Elle peut s’expliquer (commission, mission, délégation) : consultez la fiche.',
  positions:
    'Part des votes POUR (ou CONTRE) parmi les votes exprimés sur les thèmes choisis. Ouvrez la fiche pour voir chaque texte.',
};

/** En dessous, un pourcentage n'a pas de sens : le député n'est pas classé. */
const MINIMUM = 30;
const TOP = 10;

export function Champions() {
  const champions = useCommand(ConsulterChampions({}));
  return (
    <Ecran>
      <View style={{ gap: space[1] }}>
        <T style={styles.titre}>Les Champions</T>
        <T ton="inkMuted">
          {champions.statut === 'pret'
            ? `Classements factuels du ${date(champions.donnees.periode.debut)} au ${date(champions.donnees.periode.fin)}.`
            : 'Classements factuels sur les 12 derniers mois.'}
        </T>
      </View>
      {champions.statut === 'erreur' ? (
        <Erreur message={champions.message} onReessayer={champions.recharger} />
      ) : champions.statut === 'chargement' ? (
        <Chargement libelle="CALCUL DES CLASSEMENTS" />
      ) : (
        <Classement donnees={champions.donnees} />
      )}
      <Source precision="tous les scrutins publics, amendements compris" />
    </Ecran>
  );
}

function Classement({ donnees }: { donnees: DonneesChampions }) {
  const p = usePalette();
  const aller = useAller();
  const [critere, setCritere] = useState<Critere>('ecarts');
  const [ordre, setOrdre] = useState<Ordre>('desc');
  const [favoris, setFavoris] = usePreference<string[]>('champions.themes', []);
  const [perimetre, setPerimetre] = useState<'favoris' | 'tous'>(favoris.length ? 'favoris' : 'tous');
  const [complet, setComplet] = useState(false);

  const themes = perimetre === 'favoris' ? favoris.filter((t) => donnees.themes.includes(t)) : donnees.themes;

  const lignes = useMemo(() => {
    const scores = donnees.deputes.flatMap((d) => {
      const s: ActiviteTheme = { scrutins: 0, absences: 0, exprimes: 0, pour: 0, ecarts: 0 };
      for (const t of themes) {
        const a = d.parTheme[t];
        if (!a) continue;
        s.scrutins += a.scrutins;
        s.absences += a.absences;
        s.exprimes += a.exprimes;
        s.pour += a.pour;
        s.ecarts += a.ecarts;
      }
      const base = critere === 'absences' ? s.scrutins : s.exprimes;
      if (base < MINIMUM) return [];
      const score = critere === 'ecarts' ? s.ecarts / s.exprimes : critere === 'absences' ? s.absences / s.scrutins : s.pour / s.exprimes;
      return [{ d, s, score }];
    });
    scores.sort((a, b) => (ordre === 'desc' ? b.score - a.score : a.score - b.score) || a.d.nom.localeCompare(b.d.nom, 'fr'));
    return scores;
  }, [donnees.deputes, themes, critere, ordre]);

  // Barres à l'échelle de la valeur la plus haute affichée : lisibles même autour de 20 %.
  const echelle = Math.max(0.01, ...lignes.slice(0, complet ? undefined : TOP).map((l) => valeur(l).barre));
  function valeur({ s, score }: (typeof lignes)[number]) {
    if (critere === 'ecarts') return { v: pluriel(s.ecarts, 'écart'), detail: `${Math.round(score * 100)} % de ses votes`, couleur: p.signal, barre: score };
    if (critere === 'absences')
      return { v: `${s.absences} / ${s.scrutins}`, detail: `présent ${Math.round((1 - score) * 100)} %`, couleur: p.inkMuted, barre: ordre === 'asc' ? 1 - score : score };
    return ordre === 'asc'
      ? { v: `${Math.round((1 - score) * 100)} % contre`, detail: pluriel(s.exprimes, 'vote'), couleur: p.voteContre, barre: 1 - score }
      : { v: `${Math.round(score * 100)} % pour`, detail: pluriel(s.exprimes, 'vote'), couleur: p.votePour, barre: score };
  }

  const basculerFavori = (t: string) => {
    setFavoris(favoris.includes(t) ? favoris.filter((f) => f !== t) : [...favoris, t]);
    setPerimetre('favoris');
  };

  return (
    <>
      <Segmente<Critere>
        label="Classer par"
        options={[
          { cle: 'ecarts', libelle: 'ÉCARTS' },
          { cle: 'absences', libelle: 'ABSENCES' },
          { cle: 'positions', libelle: 'POSITIONS' },
        ]}
        valeur={critere}
        onChange={(c) => {
          setCritere(c);
          setOrdre('desc');
        }}
      />
      <View style={styles.puces}>
        {ORDRES[critere].map(([cle, libelle]) => (
          <Puce key={cle} variante="contour" actif={ordre === cle} onPress={() => setOrdre(cle)}>
            {libelle}
          </Puce>
        ))}
      </View>

      <View style={{ gap: space[2] }}>
        <View style={styles.entre}>
          <Label>SUR LES THÈMES</Label>
          <View style={[styles.perimetre, { borderColor: p.line }]}>
            {(
              [
                ['favoris', `★ MES THÈMES (${favoris.length})`],
                ['tous', 'TOUS'],
              ] as const
            ).map(([cle, libelle]) => (
              <Pressable
                key={cle}
                accessibilityRole="button"
                accessibilityState={{ selected: perimetre === cle }}
                onPress={() => setPerimetre(cle)}
                style={[styles.perimetreBouton, { backgroundColor: perimetre === cle ? p.ink : 'transparent' }]}
              >
                <Label couleur={perimetre === cle ? p.surface : p.inkMuted} style={{ fontSize: 10 }}>
                  {libelle}
                </Label>
              </Pressable>
            ))}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
          {donnees.themes.map((t) => {
            const favori = favoris.includes(t);
            return (
              <Puce
                key={t}
                variante="contour"
                actif={favori}
                accessibilityLabel={`${t}${favori ? ', thème favori' : ''}`}
                onPress={() => basculerFavori(t)}
              >
                {`${favori ? '★' : '☆'} ${t.toUpperCase()}`}
              </Puce>
            );
          })}
        </ScrollView>
      </View>

      {themes.length === 0 ? (
        <T ton="inkMuted">Choisissez au moins un thème favori (★) pour établir ce classement.</T>
      ) : (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line }}>
          {(complet ? lignes : lignes.slice(0, TOP)).map((l, i) => {
            const v = valeur(l);
            return (
              <Pressable
                key={l.d.acteur}
                accessibilityRole="link"
                onPress={() => aller.depute(l.d.acteur, donnees.legislature)}
                style={[styles.rang, { borderBottomColor: p.line }]}
              >
                <T variant="data" ton={i === 0 ? 'signal' : 'inkMuted'} style={{ width: 32 }}>
                  {String(i + 1).padStart(2, '0')}
                </T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, lineHeight: 22 }}>{`${l.d.prenom} ${l.d.nom}`}</T>
                  <View style={styles.ligne}>
                    <Pastille couleur={l.d.groupe?.couleur ?? p.inkMuted} taille={8} />
                    <T variant="caption" ton="inkMuted">
                      {l.d.groupe?.abrege ?? 'Sans groupe'}
                    </T>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T variant="data" style={{ fontSize: 15, lineHeight: 20 }}>
                    {v.v}
                  </T>
                  <T variant="data" ton="inkMuted" style={{ fontSize: 11, lineHeight: 14 }}>
                    {v.detail}
                  </T>
                  <View style={[styles.mini, { backgroundColor: p.surfaceSunken }]}>
                    <View style={{ height: 4, width: `${Math.round((v.barre / echelle) * 100)}%`, backgroundColor: v.couleur }} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {!complet && lignes.length > TOP && (
        <BoutonSecondaire onPress={() => setComplet(true)}>{`VOIR LE CLASSEMENT COMPLET (${lignes.length})`}</BoutonSecondaire>
      )}

      <View style={[styles.explication, { borderColor: p.line }]}>
        <Label>COMMENT LIRE CE CLASSEMENT</Label>
        <T ton="inkMuted" style={{ fontSize: 13, lineHeight: 18 }}>
          {`${EXPLICATIONS[critere]} Députés en fonction ayant au moins ${MINIMUM} ${critere === 'absences' ? 'scrutins' : 'votes exprimés'} sur les thèmes choisis.`}
        </T>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  titre: { fontFamily: fonts.sansBold, fontSize: 32, lineHeight: 36 },
  puces: { flexDirection: 'row', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perimetre: { flexDirection: 'row', gap: 2, padding: 2, borderWidth: 1, borderRadius: radius.sm },
  perimetreBouton: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: radius.sm },
  rang: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mini: { width: 64, height: 4 },
  explication: { gap: 6, paddingVertical: space[3], paddingHorizontal: space[4], borderWidth: 1, borderRadius: radius.md },
});
