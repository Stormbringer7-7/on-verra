// Une question au Gouvernement (QG), écrite (QE) ou orale sans débat (QOSD), planche « Question » :
// en-tête (type, numéro, analyse publiée, état), bande du cycle (posée → attribuée → réponse),
// bulle de la question (auteur, pastille de son groupe), bulle de la réponse (le ministère tel que
// publié, jamais la personne du ministre : l'AN ne la publie pas), rubrique et source. Une question
// écrite sans réponse est « en attente de réponse », jamais un échec ; ce que l'AN ne publie pas
// (date d'inscription d'une QOSD, séance d'une QOSD) est marqué « non publiée ». Une QG a ses
// « Questions de la même séance » : les autres QG du même jour (`memeSeance`, une séance de
// questions au Gouvernement par jour). Signalement : cible `question`.
// Query `ConsulterQuestion { id }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { Linking, StyleSheet, View } from 'react-native';

import { ConsulterQuestion, type FicheQuestion } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { parentPersonne, RACINES } from '../ariane';
import { T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { dureeLisible, joursEntre } from '../components/commun/statuts';
import { Requete } from '../components/dossiers/blocs';
import { LigneEtape, Lignes, Puce } from '../components/etape/blocs';
import { Ecran } from '../components/Ecran';
import { Icone } from '../components/Icone';
import { Apparition, Halo } from '../components/mouvement';
import { date, jourMois } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette, useStyles } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

export const TYPES_QUESTION: Record<FicheQuestion['type'], string> = {
  QG: 'Question au Gouvernement',
  QE: 'Question écrite',
  QOSD: 'Question orale sans débat',
};

export function Question() {
  const { id } = useRoute<RouteProp<Pages, 'Question'>>().params;
  const fiche = useCommand(ConsulterQuestion({ id }));
  const q = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  const parents = q?.auteur ? [RACINES.elus, parentPersonne(q.auteur.id, q.auteur.nom)] : [RACINES.elus];
  return (
    <Ecran largeur="lecture" titre={q ? `${TYPES_QUESTION[q.type]} n° ${q.numero}` : undefined} parents={parents}>
      <Requete resultat={fiche}>{(q) => <ContenuQuestion question={q} />}</Requete>
    </Ecran>
  );
}

// ---------- Règles ----------

/** État de la question en clair : la réponse et son lieu, l'attente, ou la clôture publiée. */
export function statutQuestion(q: FicheQuestion): string {
  if (q.statut === 'repondue') return q.type === 'QE' ? 'Réponse publiée au JO' : 'Réponse en séance';
  if (q.statut === 'close') return q.cloture?.libelle ?? 'Close sans réponse publiée';
  return 'En attente de réponse';
}

/** « le 12/05/2026 », « publiée le 12/06/2026 (19 semaines) », date marquée si non publiée. */
export function quandQuestion(q: FicheQuestion): string {
  if (q.statut === 'repondue') return q.dateReponse ? `le ${date(q.dateReponse)}` : 'date de réponse non publiée';
  if (q.statut === 'close') return q.cloture?.date ? `le ${date(q.cloture.date)}` : 'date de clôture non publiée';
  if (!q.date) return 'date de publication non publiée';
  const attente = dureeLisible(Math.max(0, joursEntre(q.date, q.jour)));
  return `${q.type === 'QE' ? 'publiée' : 'déposée'} le ${date(q.date)} (${attente})`;
}

export type RenduCycle = 'faite' | 'attendue' | 'inconnue';

export interface PasCycle {
  libelle: string;
  /** Date ou ministère sous le pas ; « [—] » si non publié. */
  detail: string;
  rendu: RenduCycle;
}

/** Cycle de vie publié, par type : chaque pas fait, attendu (prochain) ou non publié. */
export function cycleQuestion(q: FicheQuestion): PasCycle[] {
  const jour = (iso: string | null) => (iso ? jourMois(iso) : '[—]');
  const reponse = (libelle: string): PasCycle =>
    q.statut === 'repondue'
      ? { libelle, detail: jour(q.dateReponse), rendu: 'faite' }
      : q.statut === 'close'
        ? { libelle: q.cloture?.libelle ?? 'Close', detail: jour(q.cloture?.date ?? null), rendu: 'faite' }
        : { libelle, detail: '', rendu: 'attendue' };
  const pose = (libelle: string): PasCycle => ({ libelle, detail: jour(q.date), rendu: q.date ? 'faite' : 'inconnue' });
  switch (q.type) {
    case 'QG':
      return [pose('Posée en séance'), reponse('Réponse orale')];
    case 'QE': {
      const derniere = q.attributions[q.attributions.length - 1];
      const attribuee: PasCycle = q.ministereAttributaire
        ? { libelle: 'Attribuée', detail: derniere?.date ? jourMois(derniere.date) : '[—]', rendu: 'faite' }
        : { libelle: 'Attribuée', detail: '[—]', rendu: 'inconnue' };
      return [pose('Publiée au JO'), attribuee, reponse('Réponse au JO')];
    }
    case 'QOSD':
      // L'AN ne publie pas la date d'inscription à l'ordre du jour (ni dans la question, ni ailleurs
      // avec un lien vers elle) : « non publiée », jamais déduite de la date de réponse.
      return [pose('Déposée'), { libelle: 'Inscrite', detail: 'non publiée', rendu: q.statut === 'repondue' ? 'faite' : 'inconnue' }, reponse('Réponse orale')];
  }
}

