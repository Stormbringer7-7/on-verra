// Un amendement (canevas « Amendement ») : ce qu'il change (diff sur l'article visé), pourquoi
// l'auteur le propose (exposé officiel, synthèse), ce qui a été dit, auteur et cosignataires, avis
// (publiés au Sénat, pas à l'AN), mode de vote, intérêts déclarés rapprochés avec leur statut.
// Query `ConsulterAmendement { id }`.

import { RouteProp, useRoute } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { ConsulterAmendement, type FicheAmendement } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { Action, Label, Pastille, T } from '../components/base';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { SyntheseVue } from '../components/commun/SyntheseVue';
import { BarreDossierVue } from '../components/commun/RappelDossier';
import { Avertissement, Carte, Colonnes, Ligne, Requete, Section, TitreEcran } from '../components/dossiers/blocs';
import { DiffTexte, ExtraitVue, LigneScrutin, ListeInterets } from '../components/dossiers/elements';
import { nomAuteur, personneAuteur, sortAmendement, texteDuHtml } from '../components/dossiers/presentation';
import { sousLeDossier } from '../ariane';
import { Ecran } from '../components/Ecran';
import { date } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

const EMETTEUR = { rapporteur: 'Rapporteur', commission: 'Commission', gouvernement: 'Gouvernement' } as const;

export function Amendement() {
  const { id } = useRoute<RouteProp<Pages, 'Amendement'>>().params;
  const fiche = useCommand(ConsulterAmendement({ id }));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  return (
    <Ecran largeur="pleine" titre={f ? `Amendement ${f.amendement.numero}` : undefined} parents={sousLeDossier(f?.barre.dossier, f?.amendement.etape)}>
      <Requete resultat={fiche}>{(f) => <ContenuAmendement fiche={f} />}</Requete>
    </Ecran>
  );
}

