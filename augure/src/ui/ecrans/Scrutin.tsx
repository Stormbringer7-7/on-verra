// Un scrutin public, AN ou Sénat (canevas « Scrutin ») : ce qui est mis aux voix, le sens de
// « pour » et « contre » (synthèse), le résultat, l'hémicycle par position, puis l'étude de la
// répartition des voix sur une même sélection (groupe, département, nom) : carte des départements,
// liste nominative par position, tableau par groupe ou par département (participation, cohésion),
// écarts à la ligne de chaque groupe (vers « Pourquoi ce vote »), le compte rendu.
// Query `ConsulterScrutin { id }` ; tout le reste est calculé depuis ses votes nominatifs. L'intitulé officiel n'est rappelé que s'il diffère du titre ;
// sans synthèse ni pour « pour » ni pour « contre », une seule mention.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsulterScrutin, type FicheScrutin } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Puce, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { aucuneSynthese, PAS_DE_SYNTHESE } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Carte, Colonnes, LienExterne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { Hemicycle } from '../components/dossiers/Hemicycle';
import { adresseAncre, CHAMBRE_COURTE, LIEU } from '../components/dossiers/presentation';
import { parentInstitution, RACINES, sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { Puces } from '../components/fondations';
import { CarteCirconscriptionsScrutin } from '../components/scrutin/CarteCirconscriptionsScrutin';
import { CarteScrutin } from '../components/scrutin/CarteScrutin';
import { ListeNominative } from '../components/scrutin/ListeNominative';
import { EcartsParGroupe, TableauRepartition } from '../components/scrutin/Repartition';
import { filtrer, HORS_DEPARTEMENT, type FiltreVotes, type MesureCarte } from '../repartition';
import { date, titreOfficielDistinct } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function Scrutin() {
  const { id } = useRoute<RouteProp<Pages, 'Scrutin'>>().params;
  const fiche = useCommand(ConsulterScrutin({ id }));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  // Un scrutin hors dossier (motion, déclaration du Gouvernement) se range sous sa chambre.
  const parents = !f ? [RACINES.lois] : f.scrutin.dossier ? sousLeDossier(f.scrutin.dossier, f.scrutin.etape) : [RACINES.elus, parentInstitution(f.scrutin.chambre === 'SENAT' ? 'senat' : 'an', f.scrutin.chambre === 'SENAT' ? 'Sénat' : 'Assemblée nationale')];
  return (
    <Ecran largeur="pleine" titre={f ? `Scrutin n° ${f.scrutin.numero}` : undefined} parents={parents}>
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
  const [filtre, setFiltre] = useState<FiltreVotes>({ position: 'pour' });
  const [mesure, setMesure] = useState<MesureCarte>('pour');
  const changer = (modif: Partial<FiltreVotes>) => setFiltre((x) => ({ ...x, ...modif }));
  // La sélection : groupe, département, nom (toutes positions) ; la carte ignore le département choisi.
  const selection = filtrer(f.votes, { ...filtre, position: null });
  const pourLaCarte = filtrer(f.votes, { ...filtre, position: null, departement: null });
  const departement =
    filtre.departement === HORS_DEPARTEMENT
      ? 'Hors département'
      : filtre.departement
        ? (f.votes.find((v) => v.departement?.code === filtre.departement)?.departement?.nom ?? filtre.departement)
        : null;
  const groupe = filtre.groupe ? f.groupes.find((g) => g.groupe.id === filtre.groupe)?.groupe.libelle ?? 'Sans groupe' : null;

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
              <Hemicycle groupes={f.groupes} votes={f.votes} onPersonne={(id) => aller.personne(id)} />
              <T variant="caption" ton="inkMuted">
                {`Un point par ${s.chambre === 'AN' ? 'député' : 'sénateur'} en mandat ce jour-là, groupes de la gauche vers la droite, puis dans l’ordre des sièges publiés (pas le plan exact de la salle). « Absent » : en mandat, sans vote publié.`}
              </T>
            </Section>
            <Section titre="Sur la carte">
              <CarteScrutin
                chambre={s.chambre}
                parCirconscription={
                  <CarteCirconscriptionsScrutin scrutin={s.id} onPersonne={(id) => aller.personne(id)} onDepartement={(code) => changer({ departement: code })} />
                }
                votes={pourLaCarte}
                groupes={f.groupes}
                mesure={mesure}
                choisirMesure={setMesure}
                onDepartement={(code) => changer({ departement: code })}
              />
            </Section>
            {(departement || groupe || filtre.recherche) && (
              <Puces label="Sélection">
                {groupe && (
                  <Puce actif onPress={() => changer({ groupe: null })} accessibilityLabel={`Retirer le filtre ${groupe}`}>
                    {`${groupe} ×`}
                  </Puce>
                )}
                {departement && (
                  <Puce actif onPress={() => changer({ departement: null })} accessibilityLabel={`Retirer le filtre ${departement}`}>
                    {`${departement} ×`}
                  </Puce>
                )}
                {filtre.recherche ? (
                  <Puce actif onPress={() => changer({ recherche: null })} accessibilityLabel="Retirer la recherche">
                    {`« ${filtre.recherche} » ×`}
                  </Puce>
                ) : null}
              </Puces>
            )}
            <Section titre="Qui a voté quoi">
              <ListeNominative votes={f.votes} groupes={f.groupes} filtre={filtre} changer={changer} onPersonne={(id) => aller.personne(id)} />
            </Section>
            <Section titre="Répartition des voix">
              <TableauRepartition
                votes={selection}
                groupes={f.groupes}
                choisirGroupe={(id) => changer({ groupe: id })}
                choisirDepartement={(code) => changer({ departement: code })}
              />
            </Section>
          </>
        }
        laterale={
          <>
            <Section titre="Ont voté autrement que leur groupe">
              <T ton="inkMuted">
                {`${f.votesDifferents.total} ${elus} sur l’ensemble du scrutin, dans les groupes à majorité nette. Ci-dessous, ceux de la sélection, groupe par groupe ; touchez un nom pour voir les éléments publics autour de son vote.`}
              </T>
              <EcartsParGroupe votes={selection} groupes={f.groupes} onPersonne={(id) => aller.pourquoiVote(s.id, id)} />
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

const styles = StyleSheet.create({
  sens: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  totaux: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  sources: { gap: space[2] },
});
