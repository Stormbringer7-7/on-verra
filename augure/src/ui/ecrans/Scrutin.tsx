// Un scrutin public, AN ou Sénat (canevas « Scrutin ») : ce qui est mis aux voix, le sens de
// « pour » et « contre » (synthèse), le résultat, l'hémicycle par position, la position de chaque
// groupe, ceux qui ont voté autrement que leur groupe (vers « Pourquoi ce vote »), le compte rendu.
// Query `ConsulterScrutin { id }`. L'intitulé officiel n'est rappelé que s'il diffère du titre ;
// sans synthèse ni pour « pour » ni pour « contre », une seule mention.

import { RouteProp, useRoute } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { ConsulterScrutin, type FicheScrutin, type PositionDeGroupe } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Pastille, Repartition, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { aucuneSynthese, PAS_DE_SYNTHESE } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/dossiers/BarreDossier';
import { Carte, Colonnes, LienExterne, Ligne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { Hemicycle } from '../components/dossiers/Hemicycle';
import { adresseAncre, CHAMBRE_COURTE, LIEU, partLigne, POSITION } from '../components/dossiers/presentation';
import { Ecran, Retour } from '../components/Ecran';
import { date, titreOfficielDistinct } from '../format';
import { useCommand } from '../hooks/core';
import { couleurVote, usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function Scrutin() {
  const { id } = useRoute<RouteProp<Pages, 'Scrutin'>>().params;
  const fiche = useCommand(ConsulterScrutin({ id }));
  return (
    <Ecran largeur="pleine">
      <Retour />
      <Requete resultat={fiche}>{(f) => <ContenuScrutin fiche={f} />}</Requete>
    </Ecran>
  );
}

function objet(f: FicheScrutin): string | null {
  const o = f.objet;
  switch (o.type) {
    case 'amendement':
      return `amendement n° ${o.amendement.numero}${o.article ? ` à l’art. ${o.article.numero}` : ''}`;
    case 'article':
      return o.division ?? (o.article ? `article ${o.article.numero}` : 'article');
    case 'texte':
      return 'ensemble du texte';
    case 'motion':
      return 'motion';
    case 'autre':
      return null;
  }
}

function ContenuScrutin({ fiche: f }: { fiche: FicheScrutin }) {
  const p = usePalette();
  const aller = useAller();
  const s = f.scrutin;
  const elus = s.chambre === 'AN' ? 'députés' : 'sénateurs';
  const verdict = s.adopte === null ? (s.sort ?? 'Sort non publié') : s.adopte ? 'Adopté' : 'Rejeté';
  const titre = s.enClair ?? s.intitule;
  const intituleOfficiel = titreOfficielDistinct(titre, s.intitule);

  return (
    <>
      {f.barre && <BarreDossierVue barre={f.barre} />}
      <View style={{ gap: space[2] }}>
        <Label>{[LIEU[s.chambre], date(s.date), `scrutin n° ${s.numero}`, objet(f)].filter(Boolean).join(' · ')}</Label>
        <TitreEcran>{titre}</TitreEcran>
        {intituleOfficiel && <T ton="inkMuted">{`Intitulé officiel : ${intituleOfficiel}`}</T>}
      </View>
      <Colonnes
        principale={
          <>
            <Carte>
              <Label>Ce que signifie le vote</Label>
              {aucuneSynthese([f.sens.pour, f.sens.contre]) ? (
                <T ton="inkMuted">{PAS_DE_SYNTHESE}</T>
              ) : (
                <>
                  <View style={styles.sens}>
                    <Label couleur={p.votePour}>+ POUR</Label>
                    <View style={{ flex: 1 }}>
                      <SyntheseVue synthese={f.sens.pour} />
                    </View>
                  </View>
                  <View style={styles.sens}>
                    <Label couleur={p.voteContre}>− CONTRE</Label>
                    <View style={{ flex: 1 }}>
                      <SyntheseVue synthese={f.sens.contre} />
                    </View>
                  </View>
                </>
              )}
            </Carte>
            <Section titre={verdict}>
              <View style={styles.totaux}>
                <T variant="data" couleur={p.votePour}>{`+ ${s.decompte.pour}`}</T>
                <T variant="data" couleur={p.voteContre}>{`− ${s.decompte.contre}`}</T>
                <T variant="data" couleur={p.voteAbstention}>{`Ø ${s.decompte.abstention}`}</T>
                {f.nonVotants > 0 && <T variant="data" ton="inkMuted">{`· ${f.nonVotants} non-votants`}</T>}
                <T variant="data" ton="inkMuted">{`· ${f.absents} absents`}</T>
              </View>
              <Hemicycle groupes={f.groupes} />
              <T variant="caption" ton="inkMuted">
                {`Un point par ${s.chambre === 'AN' ? 'député' : 'sénateur'} en mandat ce jour-là, groupes de la gauche vers la droite ; la place d’un point n’est pas son siège. « Absent » : en mandat, sans vote publié.`}
              </T>
            </Section>
            <Section titre="Qui a voté quoi">
              {f.groupes.map((g) => (
                <LigneGroupe key={g.groupe.id} groupe={g} />
              ))}
            </Section>
          </>
        }
        laterale={
          <>
            <Section titre="Ont voté autrement que leur groupe">
              <T ton="inkMuted">
                {`${f.votesDifferents.total} ${elus}, dans les groupes à majorité nette. Touchez un nom pour voir les éléments publics autour de son vote.`}
              </T>
              {f.votesDifferents.personnes.map((v) => (
                <Ligne key={v.personne.id} onPress={() => aller.pourquoiVote(s.id, v.personne.id)} accessibilityLabel={`Pourquoi ${v.personne.nom} a voté ainsi`}>
                  <View style={styles.personne}>
                    {v.personne.groupe?.couleur && <Pastille couleur={v.personne.groupe.couleur} taille={8} />}
                    <T style={{ flex: 1 }}>
                      {v.personne.nom}
                      <T ton="inkMuted">{v.personne.groupe ? ` · ${v.personne.groupe.libelle}` : ''}</T>
                    </T>
                    <Label couleur={couleurVote(p, v.position)}>{POSITION[v.position]}</Label>
                  </View>
                  <T variant="caption" ton="inkMuted">{`Ligne du groupe : ${POSITION[v.ligneDuGroupe]}`}</T>
                </Ligne>
              ))}
              {f.votesDifferents.total > f.votesDifferents.personnes.length && (
                <T variant="caption" ton="inkMuted">{`et ${f.votesDifferents.total - f.votesDifferents.personnes.length} autres`}</T>
              )}
            </Section>
            <View style={styles.sources}>
              <Source provenance={f.provenance} />
              {f.compteRendu && (
                <>
                  <LienExterne url={adresseAncre(f.compteRendu)}>{`Compte rendu · ${date(s.date)}`}</LienExterne>
                  <Source provenance={f.compteRendu.provenance} compact />
                </>
              )}
            </View>
            {s.dossier && <Action onPress={() => aller.dossier(s.dossier!.id)}>{`Dossier : ${s.dossier.titre} →`}</Action>}
            <Signaler cible={{ type: 'scrutin', id: s.id }} ecran="Scrutin" />
          </>
        }
      />
      <T variant="caption" ton="inkMuted">{`Scrutin public ${CHAMBRE_COURTE[s.chambre]} : les votes à main levée ne sont pas nominatifs et n’apparaissent pas ici.`}</T>
    </>
  );
}

/** Position d'un groupe : ligne majoritaire et sa part, barre pour / contre / abstention, absents. */
function LigneGroupe({ groupe: g }: { groupe: PositionDeGroupe }) {
  const p = usePalette();
  const part = partLigne(g);
  return (
    <Ligne>
      <View style={styles.personne}>
        <Pastille couleur={g.groupe.couleur ?? p.inkMuted} />
        <T style={{ flex: 1 }}>{g.groupe.libelle}</T>
        <Label couleur={g.ligne ? couleurVote(p, g.ligne) : p.inkMuted}>
          {g.ligne ? `${POSITION[g.ligne]} ${part} %` : 'Pas de ligne majoritaire'}
        </Label>
      </View>
      <Repartition decompte={g.decompte} total={g.membres} />
      <T variant="caption" ton="inkMuted">
        {`+ ${g.decompte.pour} · − ${g.decompte.contre} · Ø ${g.decompte.abstention}${g.nonVotants ? ` · ${g.nonVotants} non-votants` : ''} · ${g.absents} absents sur ${g.membres} membres`}
      </T>
    </Ligne>
  );
}

const styles = StyleSheet.create({
  sens: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  totaux: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  personne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  sources: { gap: space[2] },
});
