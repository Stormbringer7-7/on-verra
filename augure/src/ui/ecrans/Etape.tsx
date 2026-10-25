// Une case du parcours (canevas « Étape » et page « Les étapes des deux dossiers ») : en clair,
// chiffres, ce que l'étape a changé (article ← amendement, avec le statut de l'attribution), votes,
// « Qui intervient » avec un extrait de ce qui a été dit, documents officiels, étapes voisines.
// Query `ConsulterEtape { dossier, cle }`. Sans aucune synthèse pour les changements, la mention
// « Pas de synthèse disponible » est faite une fois pour la section, pas sous chaque article.

import { RouteProp, useRoute } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { ConsulterEtape, type ChangementEtape, type FicheEtape, type Intervenant } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, BoutonSecondaire, Label, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { aSynthese, aucuneSynthese } from '../components/commun/statuts';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/dossiers/BarreDossier';
import { Carte, Colonnes, LienExterne, Ligne, ListeChiffres, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { ExtraitVue, LigneScrutin, OrateurVue, OrigineVue } from '../components/dossiers/elements';
import { casesVisibles, ETAT_CASE, LIEU, titreOrigine, TYPE_DOCUMENT } from '../components/dossiers/presentation';
import { Ecran, Retour } from '../components/Ecran';
import { date } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function Etape() {
  const { dossier, cle } = useRoute<RouteProp<Pages, 'Etape'>>().params;
  const fiche = useCommand(ConsulterEtape({ dossier, cle }));
  return (
    <Ecran largeur="pleine">
      <Retour />
      <Requete resultat={fiche}>{(f) => <ContenuEtape fiche={f} />}</Requete>
    </Ecran>
  );
}

function ContenuEtape({ fiche: f }: { fiche: FicheEtape }) {
  const p = usePalette();
  const aller = useAller();
  const c = f.case;
  const dossier = f.barre.dossier.id;
  const sur = casesVisibles(f.barre.cases).length;
  const statut = [
    ETAT_CASE[c.etat],
    c.debut ? `${c.fin && c.fin !== c.debut ? `du ${date(c.debut)} au ${date(c.fin)}` : `le ${date(c.debut)}`}` : null,
    c.conclusion,
    c.programmeeLe ? `programmée le ${date(c.programmeeLe)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <BarreDossierVue barre={f.barre} />
      <View style={{ gap: space[2] }}>
        <Label>{`Étape ${f.numero} sur ${sur}${f.organe ? ` · ${f.organe.nom}` : c.lieu ? ` · ${LIEU[c.lieu]}` : ''}`}</Label>
        <TitreEcran>{c.libelle}</TitreEcran>
        <Label couleur={c.courante ? p.signal : p.ink}>{statut}</Label>
        {c.programmeeLe && <T variant="caption" ton="inkMuted">Date inscrite à l’ordre du jour : une échéance, pas un acte accompli.</T>}
      </View>
      <Colonnes
        principale={
          <>
            <Carte>
              <SyntheseVue synthese={f.resume} titre="En clair" />
            </Carte>
            {f.chiffres.length > 0 && <ListeChiffres chiffres={f.chiffres} />}
            {f.changements.length > 0 && (
              <Section titre="Ce que cette étape a changé">
                {aucuneSynthese(f.changements.map((ch) => ch.resume)) && <SyntheseVue synthese={null} titre="En clair" />}
                {f.changements.map((ch, i) => (
                  <LigneChangement key={`${ch.article.id}-${i}`} changement={ch} />
                ))}
              </Section>
            )}
            {f.votes.length > 0 && (
              <Section titre="Votes de l’étape">
                {f.votes.map((s) => (
                  <LigneScrutin key={s.id} scrutin={s} />
                ))}
              </Section>
            )}
            <View style={styles.voisines} accessibilityLabel="Étapes voisines">
              {f.precedente && (
                <BoutonSecondaire onPress={() => aller.etape(dossier, f.precedente!.cle)}>{`← ${f.precedente.libelle}`}</BoutonSecondaire>
              )}
              {f.suivante && (
                <BoutonSecondaire onPress={() => aller.etape(dossier, f.suivante!.cle)}>{`${f.suivante.libelle} →`}</BoutonSecondaire>
              )}
            </View>
          </>
        }
        laterale={
          <>
            <Section titre="Qui intervient">
              {f.quiIntervient.intervenants.length === 0 && <T ton="inkMuted">Aucune prise de parole publiée pour cette étape.</T>}
              {f.quiIntervient.intervenants.map((it, i) => (
                <LigneIntervenant key={i} intervenant={it} />
              ))}
              {f.quiIntervient.total > 0 && (
                <Action onPress={() => aller.discussions({ type: 'etape', dossier, cle: c.cle })}>
                  {`Toutes les interventions (${f.quiIntervient.total}) →`}
                </Action>
              )}
            </Section>
            <Section titre="Documents officiels">
              {f.documents.length === 0 && <T ton="inkMuted">Aucun document publié pour l’instant.</T>}
              {f.documents.map((d) => (
                <View key={d.id} style={{ gap: 4 }}>
                  <T>{`${d.titre}${d.date ? ` · ${date(d.date)}` : ''}`}</T>
                  <View style={styles.sources}>
                    <Label style={{ fontSize: 10 }}>{TYPE_DOCUMENT[d.type]}</Label>
                    <LienExterne url={d.url}>Lire</LienExterne>
                    <Source provenance={d.provenance} compact />
                  </View>
                </View>
              ))}
            </Section>
            {c.provenance.length > 0 && (
              <View style={{ gap: 4 }}>
                <Label>Ce qui établit l’étape</Label>
                {c.provenance.map((s) => (
                  <Source key={`${s.systeme}-${s.idNatif}`} provenance={s} />
                ))}
              </View>
            )}
            <Signaler cible={{ type: 'etape', id: `${dossier}/${c.cle}` }} ecran="Etape" />
          </>
        }
      />
    </>
  );
}

/** Article modifié et origine du changement : l'amendement n'est nommé que si l'attribution est vérifiée. */
function LigneChangement({ changement: ch }: { changement: ChangementEtape }) {
  const aller = useAller();
  return (
    <Ligne>
      <Action onPress={() => aller.article(ch.article.id)}>{`Art. ${ch.article.numero} · ${titreOrigine(ch.origine)} →`}</Action>
      {aSynthese(ch.resume) && <SyntheseVue synthese={ch.resume} />}
      <OrigineVue origine={ch.origine} />
    </Ligne>
  );
}

/** Une ligne de « Qui intervient » : l'orateur, son nombre de prises de parole, un extrait. */
function LigneIntervenant({ intervenant: it }: { intervenant: Intervenant }) {
  return (
    <View style={{ gap: 4 }}>
      {it.extrait ? (
        <ExtraitVue extrait={it.extrait} />
      ) : (
        <Ligne>
          <OrateurVue orateur={it.orateur} groupe={it.groupe} />
          <T variant="caption" ton="inkMuted">Aucun extrait publié.</T>
        </Ligne>
      )}
      <Label>{`${it.interventions} prise${it.interventions > 1 ? 's' : ''} de parole dans l’étape`}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  voisines: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[2] },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
});
