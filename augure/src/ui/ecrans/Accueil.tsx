// Accueil (canevas, « Accueil ») : la semaine au Parlement. Dossiers à suivre, chacun avec sa barre
// de parcours et sa prochaine échéance datée (ou son dernier acte publié) ; scrutins publics de la
// semaine dans les deux chambres ; accès aux autres onglets.

import { StyleSheet, View } from 'react-native';

import { ConsulterAccueil, type DossierResume } from '@/core';
import { useAller } from '../../navigation';
import { Action, Carte, Label, T, TitreEcran, TitreSection } from '../components/base';
import { BarreCompacte } from '../components/commun/BarreParcours';
import { Signaler } from '../components/commun/Signaler';
import { Chargement, Colonnes, Ecran, Erreur } from '../components/Ecran';
import { LigneScrutin } from '../components/LigneScrutin';
import { dateLongue, titreOfficielDistinct } from '../format';
import { statutDossier, suiteDossier, natureDossier } from '../libelles';
import { useCommand, useCore } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

function CarteDossier({ dossier: d }: { dossier: DossierResume }) {
  const p = usePalette();
  const aller = useAller();
  const statut = statutDossier(d);
  const suite = suiteDossier(d);
  // Titre en clair (synthèse) s'il existe, le titre officiel court sinon ; l'officiel toujours rappelé.
  const titre = d.titreEnClair ?? d.titre;
  const officiel = titreOfficielDistinct(titre, d.titreOfficiel);
  return (
    <Carte onPress={() => aller.dossier(d.id)} accessibilityLabel={`${titre}. ${statut?.libelle ?? ''}. ${suite ?? ''}`}>
      <View style={styles.carteEntete}>
        <Label style={styles.nature}>{natureDossier(d)}</Label>
        {statut && <Label couleur={p[statut.ton]}>{statut.libelle}</Label>}
      </View>
      <T variant="card">{titre}</T>
      {officiel && (
        <T variant="small" ton="inkMuted">
          {officiel}
        </T>
      )}
      <BarreCompacte cases={d.barre} />
      {suite && <T variant="small">{suite}</T>}
    </Carte>
  );
}

const EXPLORER = [
  { onglet: 'Dossiers', titre: 'Dossiers législatifs', aide: 'Suivre une loi du dépôt au Journal officiel' },
  { onglet: 'Personnes', titre: 'Personnes', aide: 'Députés, sénateurs, ministres : fonctions et choix' },
  { onglet: 'Institutions', titre: 'Institutions', aide: 'Assemblée, Sénat, Gouvernement, Conseil constitutionnel' },
] as const;

export function Accueil() {
  const aller = useAller();
  const { source } = useCore();
  const accueil = useCommand(ConsulterAccueil({}));

  if (accueil.statut === 'erreur') {
    return (
      <Ecran>
        <TitreEcran>Ce qui avance au Parlement</TitreEcran>
        <Erreur message={accueil.message} onReessayer={accueil.recharger} />
      </Ecran>
    );
  }
  const a = accueil.donnees;
  if (!a) {
    return (
      <Ecran>
        <TitreEcran>Ce qui avance au Parlement</TitreEcran>
        <Chargement />
      </Ecran>
    );
  }

  return (
    <Ecran>
      <TitreEcran surtitre={`Semaine du ${dateLongue(a.semaine.debut)}`}>Ce qui avance au Parlement</TitreEcran>
      <Colonnes
        principale={
          <>
            <TitreSection action={<Action onPress={() => aller.onglet('Dossiers')}>Tous les dossiers →</Action>}>
              Dossiers à suivre
            </TitreSection>
            {a.dossiers.length ? (
              <View style={styles.cartes}>
                {a.dossiers.map((d) => (
                  <CarteDossier key={d.id} dossier={d} />
                ))}
              </View>
            ) : (
              <T ton="inkMuted">Aucun dossier avec une échéance à venir.</T>
            )}
          </>
        }
        laterale={
          <>
            <View>
              <TitreSection>Votes de la semaine</TitreSection>
              {a.votes.length ? (
                a.votes.map((s) => <LigneScrutin key={s.id} scrutin={s} />)
              ) : (
                <T ton="inkMuted" style={styles.vide}>
                  Aucun scrutin public cette semaine, ni à l’Assemblée ni au Sénat.
                </T>
              )}
            </View>
            <View style={styles.explorer}>
              <TitreSection>Explorer</TitreSection>
              {EXPLORER.map((e) => (
                <Carte key={e.onglet} contour onPress={() => aller.onglet(e.onglet)}>
                  <T variant="heading">{e.titre} →</T>
                  <T variant="small" ton="inkMuted">
                    {e.aide}
                  </T>
                </Carte>
              ))}
            </View>
            <T variant="body" ton="inkMuted">
              {source === 'fixtures'
                ? 'Données fictives de maquette.'
                : 'Sources : Assemblée nationale, Sénat, Légifrance, Conseil constitutionnel, HATVP. Chaque fiche cite les siennes.'}
            </T>
            <Signaler cible={{ type: 'autre', id: null }} ecran="Accueil" />
          </>
        }
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteEntete: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
  nature: { flexShrink: 1 },
  cartes: { gap: space[3] },
  explorer: { gap: space[2] },
  vide: { paddingVertical: space[3] },
});
