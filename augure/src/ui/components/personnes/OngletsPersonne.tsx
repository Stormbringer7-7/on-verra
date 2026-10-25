// Onglets « Ses choix », « Dossiers » et « Déclarations » de la fiche personne (canevas :
// artboards Personne, Personne — ministre, Personne — déclarations). Les chiffres comparés passent
// par `IndicateurVue` (valeur, dénominateur, référence) ; les comptes publiés (amendements déposés…)
// restent des nombres ; les déclarations reprennent les rubriques HATVP telles que publiées, avec
// le lien vers le document original.

import { Linking, StyleSheet, View } from 'react-native';

import type { ChoixTheme, DeclarationHatvp, Indicateur, Page, QuestionResume, RoleDansLesDossiers, ScrutinResume } from '@/core';
import { useAller } from '@/navigation';
import { usePalette } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Action, Label, Repartition, T } from '../base';
import { IndicateurVue } from '../commun/IndicateurVue';
import { Source } from '../commun/Source';
import { aSynthese, aucuneSynthese } from '../commun/statuts';
import { SyntheseVue } from '../commun/SyntheseVue';
import { Avertissement, Badge, Carte, Ligne, TitreSection } from './elements';
import { jour, moisAnnee, nombre, valeursRubrique } from './regles';

// ---------- Ses choix ----------

export function OngletChoix({
  personne,
  indicateurs,
  note,
  themes,
  derniersEcarts,
}: {
  personne: string;
  indicateurs: Indicateur[];
  note: string | null;
  themes: ChoixTheme[];
  derniersEcarts: ScrutinResume[];
}) {
  return (
    <View style={{ gap: space[4] }}>
      {note && <T variant="lead">{note}</T>}
      {indicateurs.length > 0 && (
        <View style={styles.grille}>
          {indicateurs.map((i) => (
            <Carte key={i.libelle} style={styles.case}>
              <IndicateurVue indicateur={i} />
            </Carte>
          ))}
        </View>
      )}
      {aucuneSynthese(themes.map((t) => t.synthese)) && <SyntheseVue synthese={null} />}
      {themes.length > 0 ? (
        <View style={styles.grille}>
          {themes.map((t) => (
            <CarteTheme key={t.theme} theme={t} personne={personne} />
          ))}
        </View>
      ) : (
        <Avertissement>
          Aucun thème n’est encore attribué aux scrutins : ses choix ne peuvent pas être regroupés thème par thème.
        </Avertissement>
      )}
      {derniersEcarts.length > 0 && (
        <View>
          <TitreSection>Ses derniers votes à l’inverse de son groupe</TitreSection>
          {derniersEcarts.map((s) => (
            <LigneEcart key={s.id} scrutin={s} personne={personne} />
          ))}
        </View>
      )}
    </View>
  );
}

function CarteTheme({ theme: t, personne }: { theme: ChoixTheme; personne: string }) {
  const aller = useAller();
  const parties = [
    [t.decompte.pour, 'pour'],
    [t.decompte.contre, 'contre'],
    [t.decompte.abstention, t.decompte.abstention > 1 ? 'abstentions' : 'abstention'],
    [t.decompte.absences, t.decompte.absences > 1 ? 'absences' : 'absence'],
  ] as const;
  return (
    <Carte style={styles.case}>
      <T variant="heading">{t.theme}</T>
      <Repartition decompte={t.decompte} total={t.total} hauteur={8} />
      <T variant="caption" ton="inkMuted">
        {`${parties
          .filter(([n]) => n > 0)
          .map(([n, l]) => `${n} ${l}`)
          .join(' · ')} sur ${t.total}`}
      </T>
      <IndicateurVue indicateur={t.ecarts} />
      {aSynthese(t.synthese) && <SyntheseVue synthese={t.synthese} />}
      {t.dernierEcart && (
        <Action onPress={() => aller.pourquoiVote(t.dernierEcart!.id, personne)}>Pourquoi ce vote →</Action>
      )}
    </Carte>
  );
}

