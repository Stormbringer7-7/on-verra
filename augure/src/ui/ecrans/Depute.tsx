import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConsulterDepute, type Decompte, type FicheDepute, type VoteDepute } from '@/core';
import { useAller, type Pages } from '@/navigation';
import { BoutonSecondaire, Label, Panneau, Pastille, T } from '@/ui/components/base';
import { Chargement, Ecran, Erreur, Retour, Source } from '@/ui/components/Ecran';
import { date, mois, pluriel } from '@/ui/format';
import { useCommand } from '@/ui/hooks/core';
import { libelleScrutin } from '@/ui/natures';
import { couleurVote, LIBELLE_VOTE, usePalette } from '@/ui/theme/ThemeProvider';
import { fonts, space, type Palette } from '@/ui/theme/tokens';
import { couleurVerdict, verdictTheme, type Verdict } from '@/ui/verdicts';

const AUTRES = 'Autres';
const VOTES_PAR_PAGE = 20;

export function Depute() {
  const { acteur, legislature } = useRoute<RouteProp<Pages, 'Depute'>>().params;
  const fiche = useCommand(ConsulterDepute({ acteur, legislature }));

  return (
    <Ecran section="assemblee">
      <Retour libelle={fiche.statut === 'pret' && fiche.donnees.groupe ? fiche.donnees.groupe.abrege.toUpperCase() : 'RETOUR'} />
      {fiche.statut === 'erreur' ? (
        <Erreur message={fiche.message} onReessayer={fiche.recharger} />
      ) : fiche.statut === 'chargement' ? (
        <Chargement />
      ) : (
        <Contenu fiche={fiche.donnees} />
      )}
      <Source precision="tous les scrutins publics (textes, articles, amendements, motions) · écart : vote différent de la majorité de son groupe au moment du vote · thèmes attribués d'après le titre" />
    </Ecran>
  );
}

interface CarteTheme {
  theme: string;
  votes: VoteDepute[];
  decompte: Decompte;
  absences: number;
  ecarts: VoteDepute[];
  verdict: Verdict;
}

function cartes(votes: VoteDepute[]): CarteTheme[] {
  const parTheme = new Map<string, VoteDepute[]>();
  for (const v of votes) parTheme.set(v.theme, [...(parTheme.get(v.theme) ?? []), v]);
  return [...parTheme.entries()]
    .map(([theme, vs]) => {
      const decompte = { pour: 0, contre: 0, abstention: 0 };
      let absences = 0;
      for (const v of vs) {
        if (v.position === 'pour' || v.position === 'contre' || v.position === 'abstention') decompte[v.position]++;
        else if (v.position === 'absent') absences++;
      }
      return { theme, votes: vs, decompte, absences, ecarts: vs.filter((v) => v.ecart), verdict: verdictTheme(decompte, absences) };
    })
    // « Autres » (titre non reconnu) en dernier, sinon les thèmes les plus votés d'abord.
    .sort((a, b) => (a.theme === AUTRES ? 1 : b.theme === AUTRES ? -1 : b.votes.length - a.votes.length));
}

function phrase(c: CarteTheme): string {
  if (c.verdict === 'PEU PRÉSENT') return `Absent sur ${c.absences} des ${pluriel(c.votes.length, 'scrutin')} de ce thème.`;
  const dernier = c.ecarts[c.ecarts.length - 1];
  if (!dernier) return 'A toujours voté comme son groupe sur ce thème.';
  const quand = mois(dernier.scrutin.date).toLowerCase();
  return c.ecarts.length === 1
    ? `Une fois à l’inverse de son groupe : « ${libelleScrutin(dernier.scrutin)} » (${quand}).`
    : `${c.ecarts.length} fois à l’inverse de son groupe, la dernière : « ${libelleScrutin(dernier.scrutin)} » (${quand}).`;
}

