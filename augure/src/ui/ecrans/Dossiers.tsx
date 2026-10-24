// Onglet Dossiers (canevas « Dossiers ») : les dossiers de la législature, filtrés par état et par
// origine (et par thème quand des thèmes seront attribués : facette vide, filtre masqué). Chaque
// ligne montre la barre compacte du parcours et le dernier acte publié. Query `ListerDossiers`.

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ListerDossiers, type DossierResume, type Facette, type FiltreDossiers } from '@/core';
import { useAller } from '../../navigation';
import { Label, Puce, T } from '../components/base';
import { Ecran } from '../components/Ecran';
import { PointsParcours } from '../components/dossiers/BarreDossier';
import { Avertissement, Colonnes, Ligne, Pagination, Requete, TitreEcran } from '../components/dossiers/blocs';
import { entreeDossiers, etatDossier } from '../components/dossiers/presentation';
import { date, titreOfficielDistinct } from '../format';
import { useCommand } from '../hooks/core';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export function Dossiers() {
  const [filtre, setFiltre] = useState<FiltreDossiers>({});
  const liste = useCommand(ListerDossiers(entreeDossiers(filtre)));
  // Un changement de filtre repart de la première page.
  const choisir = <K extends 'etat' | 'origine' | 'theme'>(cle: K, valeur: FiltreDossiers[K] | undefined) =>
    setFiltre((f) => ({ ...f, [cle]: valeur, page: undefined }));

  return (
    <Ecran largeur="pleine">
      <View style={{ gap: space[1] }}>
        <TitreEcran>Dossiers législatifs</TitreEcran>
        <T ton="inkMuted">Chaque loi, du dépôt au Journal officiel. Amendements, votes et débats sont rangés dans leur dossier.</T>
      </View>
      <Requete resultat={liste}>
        {(l) => (
          <Colonnes
            principale={
              <View style={{ gap: space[2] }}>
                <Label>{`${l.dossiers.total ?? l.dossiers.elements.length} dossier${(l.dossiers.total ?? 0) > 1 ? 's' : ''} · ${l.legislature}e législature`}</Label>
                {l.dossiers.elements.length === 0 && <T ton="inkMuted">Aucun dossier pour ces filtres.</T>}
                {l.dossiers.elements.map((d) => (
                  <LigneDossier key={d.id} dossier={d} />
                ))}
                <Pagination {...l.dossiers} onPage={(page) => setFiltre((f) => ({ ...f, page }))} />
                <Avertissement>
                  Barre de parcours : une case par étape de la procédure, de la gauche vers la droite. Étape faite en clair,
                  étape actuelle en rouge, à venir éteinte ; les étapes qui n’auront pas lieu ne sont pas dessinées.
                </Avertissement>
              </View>
            }
            laterale={
              <View style={{ gap: space[4] }}>
                <Filtre titre="Où en est le texte" facettes={l.facettes.etats} valeur={filtre.etat} onChange={(v) => choisir('etat', v)} />
                <Filtre titre="Qui l’a proposé" facettes={l.facettes.origines} valeur={filtre.origine} onChange={(v) => choisir('origine', v)} />
                {/* Aucun thème attribué dans canon pour l'instant : la facette est vide, le filtre masqué. */}
                {l.facettes.themes.length > 0 && (
                  <Filtre titre="Thème" facettes={l.facettes.themes} valeur={filtre.theme} onChange={(v) => choisir('theme', v)} />
                )}
              </View>
            }
          />
        )}
      </Requete>
    </Ecran>
  );
}

function Filtre<V extends string>({
  titre,
  facettes,
  valeur,
  onChange,
}: {
  titre: string;
  facettes: Facette<V>[];
  valeur: V | undefined;
  onChange(v: V | undefined): void;
}) {
  return (
    <View style={{ gap: space[2] }}>
      <Label>{titre}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
        <Puce actif={valeur === undefined} onPress={() => onChange(undefined)}>
          Tous
        </Puce>
        {facettes.map((f) => (
          <Puce key={f.valeur} actif={valeur === f.valeur} onPress={() => onChange(f.valeur)} accessibilityLabel={`${f.libelle} : ${f.nombre}`}>
            {`${f.libelle} · ${f.nombre}`}
          </Puce>
        ))}
      </ScrollView>
    </View>
  );
}

function LigneDossier({ dossier: d }: { dossier: DossierResume }) {
  const p = usePalette();
  const aller = useAller();
  return (
    <Ligne onPress={() => aller.dossier(d.id)} accessibilityLabel={`Dossier ${d.titre}`}>
      <View style={styles.entete}>
        <Label style={{ flexShrink: 1 }}>{[d.type, d.theme].filter(Boolean).join(' · ')}</Label>
        <Label couleur={d.etat === 'en_cours' ? p.signal : d.etat === 'adopte' ? p.ink : p.inkMuted}>{etatDossier(d.etat)}</Label>
      </View>
      <T variant="heading" style={{ fontSize: 17, lineHeight: 23 }}>
        {d.titreEnClair ?? d.titre}
      </T>
      {d.titreEnClair !== null && titreOfficielDistinct(d.titreEnClair, d.titreOfficiel) && (
        <T variant="caption" ton="inkMuted">{d.titreOfficiel}</T>
      )}
      {d.barre.length > 0 ? (
        <PointsParcours cases={d.barre} />
      ) : (
        <T variant="caption" ton="inkMuted">Pas de barre de parcours pour ce type de texte.</T>
      )}
      <T variant="caption" ton="inkMuted">
        {d.dernierEvenement
          ? `${d.dernierEvenement.libelle} · ${date(d.dernierEvenement.date)}`
          : (d.etapeCourante?.libelle ?? 'Aucun acte publié')}
      </T>
      {d.prochaineEcheance && (
        <T variant="caption" ton="signal">{`Prochaine échéance : ${d.prochaineEcheance.libelle} · ${date(d.prochaineEcheance.date)}`}</T>
      )}
    </Ligne>
  );
}

const styles = StyleSheet.create({
  puces: { gap: 6 },
  entete: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
});