/**
 * « Questions de la même séance » en clair : le nombre d'autres QG du jour, rien d'inventé quand la
 * donnée manque (fiche sans `memeSeance`) ; une QOSD n'a pas de séance publiée avec la question.
 */
export function detailMemeSeance(q: FicheQuestion): string {
  if (q.type !== 'QG') return 'séance non publiée avec la question';
  if (!q.memeSeance) return 'non publiées';
  const n = q.memeSeance.length;
  const jour = q.date ? ` le ${date(q.date)}` : '';
  return n === 0 ? `aucune autre question publiée${jour}` : `${n} autre${n > 1 ? 's' : ''} question${n > 1 ? 's' : ''} au Gouvernement${jour}`;
}

/** Ministère qui répond : l'attributaire publié, sinon l'interrogé ; jamais une personne. */
export const ministereQuestion = (q: FicheQuestion) => q.ministereAttributaire ?? q.ministereInterroge ?? 'Ministère non publié';

/** Texte de la réponse, ou ce qui en tient lieu. */
export function texteReponse(q: FicheQuestion): { texte: string; publie: boolean } {
  if (q.texteReponse) return { texte: q.texteReponse, publie: true };
  if (q.statut === 'repondue') return { texte: 'Réponse publiée, texte non disponible.', publie: false };
  if (q.statut === 'close') return { texte: 'Aucune réponse publiée.', publie: false };
  return { texte: 'Pas encore de réponse publiée.', publie: false };
}

/** Texte de la question ; QG : question et réponse sont publiées ensemble, dans le texte de la réponse. */
export function texteQuestion(q: FicheQuestion): { texte: string; publie: boolean } {
  if (q.texteQuestion) return { texte: q.texteQuestion, publie: true };
  if (q.type === 'QG' && q.texteReponse) return { texte: 'Question et réponse sont publiées ensemble : l’échange est dans la réponse ci-dessous.', publie: false };
  return { texte: 'Texte de la question non publié.', publie: false };
}

// ---------- Écran ----------

export function ContenuQuestion({ question: q }: { question: FicheQuestion }) {
  const p = usePalette();
  const aller = useAller();
  const chambre = q.chambre === 'AN' ? 'Assemblée' : 'Sénat';
  const cycle = cycleQuestion(q);
  const questionTexte = texteQuestion(q);
  const reponse = texteReponse(q);
  const auteur = q.auteur ? [q.auteur.nom, q.auteur.groupe?.abrege].filter(Boolean).join(' · ') : 'Auteur non relié';

  const blocs = [
    <View key="entete" style={{ gap: space[3] }}>
      <View style={styles.rangee}>
        <Icone nom="declaration" couleur={p.inkMuted} />
        <T variant="label" ton="inkMuted">{`${TYPES_QUESTION[q.type]} n° ${q.numero} · ${chambre}`}</T>
      </View>
      <T variant="screen" accessibilityRole="header">
        {q.titre ?? 'Analyse non publiée'}
      </T>
      <View style={[styles.rangee, { flexWrap: 'wrap', gap: space[3] }]}>
        <Puce>{statutQuestion(q)}</Puce>
        <T variant="small" ton="inkSoft" style={{ fontSize: 15 }}>
          {quandQuestion(q)}
        </T>
      </View>
    </View>,
    <Cycle key="cycle" pas={cycle} />,
    <Bulle
      key="question"
      couleur={q.auteur?.groupe?.couleur ?? p.lineStrong}
      qui={auteur}
      quoi="question"
      texte={questionTexte.texte}
      publie={questionTexte.publie}
      plein
    />,
    <Bulle key="reponse" couleur={p.voteAbstention} qui={ministereQuestion(q)} quoi="réponse" texte={reponse.texte} publie={reponse.publie} />,
    <T key="ministere" variant="caption" ton="inkMuted">
      Le ministère est celui interrogé ou chargé de répondre, tel que publié : l’AN ne publie pas la personne qui répond.
    </T>,
    <Lignes key="lignes">
      {q.auteur && <LigneEtape libelle={`Auteur · ${q.auteur.nom}`} detail={q.auteur.groupe?.libelle ?? null} onPress={() => aller.personne(q.auteur!.id)} />}
      {q.type !== 'QE' && <LigneEtape libelle="Questions de la même séance" detail={detailMemeSeance(q)} />}
      {q.type === 'QG' &&
        q.memeSeance?.map((m) => (
          <LigneEtape
            key={m.id}
            libelle={`n° ${m.numero} · ${m.titre ?? 'analyse non publiée'}`}
            detail={m.auteur ? [m.auteur.nom, m.auteur.groupe?.abrege].filter(Boolean).join(' · ') : 'auteur non relié'}
            onPress={() => aller.question(m.id)}
            accessibilityLabel={`Question n° ${m.numero}${m.titre ? ` : ${m.titre}` : ''}`}
          />
        ))}
      <LigneEtape libelle={`Rubrique · ${q.rubrique ?? '[—] non publiée'}`} />
      {q.attributions.length > 1 && (
        <LigneEtape
          libelle="Attributions successives"
          detail={q.attributions.map((a) => [a.ministere ?? 'ministère non publié', a.date ? date(a.date) : null].filter(Boolean).join(', ')).join(' ; ')}
        />
      )}
      <LigneEtape
        libelle="Page officielle de la question"
        detail={q.provenance.url ? (q.type === 'QE' ? 'avec sa publication au Journal officiel' : 'avec le texte publié au compte rendu') : 'adresse non publiée'}
        fin="↗"
        onPress={q.provenance.url ? () => void Linking.openURL(q.provenance.url!).catch(() => {}) : undefined}
        accessibilityLabel="Ouvrir la page officielle de la question"
      />
    </Lignes>,
    <View key="source" style={{ gap: space[3] }}>
      <Source provenance={q.provenance} />
      <Signaler cible={{ type: 'question', id: q.id }} ecran="Question" />
    </View>,
  ];

  return (
    <View style={{ gap: 18 }}>
      {blocs.map((b, i) => (
        <Apparition key={i} rang={Math.min(i, 4)}>
          {b}
        </Apparition>
      ))}
    </View>
  );
}

