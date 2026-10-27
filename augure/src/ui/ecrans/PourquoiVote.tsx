// « Pourquoi ce vote » (canevas « Pourquoi ») : ce qui est public et sourcé autour du vote d'une
// personne sur un scrutin — son vote et celui de son groupe, ce qu'elle a dit avant, ce qu'elle a
// fait sur le dossier, ses votes sur le thème, son parcours, ses déclarations, le lobbying déclaré.
// Des faits rassemblés, jamais reliés par une causalité (`faitsDuVote`, tests).
// Query `ExpliquerVote { scrutin, personne }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { ExpliquerVote, type ActeSurLeDossier, type ExplicationVote } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, T } from '../components/base';
import { IndicateurVue } from '../components/commun/IndicateurVue';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Avertissement, Carte, Colonnes, LienExterne, Ligne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { ExtraitVue, ListeInterets } from '../components/dossiers/elements';
import { AVERTISSEMENT_POURQUOI, faitsDuVote, POSITION } from '../components/dossiers/presentation';
import { parentScrutin, RACINES, sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { date } from '../format';
import { useCommand } from '../hooks/core';
import { couleurVote, usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function PourquoiVote() {
  const { scrutin, personne } = useRoute<RouteProp<Pages, 'PourquoiVote'>>().params;
  const explication = useCommand(ExpliquerVote({ scrutin, personne }));
  const f = explication.statut === 'erreur' ? undefined : explication.donnees;
  const parents = f ? [...sousLeDossier(f.scrutin.dossier, f.scrutin.etape), parentScrutin(f.scrutin.id, `Scrutin n° ${f.scrutin.numero}`)] : [RACINES.lois];
  return (
    <Ecran largeur="pleine" titre={f?.personne.nom} parents={parents}>
      <Requete resultat={explication}>{(e) => <ContenuPourquoi explication={e} />}</Requete>
    </Ecran>
  );
}

function ContenuPourquoi({ explication: e }: { explication: ExplicationVote }) {
  const p = usePalette();
  const aller = useAller();
  const faits = faitsDuVote(e);
  return (
    <>
      {e.barre && <BarreDossierVue barre={e.barre} />}
      <View style={{ gap: space[2] }}>
        <Label>{`Scrutin n° ${e.scrutin.numero} · ${date(e.scrutin.date)} · ${e.scrutin.enClair ?? e.scrutin.intitule}`}</Label>
        <TitreEcran>{faits.titre}</TitreEcran>
        {e.personne.fonction && <T ton="inkMuted">{e.personne.fonction}</T>}
        <Avertissement>{AVERTISSEMENT_POURQUOI}</Avertissement>
      </View>
      <Colonnes
        principale={
          <>
            <Carte>
              <Label>Le vote</Label>
              <View style={styles.entreDeux}>
                <T variant="heading">{e.personne.nom}</T>
                <Label couleur={couleurVote(p, e.vote.position)}>{POSITION[e.vote.position]}</Label>
              </View>
              {e.groupe && (
                <View style={styles.entreDeux}>
                  <T ton="inkMuted">{`Son groupe (${e.groupe.groupe.libelle})`}</T>
                  <Label couleur={e.groupe.ligne ? couleurVote(p, e.groupe.ligne) : p.inkMuted}>
                    {e.groupe.ligne ? `${POSITION[e.groupe.ligne]}${e.groupe.partLigne !== null ? ` à ${e.groupe.partLigne} %` : ''}` : 'Pas de ligne'}
                  </Label>
                </View>
              )}
              <T>{faits.vote}</T>
              {faits.groupe && <T ton="inkMuted">{faits.groupe}</T>}
              {faits.memePosition && <T ton="inkMuted">{faits.memePosition}</T>}
              {/* Mise au point : publiée à côté du vote, qui n'est pas modifié. */}
              {faits.miseAuPoint && (
                <View style={{ gap: 2 }}>
                  <Label ton="signal">Mise au point</Label>
                  <T>{faits.miseAuPoint}</T>
                </View>
              )}
            </Carte>
            <Section titre="Ce qui a été dit avant le vote">
              {e.interventionsAvant.length === 0 && <T ton="inkMuted">Aucune intervention publiée sur ce sujet le jour du vote ou avant.</T>}
              {e.interventionsAvant.map((x) => (
                <ExtraitVue key={x.id} extrait={x} />
              ))}
            </Section>
            <Section titre="Ce qui a été fait sur ce dossier">
              {e.actes.length === 0 && <T ton="inkMuted">Aucun acte publié sur ce dossier.</T>}
              {e.actes.map((a, i) => (
                <LigneActe key={i} acte={a} />
              ))}
            </Section>
            <Section titre="Ses votes sur le même thème">
              {e.surLeTheme ? (
                <>
                  <Label>{e.surLeTheme.theme}</Label>
                  <T variant="data">
                    {`+ ${e.surLeTheme.decompte.pour} · − ${e.surLeTheme.decompte.contre} · Ø ${e.surLeTheme.decompte.abstention} · ${e.surLeTheme.decompte.absences} absences`}
                  </T>
                  <IndicateurVue indicateur={e.surLeTheme.ecarts} />
                  <SyntheseVue synthese={e.surLeTheme.synthese} titre="En clair" />
                </>
              ) : (
                <T ton="inkMuted">Aucun thème attribué aux dossiers pour l’instant : pas de regroupement de ses votes par thème.</T>
              )}
              <Action onPress={() => aller.personne(e.personne.id, 'choix')}>Tous ses choix →</Action>
            </Section>
          </>
        }
        laterale={
          <>
            <Section titre="Parcours">
              {e.parcours.length === 0 && <T ton="inkMuted">Aucune fonction publiée.</T>}
              {e.parcours.map((f, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <T>{f.organisation && !f.titre.includes(f.organisation.nom) ? `${f.titre} · ${f.organisation.nom}` : f.titre}</T>
                  <T variant="caption" ton="inkMuted">
                    {`${f.debut ? date(f.debut) : 'début inconnu'} → ${f.fin ? date(f.fin) : 'en cours'}${f.rattachement ? ` · rattaché par revue humaine : ${f.rattachement.motif}` : ''}`}
                  </T>
                  <Source provenance={f.provenance} compact />
                </View>
              ))}
            </Section>
            <Section titre="Intérêts déclarés">
              {e.declarations.declarations.length === 0 && <T ton="inkMuted">Aucune déclaration publiée.</T>}
              {e.declarations.declarations.map((d) => (
                <View key={d.id} style={{ gap: 2 }}>
                  <T>{`${d.libelle}${d.modificative ? ' (modificative)' : ''}`}</T>
                  <View style={styles.sources}>
                    <T variant="caption" ton="inkMuted">{d.datePublication ? `publiée le ${date(d.datePublication)}` : 'date de publication inconnue'}</T>
                    <LienExterne url={d.url}>HATVP</LienExterne>
                  </View>
                </View>
              ))}
              <SyntheseVue synthese={e.declarations.auTheme} titre="Au regard du sujet" />
              <Action onPress={() => aller.personne(e.personne.id, 'declarations')}>Voir les déclarations publiées →</Action>
            </Section>
            <Section titre="Lobbying déclaré sur ce sujet">
              <ListeInterets interets={e.lobbying} />
              <Avertissement glyphe="⚠">
                Actions déclarées auprès d’une catégorie de responsables publics, jamais d’une personne nommée. Rien n’indique un
                contact avec cette personne.
              </Avertissement>
            </Section>
            <Signaler cible={{ type: 'scrutin', id: e.scrutin.id }} ecran="PourquoiVote" />
          </>
        }
      />
    </>
  );
}

function LigneActe({ acte: a }: { acte: ActeSurLeDossier }) {
  const aller = useAller();
  const v = a.vers;
  const ouvrir = () =>
    v.type === 'etape' ? aller.etape(v.dossier, v.cle) : v.type === 'amendement' ? aller.amendement(v.id) : v.type === 'scrutin' ? aller.scrutin(v.id) : aller.dossier(v.id);
  return (
    <Ligne onPress={ouvrir}>
      <T>{a.libelle}</T>
      <Source provenance={a.provenance} compact />
    </Ligne>
  );
}

const styles = StyleSheet.create({
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
});