function ContenuAmendement({ fiche: f }: { fiche: FicheAmendement }) {
  const p = usePalette();
  const aller = useAller();
  const a = f.amendement;
  const auteur = personneAuteur(a.auteur);
  const contexte = [`Amendement ${a.numero}`, a.etape?.libelle, a.division ?? (a.article ? `Article ${a.article.numero}` : null)]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <BarreDossierVue barre={f.barre} />
      <View style={{ gap: space[2] }}>
        <Label>{contexte}</Label>
        <TitreEcran>{a.objet ?? `Amendement ${a.numero}`}</TitreEcran>
        {a.objet === null && <T variant="caption" ton="inkMuted">Pas de synthèse disponible de l’objet.</T>}
        <Label ton="ink">
          {`${sortAmendement(a.sort)}${f.dateSort ? ` · ${date(f.dateSort)}` : ''}${f.dateDepot ? ` · déposé le ${date(f.dateDepot)}` : ''}`}
        </Label>
      </View>
      <Colonnes
        principale={
          <>
            <Carte>
              <Label>Ce que l’amendement change</Label>
              {f.dispositif.diff ? (
                <DiffTexte segments={f.dispositif.diff} />
              ) : f.dispositif.texte ? (
                <>
                  <T style={{ fontSize: 17, lineHeight: 26 }}>{texteDuHtml(f.dispositif.texte)}</T>
                  <T variant="caption" ton="inkMuted">Dispositif tel que publié : le texte de l’article visé n’est pas chargé.</T>
                </>
              ) : (
                <T ton="inkMuted">Dispositif non publié.</T>
              )}
              {a.article && (
                <Action onPress={() => aller.article(a.article!.id)}>{`Voir l’article ${a.article.numero} version par version →`}</Action>
              )}
            </Carte>
            <Section titre="Pourquoi l’auteur le propose">
              <Carte contour>
                <SyntheseVue synthese={f.exposeEnClair} titre="Résumé en clair" />
              </Carte>
              <View style={[styles.citation, { borderLeftColor: p.lineStrong }]}>
                <Label>Exposé des motifs · extrait officiel</Label>
                <T>{f.expose ? `« ${f.expose} »` : 'Exposé des motifs non publié.'}</T>
                <Source provenance={f.provenance} />
              </View>
            </Section>
            <Section titre="Ce qui a été dit">
              {f.discussions.extraits.length === 0 && <T ton="inkMuted">Aucune intervention reliée à cet amendement.</T>}
              {f.discussions.extraits.map((e) => (
                <ExtraitVue key={e.id} extrait={e} />
              ))}
              {f.discussions.total > 0 && (
                <Action onPress={() => aller.discussions({ type: 'amendement', id: a.id })}>
                  {`Texte intégral des ${f.discussions.total} interventions →`}
                </Action>
              )}
            </Section>
          </>
        }
        laterale={
          <>
            <Section titre="Auteur et cosignataires">
              <Ligne onPress={auteur ? () => aller.personne(auteur.id) : undefined}>
                <View style={styles.personne}>
                  {auteur?.groupe?.couleur && <Pastille couleur={auteur.groupe.couleur} />}
                  <T variant="heading" style={{ flex: 1 }}>{nomAuteur(a.auteur)}</T>
                  <T variant="caption" ton="inkMuted">{`Auteur${auteur?.groupe ? ` · ${auteur.groupe.libelle}` : ''}`}</T>
                </View>
              </Ligne>
              {f.cosignataires.personnes.map((c) => (
                <Ligne key={c.id} onPress={() => aller.personne(c.id)}>
                  <View style={styles.personne}>
                    {c.groupe?.couleur && <Pastille couleur={c.groupe.couleur} />}
                    <T style={{ flex: 1 }}>{c.nom}</T>
                    <T variant="caption" ton="inkMuted">{c.fonction ?? 'Cosignataire'}</T>
                  </View>
                </Ligne>
              ))}
              {f.cosignataires.total > f.cosignataires.personnes.length && (
                <T variant="caption" ton="inkMuted">
                  {`${f.cosignataires.personnes.length ? 'et ' : ''}${f.cosignataires.total - f.cosignataires.personnes.length} ${f.cosignataires.personnes.length ? 'autres ' : ''}cosignataires${f.cosignataires.groupes.length ? ` (${f.cosignataires.groupes.map((g) => g.libelle).join(', ')})` : ''}`}
                </T>
              )}
            </Section>
            <Carte contour>
              <Label>Avis et vote</Label>
              {f.avis.publies ? (
                f.avis.liste.map((av, i) => (
                  <View key={i} style={styles.avis}>
                    <T ton="inkMuted">{EMETTEUR[av.emetteur]}</T>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T>{av.libelle ?? av.avis}</T>
                      <Source provenance={av.provenance} compact />
                    </View>
                  </View>
                ))
              ) : (
                <T variant="caption" ton="inkMuted">Avis du rapporteur et du Gouvernement : non publiés en données structurées par l’Assemblée.</T>
              )}
              <View style={styles.avis}>
                <T ton="inkMuted">Vote</T>
                <T>{f.vote.type === 'scrutin_public' ? 'Scrutin public' : f.vote.type === 'main_levee' ? 'À main levée' : 'Pas mis aux voix'}</T>
              </View>
              {f.vote.type === 'main_levee' && <T variant="caption" ton="inkMuted">Vote à main levée : pas de liste nominative publiée.</T>}
              {f.vote.type === 'scrutin_public' && <LigneScrutin scrutin={f.vote.scrutin} />}
            </Carte>
            <Section titre="Intérêts déclarés sur ce sujet">
              <ListeInterets interets={f.interets} />
              {f.interets.length > 0 && (
                <Avertissement glyphe="⚠">Un rapprochement n’établit ni contact avec l’auteur, ni influence sur l’amendement.</Avertissement>
              )}
            </Section>
            <Signaler cible={{ type: 'amendement', id: a.id }} ecran="Amendement" />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  citation: { borderLeftWidth: 2, paddingLeft: 14, gap: 6 },
  personne: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avis: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4] },
});
