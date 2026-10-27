// Onglet Actualité (canevas v4, « Accueil ») : ce qui a bougé au Parlement cette semaine. Dossiers à
// suivre, chacun avec sa barre de parcours et sa prochaine échéance datée (ou son dernier acte
// publié) ; scrutins publics de la semaine dans les deux chambres ; « Parcourir » mène aux listes
// (dossiers, personnes, institutions) et aux chiffres.

import { Pressable, StyleSheet, View } from 'react-native';

import { ConsulterAccueil, type DossierResume } from '@/core';
import { useAller } from '../../navigation';
import { Action, Carte, Label, Puce, T, TitreEcran, TitreSection } from '../components/base';
import { Puces } from '../components/fondations';
import { BarreCompacte } from '../components/commun/BarreParcours';
import { Signaler } from '../components/commun/Signaler';
import { evenementDe } from '../components/commun/statuts';
import { Chargement, Colonnes, Ecran, Erreur } from '../components/Ecran';
import { LigneScrutin } from '../components/LigneScrutin';
import { dateLongue, titreOfficielDistinct } from '../format';
import { statutDossier, suiteDossier, natureDossier } from '../libelles';
import { useCommand, useCore } from '../hooks/core';
import { useSuivis } from '../hooks/reglages';
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
      {d.parent && <T variant="caption" couleur={p.inkQuote}>{evenementDe(d.parent)}</T>}
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

/** « Suivis » (et leur nombre) en haut de l'Actualité : le seul accès en portrait, l'en-tête large en a un aussi. */
function BoutonSuivis() {
  const p = usePalette();
  const aller = useAller();
  const { dossiers, personnes } = useSuivis();
  const n = dossiers.length + personnes.length;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={n ? `Mes suivis : ${n}` : 'Mes suivis'}
      onPress={aller.suivis}
      style={[styles.suivis, { borderColor: p.lineFaint }]}
    >
      <Label ton="ink">Suivis</Label>
      {n > 0 && (
        <View style={[styles.compte, { backgroundColor: p.signal }]}>
          <T variant="caption" couleur={p.signalInk}>
            {n}
          </T>
        </View>
      )}
    </Pressable>
  );
}

/** « Parcourir » : les listes, empilées au-dessus de l'Actualité. */
function Parcourir() {
  const aller = useAller();
  const entrees = [
    { cle: 'faits', libelle: '✎ Tous les faits', aller: () => aller.explorer() },
    { cle: 'lois', libelle: '§ Lois', aller: aller.dossiers },
    { cle: 'personnes', libelle: '◐ Personnes et groupes', aller: () => aller.personnes() },
    { cle: 'institutions', libelle: '▥ Institutions', aller: () => aller.institutions() },
    { cle: 'territoires', libelle: '⌖ Territoires', aller: () => aller.onglet('Carte') },
  ];
  return (
    <View style={styles.parcourir}>
      <TitreSection>Parcourir</TitreSection>
      <Puces label="Parcourir">
        {entrees.map((e) => (
          <Puce key={e.cle} actif={false} onPress={e.aller}>
            {e.libelle}
          </Puce>
        ))}
      </Puces>
      <Action onPress={() => aller.onglet('Chiffres')}>Le Parlement en chiffres →</Action>
    </View>
  );
}

export function Accueil() {
  const aller = useAller();
  const { source } = useCore();
  const accueil = useCommand(ConsulterAccueil({}));

  if (accueil.statut === 'erreur') {
    return (
      <Ecran>
        <TitreEcran>Actualité</TitreEcran>
        <Erreur message={accueil.message} onReessayer={accueil.recharger} />
      </Ecran>
    );
  }
  const a = accueil.donnees;
  if (!a) {
    return (
      <Ecran>
        <TitreEcran>Actualité</TitreEcran>
        <Chargement />
      </Ecran>
    );
  }

  return (
    <Ecran>
      <View style={styles.titreLigne}>
        <View style={styles.entete}>
          <TitreEcran surtitre={`Semaine du ${dateLongue(a.semaine.debut)}`}>Actualité</TitreEcran>
          <T ton="inkSoft">Ce qui a bougé au Parlement cette semaine.</T>
        </View>
        <BoutonSuivis />
      </View>
      <Colonnes
        principale={
          <>
            <TitreSection action={<Action onPress={aller.dossiers}>Tous les dossiers →</Action>}>
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
            <Parcourir />
            <T variant="caption" ton="inkMuted">
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
  titreLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[4] },
  suivis: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: 14, borderRadius: 9999, borderWidth: 1 },
  compte: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  carteEntete: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
  nature: { flexShrink: 1 },
  cartes: { gap: space[3] },
  entete: { gap: space[2], flexShrink: 1 },
  parcourir: { gap: space[3] },
  vide: { paddingVertical: space[3] },
});