function Contenu({ fiche }: { fiche: FicheDepute }) {
  const p = usePalette();
  const { bilan: b } = fiche;
  const themes = useMemo(() => cartes(fiche.votes), [fiche.votes]);
  const [ouvert, setOuvert] = useState<string | null>(themes[0]?.theme ?? null);
  const lieu = [fiche.groupe?.libelle, fiche.departement && `${fiche.departement}${fiche.circonscription ? `, ${fiche.circonscription}e circ.` : ''}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <View style={{ gap: space[2] }}>
        <T variant="display">{`${fiche.prenom} ${fiche.nom}`}</T>
        <View style={styles.ligne}>
          {fiche.groupe && <Pastille couleur={fiche.groupe.couleur ?? p.inkMuted} />}
          <T ton="inkMuted" style={{ flex: 1 }}>
            {lieu}
          </T>
        </View>
        {fiche.parcours.length > 1 && (
          <T variant="caption" ton="inkMuted">
            {'Groupes : ' +
              fiche.parcours.map((g) => `${g.groupe.abrege} ${g.fin ? `jusqu'au ${date(g.fin)}` : 'depuis le ' + date(g.debut)}`).join(', puis ')}
          </T>
        )}
      </View>

      {b.total === 0 ? (
        <T ton="inkMuted">Aucun scrutin public pendant ce mandat.</T>
      ) : (
        <>
          <T variant="lead">
            {'En 12 mois, sur '}
            <T variant="lead" style={styles.fort}>{pluriel(b.total, 'vote', 'votes')}</T>
            {', a voté '}
            <T variant="lead" style={styles.fort}>{`${b.commeGroupe} fois comme son groupe`}</T>
            {' et '}
            <T variant="lead" ton="signal" style={styles.fort}>{`${b.ecarts} fois autrement`}</T>
            {`. Absent ${b.absences} fois.`}
          </T>

          <View style={{ gap: space[3] }}>
            <T variant="heading" style={{ fontSize: 20, lineHeight: 24 }}>
              Ses choix, thème par thème
            </T>
            {themes.map((c) => (
              <Carte
                key={c.theme}
                carte={c}
                legislature={fiche.legislature}
                acteur={fiche.acteur}
                ouvert={ouvert === c.theme}
                onBasculer={() => setOuvert(ouvert === c.theme ? null : c.theme)}
                p={p}
              />
            ))}
          </View>
        </>
      )}
    </>
  );
}

function Carte({
  carte: c,
  acteur,
  ouvert,
  onBasculer,
  p,
}: {
  carte: CarteTheme;
  legislature: string;
  acteur: string;
  ouvert: boolean;
  onBasculer(): void;
  p: Palette;
}) {
  const aller = useAller();
  const [visibles, setVisibles] = useState(VOTES_PAR_PAGE);
  const n = c.votes.length;
  const segments = [
    { n: c.decompte.pour, couleur: p.votePour },
    { n: c.decompte.contre, couleur: p.voteContre },
    { n: c.decompte.abstention, couleur: p.voteAbstention },
    { n: c.absences, couleur: p.lineStrong },
  ].filter((s) => s.n);
  // La liste montre ses votes, du plus récent au plus ancien ; les absences sont comptées, pas listées.
  const recents = useMemo(() => c.votes.filter((v) => v.position !== 'absent').reverse(), [c.votes]);

  return (
    <Panneau style={{ gap: 10 }}>
      <View style={styles.entre}>
        <T variant="heading" style={{ fontSize: 18, lineHeight: 24, flex: 1 }}>
          {c.theme}
        </T>
        <Label couleur={couleurVerdict(p, c.verdict)}>{c.verdict}</Label>
      </View>
      <View style={[styles.barre, { backgroundColor: p.surfaceSunken }]} aria-hidden>
        {segments.map((s, i) => (
          <View key={i} style={{ width: `${(s.n / n) * 100}%`, backgroundColor: s.couleur }} />
        ))}
      </View>
      <T ton="inkMuted">
        {[
          c.decompte.pour && `${c.decompte.pour} pour`,
          c.decompte.contre && `${c.decompte.contre} contre`,
          c.decompte.abstention && pluriel(c.decompte.abstention, 'abstention'),
          c.absences && pluriel(c.absences, 'absence'),
        ]
          .filter(Boolean)
          .join(' · ') + ` sur ${pluriel(n, 'vote')}`}
      </T>
      <T style={{ fontSize: 15, lineHeight: 21 }}>{phrase(c)}</T>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={onBasculer} style={styles.bascule}>
        <Label ton="signal">{ouvert ? 'MASQUER LES VOTES' : `VOIR SES ${recents.length} VOTES`}</Label>
      </Pressable>
      {ouvert && (
        <View>
          {recents.slice(0, visibles).map((v) => {
            const absent = v.position === 'absent' || v.position === 'non_votant';
            return (
              <Pressable
                key={v.scrutin.uid}
                accessibilityRole="link"
                onPress={() => aller.scrutin(v.scrutin.uid, acteur)}
                style={[styles.vote, { borderTopColor: p.line }]}
              >
                <View style={styles.entre}>
                  <Label>{date(v.scrutin.date)}</Label>
                  <Label couleur={absent ? p.inkMuted : couleurVote(p, v.position)}>{LIBELLE_VOTE[v.position]}</Label>
                </View>
                <T>{libelleScrutin(v.scrutin)}</T>
                {v.ecart && v.ligneGroupe && (
                  <T ton="signal" style={{ fontSize: 13, lineHeight: 18 }}>
                    {`Son groupe a voté ${v.ligneGroupe === 'abstention' ? 'en s’abstenant' : v.ligneGroupe}.`}
                  </T>
                )}
              </Pressable>
            );
          })}
          {visibles < recents.length && (
            <BoutonSecondaire onPress={() => setVisibles(visibles + VOTES_PAR_PAGE * 2)}>
              {`VOIR ${Math.min(VOTES_PAR_PAGE * 2, recents.length - visibles)} DE PLUS`}
            </BoutonSecondaire>
          )}
          {c.absences > 0 && (
            <T variant="caption" ton="inkMuted" style={{ paddingTop: space[2] }}>
              {`${pluriel(c.absences, 'absence')} sur ce thème, non listée${c.absences > 1 ? 's' : ''}.`}
            </T>
          )}
        </View>
      )}
    </Panneau>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  fort: { fontFamily: fonts.sansSemiBold },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  barre: { flexDirection: 'row', height: 8, gap: 2, overflow: 'hidden' },
  bascule: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  vote: { gap: space[1], paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
