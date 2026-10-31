// Un scrutin public, AN ou Sénat (planche « Scrutin ») : lieu, date et numéro ; ce qui est mis aux
// voix en clair, le résultat publié ; les trois décomptes, la participation qui pousse ; puis trois
// onglets à icônes :
//   - Par groupe : une case par groupe (couleur, position, barre), la liste nominative et la
//     répartition détaillée (participation, cohésion, par département) ;
//   - Hémicycle (« Sénat » au Sénat) : cliquable et zoomable, coloré selon le mode choisi
//     (participation, représentation, pour et contre), avec sa légende ;
//   - Carte : vraie carte des circonscriptions à l'AN (même mode), des départements au Sénat.
// Ensuite les interventions reliées par la fiche (sur l'amendement voté, ou « de la séance sur ce
// texte » ; sinon « aucune intervention reliée »), « Ont voté autrement que leur groupe » et
// l'intitulé officiel qui se déplient, sources, dossier. Amendement de suppression (dispositif exact
// « Supprimer cet article. ») : « pour la suppression » et la conséquence sous le résultat
// (« L’article 1 reste dans le texte. ») ; aucune phrase sans cette règle sûre.
// Query `ConsulterScrutin { id }` ; tout le reste est calculé depuis ses votes nominatifs.
//
// `VoteMainLevee` (planche « Vote à main levée ») : la variante non nominative. Un vote à main levée
// n'a ni numéro ni décompte publié : il n'existe dans les données que comme sort d'un amendement.
// Query `ConsulterAmendement { id }` ; on le dit une fois, puis ce qui est connu et ce qui a été dit.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsulterAmendement, ConsulterScrutin, type FicheAmendement, type FicheScrutin } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Puce, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { aucuneSynthese, PAS_DE_SYNTHESE } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Carte, Colonnes, LienExterne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { Hemicycle } from '../components/dossiers/Hemicycle';
import { adresseAncre, CHAMBRE_COURTE, LIEU, sortAmendement } from '../components/dossiers/presentation';
import { parentInstitution, RACINES, sousLeDossier, type Parent } from '../ariane';
import { Ecran } from '../components/Ecran';
import { Puces } from '../components/fondations';
import { animerMiseEnPage, Apparition, BarreQuiPousse } from '../components/mouvement';
import { CarteCirconscriptionsScrutin } from '../components/scrutin/CarteCirconscriptionsScrutin';
import { CarteScrutin } from '../components/scrutin/CarteScrutin';
import { GrilleGroupes } from '../components/scrutin/Groupes';
import { Interventions, InterventionsAmendement, InterventionsScrutin } from '../components/scrutin/Interventions';
import { ListeNominative } from '../components/scrutin/ListeNominative';
import { ChoixMode, LegendeMode, type ModeCouleur } from '../components/scrutin/Modes';
import { OngletsIcones } from '../components/scrutin/Onglets';
import { Renvoi } from '../components/scrutin/Renvoi';
import { EcartsParGroupe, TableauRepartition } from '../components/scrutin/Repartition';
import { consequenceAmendement, consequenceSuppression, Fait, texteAuteurs, texteAvis } from '../components/scrutin/Faits';
import { compter, filtrer, HORS_DEPARTEMENT, type FiltreVotes, type MesureCarte } from '../repartition';
import { date, titreOfficielDistinct } from '../format';
import { useCommand } from '../hooks/core';
import { useAnimationsReduites } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

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

type Vue = 'groupe' | 'hemicycle' | 'carte';

/** Résultat publié en étiquette cernée (« Adopté », « Rejeté »). */
function Verdict({ children }: { children: string }) {
  const p = usePalette();
  return (
    <View style={[styles.verdict, { borderColor: p.inkSoft }]}>
      <T variant="label" ton="ink">
        {children}
      </T>
    </View>
  );
}

/** Un chiffre clé : grand nombre (couleur du vote) et ce qu'il compte. */
function Chiffre({ valeur, libelle, couleur }: { valeur: number; libelle: string; couleur?: string }) {
  const p = usePalette();
  return (
    <View style={[styles.chiffre, { backgroundColor: p.surfaceRaised }]} accessibilityLabel={`${valeur} ${libelle}`}>
      <T variant="dataLarge" couleur={couleur ?? p.ink}>{`${valeur}`}</T>
      <T variant="small" ton="inkSoft">
        {libelle}
      </T>
    </View>
  );
}

