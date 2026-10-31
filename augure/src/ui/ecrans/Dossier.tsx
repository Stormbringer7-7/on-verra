// Fiche d'un dossier (maquette v3, planches « Dossier », « DossierTexte », « DossierAmendements »,
// « DossierTypes ») : en-tête « <type> · <dépositaire> », titre, statut « depuis le … (n jours) »,
// étiquettes (49.3, censure) ; onglets de sections selon le modèle de parcours (Parcours, Texte,
// Amendements, Scrutins clés, Acteurs pour une loi) ; l'onglet Parcours est l'aperçu : chiffres clés,
// « Ce qu'il propose », le rail, puis un aperçu de chaque section. À côté (en large) : sources
// officielles, le dossier en chiffres, intérêts déclarés, « Signaler ». Un dossier publié comme événement d'un autre (49.3,
// motion référendaire, prérogatives) s'affiche en sous-dossier (planche « SousDossier »).
// Une seule query `ConsulterDossier` ; seule la liste d'amendements est filtrée (sort) et paginée.

import { RouteProp, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { View } from 'react-native';

import { ConsulterDossier, type DeviationParcours, type FicheDossier, type SortAmendement } from '@/core';
import { useAller, type Pages } from '../../navigation';
import { parentDossier, parentEtape, RACINES } from '../ariane';
import { Label, T, TitreSection } from '../components/base';
import { FeuilleDeviation } from '../components/commun/FeuilleDeviation';
import { RailParcours } from '../components/commun/RailParcours';
import { Signaler } from '../components/commun/Signaler';
import { Source } from '../components/commun/Source';
import { Avertissement, Colonnes, ListeChiffres, Requete } from '../components/dossiers/blocs';
import { ListeInterets } from '../components/dossiers/elements';
import {
  ApercuActeurs,
  ApercuAmendements,
  ApercuTexte,
  ChiffresEtProposition,
  EnteteDossier,
  OngletsDossier,
  ScrutinsCles,
  SectionActeurs,
  SectionAmendements,
  SectionNonPubliee,
  SectionTexte,
} from '../components/dossiers/fiche';
import { SECTIONS_PUBLIEES, typeDossier, type SectionDossier } from '../components/dossiers/parcoursVue';
import { entreeDossier } from '../components/dossiers/presentation';
import { SousDossier } from '../components/dossiers/SousDossier';
import { Ecran } from '../components/Ecran';
import { animerMiseEnPage } from '../components/mouvement';
import { useCommand } from '../hooks/core';
import { useAnimationsReduites } from '../hooks/reglages';
import { space } from '../theme/tokens';

export function Dossier() {
  const { id } = useRoute<RouteProp<Pages, 'Dossier'>>().params;
  const [section, setSection] = useState<SectionDossier>('parcours');
  const [sort, setSort] = useState<SortAmendement | null>(null);
  const [page, setPage] = useState(1);
  const [deviation, setDeviation] = useState<DeviationParcours | null>(null);
  const reduites = useAnimationsReduites();
  const fiche = useCommand(ConsulterDossier(entreeDossier(id, sort, page)));
  const f = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  const parent = f?.parcours?.parent ?? null;
  const parents = parent
    ? [RACINES.lois, parentDossier(parent.dossier), ...(parent.etape && parent.etapeLibelle ? [parentEtape(parent.dossier.id, { cle: parent.etape, libelle: parent.etapeLibelle })] : [])]
    : [RACINES.lois];
  const choisir = (s: SectionDossier) => {
    animerMiseEnPage(reduites);
    setSection(s);
  };

  return (
    <Ecran largeur="pleine" titre={f?.entete.titre} parents={parents}>
      <Requete resultat={fiche}>
        {(f) => (
          <>
            <Colonnes
              principale={
                f.parcours?.parent ? (
                  <SousDossier fiche={f} />
                ) : (
                  <>
                    <EnteteDossier fiche={f} />
                    <OngletsDossier fiche={f} valeur={section} onChange={choisir} />
                    <Contenu
                      fiche={f}
                      section={section}
                      onSection={choisir}
                      onDeviation={setDeviation}
                      sort={sort}
                      onSort={(s) => {
                        setSort(s);
                        setPage(1);
                      }}
                      onPage={setPage}
                    />
                  </>
                )
              }
              laterale={<Laterale fiche={f} />}
            />
            <Feuille fiche={f} deviation={deviation} onFermer={() => setDeviation(null)} />
          </>
        )}
      </Requete>
    </Ecran>
  );
}

function Contenu(props: {
  fiche: FicheDossier;
  section: SectionDossier;
  onSection(s: SectionDossier): void;
  onDeviation(d: DeviationParcours): void;
  sort: SortAmendement | null;
  onSort(s: SortAmendement | null): void;
  onPage(p: number): void;
}) {
  const { fiche: f, section, onSection, onDeviation } = props;
  const sections = typeDossier(f.parcours?.modele).sections;
  switch (section) {
    case 'parcours':
      return (
        <>
          <ChiffresEtProposition fiche={f} />
          <SectionParcours fiche={f} onDeviation={onDeviation} />
          {sections.includes('texte') && <ApercuTexte fiche={f} onTout={() => onSection('texte')} />}
          {sections.includes('amendements') && <ApercuAmendements fiche={f} onTout={() => onSection('amendements')} />}
          {sections.includes('scrutins') && <ScrutinsCles fiche={f} onTout={() => onSection('scrutins')} />}
          {sections.includes('acteurs') && <ApercuActeurs fiche={f} onTout={() => onSection('acteurs')} />}
        </>
      );
    case 'texte':
      return <SectionTexte fiche={f} />;
    case 'amendements':
      return <SectionAmendements fiche={f} sort={props.sort} onSort={props.onSort} onPage={props.onPage} onDeviation={onDeviation} />;
    case 'scrutins':
      return <ScrutinsCles fiche={f} complet />;
    case 'acteurs':
      return <SectionActeurs fiche={f} titre="Acteurs" />;
    case 'membres':
      return <SectionActeurs fiche={f} titre="Membres" />;
    default:
      return SECTIONS_PUBLIEES.includes(section) ? null : <SectionNonPubliee section={section} />;
  }
}

function SectionParcours({ fiche: f, onDeviation }: { fiche: FicheDossier; onDeviation(d: DeviationParcours): void }) {
  const aller = useAller();
  const parcours = f.parcours;
  return (
    <View style={{ gap: space[3] }}>
      <TitreSection action={parcours ? <Label style={{ flexShrink: 1, textAlign: 'right' }}>{parcours.modele.libelle}</Label> : undefined}>
        Parcours
      </TitreSection>
      {parcours ? (
        <>
          <T variant="caption" ton="inkMuted">{parcours.modele.fondement}</T>
          <RailParcours
            parcours={parcours}
            etapes={f.etapes}
            onEtape={(cle) => aller.etape(f.entete.id, cle)}
            onDeviation={onDeviation}
            onDossier={aller.dossier}
          />
        </>
      ) : (
        <Avertissement>Pas de parcours publié pour ce dossier : ses étapes ne peuvent pas être montrées sur le rail.</Avertissement>
      )}
    </View>
  );
}

/** Feuille de l'événement ouvert depuis le rail ou la chronologie des amendements. */
function Feuille({ fiche: f, deviation, onFermer }: { fiche: FicheDossier; deviation: DeviationParcours | null; onFermer(): void }) {
  const aller = useAller();
  const parcours = f.parcours;
  if (!parcours) return null;
  return (
    <FeuilleDeviation
      deviation={deviation}
      dossier={{ id: f.entete.id, titre: f.entete.titre }}
      etape={parcours.cases.find((c) => c.cle === deviation?.etape) ?? null}
      rattache={parcours.enfants.find((e) => e.etape === deviation?.etape) ?? null}
      onFermer={onFermer}
      onEtape={() => {
        const cle = deviation!.etape;
        onFermer();
        aller.etape(f.entete.id, cle);
      }}
      onDossier={(id) => {
        onFermer();
        aller.dossier(id);
      }}
    />
  );
}

function Laterale({ fiche: f }: { fiche: FicheDossier }) {
  return (
    <>
      {f.chiffres.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Label>Le dossier en chiffres</Label>
          <ListeChiffres chiffres={f.chiffres} />
        </View>
      )}
      <View style={{ gap: space[2] }}>
        <Label>Sources officielles</Label>
        {f.sources.length === 0 && <T variant="small" ton="inkMuted">Aucune source publiée.</T>}
        {f.sources.map((s) => (
          <Source key={`${s.systeme}-${s.idNatif}`} provenance={s} />
        ))}
      </View>
      {f.interets.length > 0 && (
        <View style={{ gap: space[2] }}>
          <TitreSection>Intérêts déclarés</TitreSection>
          <Avertissement>
            Rapprochements : ces organisations ont déclaré à la HATVP des actions de représentation d’intérêts sur ce sujet pendant
            l’examen du texte. Cela n’établit ni une rencontre, ni une influence sur le texte.
          </Avertissement>
          <ListeInterets interets={f.interets} />
        </View>
      )}
      <Signaler cible={{ type: 'dossier', id: f.entete.id }} ecran="Dossier" />
    </>
  );
}