function LigneEcart({ scrutin: s, personne }: { scrutin: ScrutinResume; personne: string }) {
  const aller = useAller();
  return (
    <Ligne onPress={() => aller.pourquoiVote(s.id, personne)} accessibilityLabel={`Pourquoi ce vote : ${s.intitule}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Label>{`${s.chambre === 'AN' ? 'AN' : 'Sénat'} · scrutin n° ${s.numero} · ${jour(s.date)}`}</Label>
        <T>{s.enClair ?? s.intitule}</T>
        {s.dossier && (
          <T variant="caption" ton="inkMuted">
            {s.dossier.titre}
          </T>
        )}
      </View>
      <Label ton="signal">Pourquoi →</Label>
    </Ligne>
  );
}

// ---------- Dossiers ----------

export function OngletDossiers({ roles, questions }: { roles: RoleDansLesDossiers[]; questions: Page<QuestionResume> }) {
  const aller = useAller();
  return (
    <View style={{ gap: space[6] }}>
      <View>
        {roles.map((r) => (
          <Ligne
            key={`${r.type}-${r.libelle}`}
            onPress={r.dossier ? () => aller.dossier(r.dossier!.id) : undefined}
            accessibilityLabel={`${r.nombre} ${r.libelle}`}
          >
            <T variant="dataLarge" style={{ width: 72 }}>
              {nombre(r.nombre)}
            </T>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <T variant="heading">{r.libelle}</T>
              {r.detail && (
                <T variant="caption" ton="inkMuted">
                  {r.detail}
                </T>
              )}
            </View>
          </Ligne>
        ))}
        {roles.length === 0 && <T ton="inkMuted">Aucun rôle publié dans les dossiers nationaux.</T>}
      </View>
      <Questions questions={questions} />
    </View>
  );
}

const TYPES_QUESTION: Record<QuestionResume['type'], string> = {
  QG: 'Question au Gouvernement',
  QE: 'Question écrite',
  QOSD: 'Question orale sans débat',
};

function Questions({ questions }: { questions: Page<QuestionResume> }) {
  return (
    <View style={{ gap: space[2] }}>
      <TitreSection>Questions au Gouvernement</TitreSection>
      {questions.total !== null && <Label>{`${nombre(questions.total)} questions publiées`}</Label>}
      {questions.elements.map((q) => (
        <View key={q.id} style={styles.question}>
          <Label>{`${TYPES_QUESTION[q.type]} n° ${q.numero}${q.date ? ` · ${jour(q.date)}` : ''}`}</Label>
          <T variant="heading">{q.titre ?? 'Analyse non publiée'}</T>
          <T variant="caption" ton="inkMuted">
            {[q.rubrique, q.ministere, q.dateReponse ? `réponse le ${jour(q.dateReponse)}` : 'sans réponse publiée'].filter(Boolean).join(' · ')}
          </T>
          <Source provenance={q.provenance} compact />
        </View>
      ))}
      {questions.elements.length === 0 && <T ton="inkMuted">Aucune question publiée.</T>}
      <Avertissement>Le ministère est celui interrogé, tel que publié : l’AN ne publie pas la personne qui répond.</Avertissement>
    </View>
  );
}

// ---------- Déclarations ----------

export function OngletDeclarations({ declarations }: { declarations: DeclarationHatvp[] }) {
  return (
    <View style={{ gap: space[3] }}>
      <Avertissement>
        Nous reprenons uniquement ce que la HATVP publie. Un intérêt déclaré n’est pas un conflit d’intérêts établi.
      </Avertissement>
      {declarations.map((d) => (
        <Declaration key={d.id} declaration={d} />
      ))}
      {declarations.length === 0 && <T ton="inkMuted">Aucune déclaration publiée par la HATVP.</T>}
    </View>
  );
}

function Declaration({ declaration: d }: { declaration: DeclarationHatvp }) {
  const p = usePalette();
  const url = d.url ?? d.provenance.url;
  const dates = [
    d.dateDepot ? `Déposée en ${moisAnnee(d.dateDepot)}` : null,
    d.datePublication ? `publiée le ${jour(d.datePublication)}` : 'publiée',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Carte cernee>
      <View style={styles.entete}>
        <T variant="heading" style={{ flex: 1 }}>
          {d.libelle}
        </T>
        <Badge>{`HATVP · ${d.type}`}</Badge>
      </View>
      <T variant="caption" ton="inkMuted">
        {dates}
        {d.qualite ? ` · en qualité de ${d.qualite.toLowerCase()}` : ''}
      </T>
      <View accessibilityRole="list">
        {d.rubriques.map((r) => (
          <View key={r.rubrique} style={[styles.rubrique, { borderTopColor: p.line }]}>
            <T ton="inkMuted" style={{ flex: 1 }}>
              {r.libelle}
            </T>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {valeursRubrique(r).map((v, i) => (
                <T key={i} style={{ textAlign: 'right' }}>
                  {v}
                </T>
              ))}
            </View>
          </View>
        ))}
      </View>
      {url ? (
        <Action onPress={() => void Linking.openURL(url)} accessibilityLabel="Voir la déclaration originale, PDF publié par la HATVP">
          Voir la déclaration originale (PDF, HATVP) ↗
        </Action>
      ) : (
        <T variant="caption" ton="inkMuted">
          Document original non mis en ligne par la HATVP.
        </T>
      )}
      <Source provenance={d.provenance} compact />
    </Carte>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  case: { flexGrow: 1, flexBasis: 300, minWidth: 0 },
  question: { gap: 2, paddingVertical: space[2] },
  entete: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  rubrique: { flexDirection: 'row', gap: space[4], paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