export function ContenuScrutin({ fiche: f }: { fiche: FicheScrutin }) {
  const p = usePalette();
  const aller = useAller();
  const reduites = useAnimationsReduites();
  const s = f.scrutin;
  const elus = s.chambre === 'AN' ? 'députés' : 'sénateurs';
  const verdict = s.adopte === null ? (s.sort ?? 'Sort non publié') : s.adopte ? 'Adopté' : 'Rejeté';
  const titre = s.enClair ?? s.intitule;
  const intituleOfficiel = titreOfficielDistinct(titre, s.intitule);
  const [vue, setVue] = useState<Vue>('hemicycle');
  const [mode, setMode] = useState<ModeCouleur>('pour_contre');
  const [ecartsOuverts, setEcartsOuverts] = useState(false);
  const [intituleOuvert, setIntituleOuvert] = useState(false);
  const [filtre, setFiltre] = useState<FiltreVotes>({ position: 'pour' });
  const [mesure, setMesure] = useState<MesureCarte>('pour');
  const changer = (modif: Partial<FiltreVotes>) => setFiltre((x) => ({ ...x, ...modif }));
  const deplier = (faire: () => void) => {
    animerMiseEnPage(reduites);
    faire();
  };
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

  // Participation : parlementaires en mandat ce jour-là (votes nominatifs, à défaut les groupes).
  const membres = f.votes.length || f.groupes.reduce((n, g) => n + g.membres, 0);
  const votants = Math.max(0, membres - f.absents);
  const ecart = Math.abs(s.decompte.pour - s.decompte.contre);
  const groupesRef = [...f.groupes].sort((a, b) => a.rang - b.rang).map((g) => g.groupe);
  const comptes = compter(f.votes);
  const amendement = f.objet.type === 'amendement' ? f.objet.amendement : null;
  const suppression = f.objet.type === 'amendement' && f.objet.suppression === true;
  const consequence = f.objet.type === 'amendement' ? consequenceSuppression(f.objet.suppression, f.objet.article?.numero, s.adopte) : null;
  const sur = suppression ? ' la suppression' : '';

  const onglets: { cle: Vue; libelle: string; icone: 'membres' | 'an' | 'senat' | 'carte' }[] = [
    { cle: 'groupe', libelle: 'Par groupe', icone: 'membres' },
    s.chambre === 'SENAT' ? { cle: 'hemicycle', libelle: 'Sénat', icone: 'senat' } : { cle: 'hemicycle', libelle: 'Hémicycle', icone: 'an' },
    { cle: 'carte', libelle: 'Carte', icone: 'carte' },
  ];

  return (
    <>
      {f.barre && <BarreDossierVue barre={f.barre} />}
      <Apparition>
        <View style={{ gap: space[2] }}>
          <Label>{[LIEU[s.chambre], date(s.date), `scrutin public n° ${s.numero}`, objet(f)].filter(Boolean).join(' · ')}</Label>
          <TitreEcran>{titre}</TitreEcran>
          <View style={styles.rangee}>
            <Verdict>{verdict}</Verdict>
            {consequence && <T ton="inkSoft">{consequence}</T>}
          </View>
        </View>
      </Apparition>
      <Colonnes
        principale={
          <>
            <Apparition rang={1}>
              <View style={styles.chiffres}>
                <Chiffre valeur={s.decompte.pour} libelle={`+ pour${sur}`} couleur={p.votePour} />
                <Chiffre valeur={s.decompte.contre} libelle={`− contre${sur}`} couleur={p.voteContre} />
                <Chiffre valeur={s.decompte.abstention} libelle="Ø abstentions" />
              </View>
            </Apparition>
            {membres > 0 && (
              <Apparition rang={2}>
                <View style={{ gap: 6 }}>
                  <View style={styles.entre}>
                    <T variant="small" ton="inkSoft">
                      Participation
                    </T>
                    <T variant="data">{`${votants} / ${membres} ${elus}`}</T>
                  </View>
                  <View style={[styles.piste, { backgroundColor: p.surfaceSunken }]} accessibilityRole="image" accessibilityLabel={`${votants} votants sur ${membres} ${elus}`}>
                    <BarreQuiPousse fraction={votants / membres} couleur={p.inkSoft} />
                  </View>
                  <T variant="caption" ton="inkMuted">
                    {`Écart : ${ecart} voix. ${f.absents} ${elus} absents${f.nonVotants ? `, ${f.nonVotants} non-votants` : ''}.`}
                  </T>
                </View>
              </Apparition>
            )}
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
            <OngletsIcones<Vue> label="Sections du scrutin" options={onglets} valeur={vue} onChange={setVue} />
            <Apparition key={vue}>
              {vue === 'groupe' && (
                <View style={styles.pile}>
                  <Section titre="Par groupe">
                    <GrilleGroupes groupes={f.groupes} choisirGroupe={(id) => changer({ groupe: id })} />
                    <T variant="caption" ton="inkMuted">
                      Fond sombre de la barre : membres absents. Position du groupe : sens majoritaire de ses votes exprimés. Touchez un groupe pour filtrer la liste.
                    </T>
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
                  <Section titre="Répartition détaillée">
                    <TableauRepartition
                      votes={selection}
                      groupes={f.groupes}
                      choisirGroupe={(id) => changer({ groupe: id })}
                      choisirDepartement={(code) => changer({ departement: code })}
                    />
                  </Section>
                </View>
              )}
              {vue === 'hemicycle' && (
                <View style={styles.pile}>
                  <ChoixMode mode={mode} choisir={setMode} />
                  <Hemicycle groupes={f.groupes} votes={f.votes} mode={mode} onPersonne={(id) => aller.personne(id)} />
                  <LegendeMode mode={mode} groupes={groupesRef} comptes={f.votes.length ? comptes : undefined} />
                  <T variant="caption" ton="inkMuted">
                    {`Un point par ${s.chambre === 'AN' ? 'député' : 'sénateur'} en mandat ce jour-là, groupes de la gauche vers la droite, puis dans l’ordre des sièges publiés (pas le plan exact de la salle). « Absent » : en mandat, sans vote publié.`}
                  </T>
                </View>
              )}
              {vue === 'carte' && (
                <View style={styles.pile}>
                  <CarteScrutin
                    chambre={s.chambre}
                    parCirconscription={
                      <CarteCirconscriptionsScrutin
                        scrutin={s.id}
                        mode={mode}
                        groupes={groupesRef}
                        onPersonne={(id) => aller.personne(id)}
                        onDepartement={(code) => changer({ departement: code })}
                      />
                    }
                    votes={pourLaCarte}
                    groupes={f.groupes}
                    mesure={mesure}
                    choisirMesure={setMesure}
                    mode={mode}
                    choisirMode={setMode}
                    onDepartement={(code) => changer({ departement: code })}
                  />
                  {s.chambre === 'AN' && (
                    <T variant="caption" ton="inkMuted">
                      Couleur d’une circonscription : celle de son député ce jour-là (sa position, ou son groupe selon le mode).
                    </T>
                  )}
                </View>
              )}
            </Apparition>
          </>
        }
        laterale={
          <>
            {f.interventions !== undefined ? (
              <InterventionsScrutin interventions={f.interventions} amendement={amendement?.id ?? null} />
            ) : (
              amendement && <InterventionsAmendement id={amendement.id} />
            )}
            <View>
              <Renvoi
                libelle="Ont voté autrement que leur groupe"
                valeur={`${f.votesDifferents.total}`}
                ouvert={ecartsOuverts}
                onPress={() => deplier(() => setEcartsOuverts((o) => !o))}
              />
              {ecartsOuverts && (
                <View style={styles.deplie}>
                  <T ton="inkMuted">
                    {`${f.votesDifferents.total} ${elus} sur l’ensemble du scrutin, dans les groupes à majorité nette. Ci-dessous, ceux de la sélection, groupe par groupe ; touchez un nom pour voir les éléments publics autour de son vote.`}
                  </T>
                  <EcartsParGroupe votes={selection} groupes={f.groupes} onPersonne={(id) => aller.pourquoiVote(s.id, id)} />
                </View>
              )}
              {intituleOfficiel && (
                <>
                  <Renvoi libelle="Intitulé officiel" ouvert={intituleOuvert} onPress={() => deplier(() => setIntituleOuvert((o) => !o))} />
                  {intituleOuvert && (
                    <View style={styles.deplie}>
                      <T couleur={p.inkQuote}>{intituleOfficiel}</T>
                    </View>
                  )}
                </>
              )}
              {amendement && <Renvoi libelle={`L’amendement ${amendement.numero}`} onPress={() => aller.amendement(amendement.id)} />}
            </View>
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

// ---------- Vote à main levée ----------

export function VoteMainLevee() {
  const { amendement } = useRoute<RouteProp<Pages, 'VoteMainLevee'>>().params;
  const fiche = useCommand(ConsulterAmendement({ id: amendement }));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  const parents: Parent[] = f
    ? [...sousLeDossier(f.barre.dossier, f.amendement.etape), { libelle: `Amendement ${f.amendement.numero}`, cible: { page: 'Amendement', params: { id: f.amendement.id } } }]
    : [RACINES.lois];
  return (
    <Ecran largeur="pleine" titre="Vote à main levée" parents={parents}>
      <Requete resultat={fiche}>{(f) => <ContenuMainLevee fiche={f} />}</Requete>
    </Ecran>
  );
}

export function ContenuMainLevee({ fiche: f }: { fiche: FicheAmendement }) {
  const p = usePalette();
  const aller = useAller();
  const a = f.amendement;
  if (f.vote.type !== 'main_levee') {
    const vote = f.vote;
    return (
      <View style={styles.pile}>
        <TitreEcran>{a.objet ?? `Amendement ${a.numero}`}</TitreEcran>
        <T ton="inkSoft">
          {vote.type === 'scrutin_public' ? 'Cet amendement a été mis aux voix par scrutin public : le vote est nominatif.' : 'Cet amendement n’a pas été mis aux voix à main levée.'}
        </T>
        {vote.type === 'scrutin_public' && <Action onPress={() => aller.scrutin(vote.scrutin.id)}>{`Scrutin n° ${vote.scrutin.numero} →`}</Action>}
        <Action onPress={() => aller.amendement(a.id)}>{`L’amendement ${a.numero} →`}</Action>
      </View>
    );
  }
  return (
    <>
      <BarreDossierVue barre={f.barre} />
      <Apparition>
        <View style={{ gap: space[2] }}>
          <Label>{[LIEU[a.chambre], f.dateSort ? date(f.dateSort) : null, 'vote à main levée'].filter(Boolean).join(' · ')}</Label>
          <TitreEcran>{a.objet ?? `Amendement ${a.numero}`}</TitreEcran>
          {a.objet === null && <T variant="caption" ton="inkMuted">Pas de synthèse disponible de l’objet.</T>}
          <View style={styles.rangee}>
            <Verdict>{sortAmendement(a.sort)}</Verdict>
            {consequenceAmendement(f) && <T ton="inkSoft">{consequenceAmendement(f)}</T>}
          </View>
        </View>
      </Apparition>
      <Colonnes
        principale={
          <>
            <Apparition rang={1}>
              <View style={[styles.nonNominatif, { borderColor: p.lineStrong }]}>
                <T variant="heading">Vote non nominatif</T>
                <T ton="inkSoft">
                  Le résultat est constaté à main levée : aucun décompte n’est publié, ni par élu ni par groupe. Il n’y a donc pas d’hémicycle ni de carte pour ce vote.
                </T>
                <T variant="caption" ton="inkMuted">
                  Un scrutin public (nominatif) n’a lieu qu’à la demande d’un groupe, du Gouvernement ou de la commission.
                </T>
              </View>
            </Apparition>
            <Apparition rang={2}>
              <Section titre="Ce que l’on sait">
                <View style={{ gap: space[2] }}>
                  <Fait libelle="Résultat" valeur={`${sortAmendement(a.sort)}, constaté à main levée${f.dateSort ? ` le ${date(f.dateSort)}` : ''}`} />
                  <Fait libelle="Auteurs" valeur={texteAuteurs(f)} />
                  <Fait libelle="Avis" valeur={texteAvis(f)} />
                </View>
              </Section>
            </Apparition>
            <Interventions extraits={f.discussions.extraits} total={f.discussions.total} amendement={a.id} />
          </>
        }
        laterale={
          <View>
            <Renvoi libelle={`L’amendement ${a.numero}`} onPress={() => aller.amendement(a.id)} />
            {f.provenance.url && <LienExterne url={f.provenance.url}>Page officielle de l’amendement</LienExterne>}
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  sens: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  sources: { gap: space[2] },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  verdict: { paddingVertical: 6, paddingHorizontal: space[3], borderWidth: 1, borderRadius: 2 },
  chiffres: { flexDirection: 'row', gap: space[2] },
  chiffre: { flex: 1, gap: space[1], paddingVertical: 14, paddingHorizontal: space[3], borderRadius: radius.lg },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  piste: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  pile: { gap: space[4] },
  deplie: { gap: space[2], paddingBottom: space[3] },
  nonNominatif: { gap: space[2], paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
});