/** Bande du cycle : un point par pas (plein : fait ; signal et halo : attendu ; pointillé : non publié). */
function Cycle({ pas }: { pas: PasCycle[] }) {
  const p = usePalette();
  return (
    <View style={styles.cycle} accessibilityRole="image" accessibilityLabel={`Cycle : ${pas.map((s) => `${s.libelle}${s.rendu === 'attendue' ? ' (attendue)' : s.rendu === 'inconnue' ? ' (non publié)' : ''}`).join(', ')}`}>
      {pas.map((s, i) => (
        <View key={`${s.libelle}-${i}`} style={[styles.rangee, { flex: i === 0 ? 0 : 1, alignItems: 'flex-start', gap: 0 }]}>
          {i > 0 && <View style={[styles.traitCycle, { backgroundColor: s.rendu === 'faite' ? p.inkSoft : p.lineFaint }]} />}
          <View style={styles.pasCycle}>
            <View style={styles.point}>
              {s.rendu === 'attendue' && <Halo couleur={p.signal} taille={14} />}
              <View
                style={[
                  styles.disque,
                  s.rendu === 'faite' && { backgroundColor: p.inkSoft },
                  s.rendu === 'attendue' && { backgroundColor: p.signal },
                  s.rendu === 'inconnue' && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.lineStrong },
                ]}
              />
            </View>
            <T variant="caption" ton="inkSoft" style={styles.libelleCycle}>
              {s.libelle}
            </T>
            {s.detail ? (
              <T variant="data" ton="inkMuted" style={{ fontSize: 11, textAlign: 'center' }}>
                {s.detail}
              </T>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Bulle de la question ou de la réponse : qui (pastille), quoi, le texte tel que publié. */
function Bulle({ couleur, qui, quoi, texte, publie, plein = false }: { couleur: string; qui: string; quoi: string; texte: string; publie: boolean; plein?: boolean }) {
  const p = usePalette();
  const s = useStyles();
  return (
    <View
      style={[styles.bulle, plein ? { backgroundColor: p.surfaceRaised } : { borderWidth: 1, borderColor: p.line }]}
      accessibilityLabel={`${quoi === 'question' ? 'Question' : 'Réponse'} : ${qui}`}
    >
      <View style={styles.rangee}>
        <View style={[styles.pastille, { backgroundColor: couleur }]} />
        <T variant="heading" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
          {qui}
        </T>
        <T variant="data" ton="inkMuted" style={{ fontSize: 12 }}>
          {quoi}
        </T>
      </View>
      <T style={[publie ? s.citation : s.legende, publie && { fontSize: 15, lineHeight: 22 }]}>{texte}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cycle: { flexDirection: 'row', alignItems: 'flex-start' },
  traitCycle: { flex: 1, height: 2, marginTop: 6 },
  pasCycle: { width: 84, alignItems: 'center', gap: 6 },
  point: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  disque: { width: 14, height: 14, borderRadius: radius.full },
  libelleCycle: { fontSize: 12, lineHeight: 15, textAlign: 'center' },
  bulle: { gap: 6, paddingVertical: space[3], paddingHorizontal: 14, borderRadius: 12 },
  pastille: { width: 8, height: 8, borderRadius: radius.full },
});
