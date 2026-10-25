// Fiche d'une personne (canevas : artboards Personne, Personne — ministre, — élue locale,
// — déclarations) : en-tête (fonctions en cours, sources), puis l'onglet demandé : parcours (frise
// des fonctions avec leur source ; un mandat RNE n'est rattaché que par la revue humaine), ses
// choix (indicateurs comparés à son groupe), dossiers (rôles, questions au Gouvernement),
// déclarations HATVP. Une fiche RNE seule s'affiche « selon le RNE », jamais comme une personne.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { View } from 'react-native';

import { ConsulterPersonne, type EntetePersonne, type FichePersonne, type OngletPersonne } from '@/core';
import type { Pages } from '@/navigation';
import { Label, OngletsFiche, T } from '@/ui/components/base';
import { Signaler } from '@/ui/components/commun/Signaler';
import { Source } from '@/ui/components/commun/Source';
import { Chargement, Ecran, Erreur, Retour } from '@/ui/components/Ecran';
import { Avertissement, PuceFonction } from '@/ui/components/personnes/elements';
import { Frise } from '@/ui/components/personnes/Frise';
import { OngletChoix, OngletDeclarations, OngletDossiers } from '@/ui/components/personnes/OngletsPersonne';
import { titrePersonne } from '@/ui/components/personnes/regles';
import { useCommand } from '@/ui/hooks/core';

const ONGLETS: { cle: OngletPersonne; libelle: string }[] = [
  { cle: 'parcours', libelle: 'Parcours' },
  { cle: 'choix', libelle: 'Ses choix' },
  { cle: 'dossiers', libelle: 'Dossiers' },
  { cle: 'declarations', libelle: 'Déclarations' },
];

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function Personne() {
  const { id, onglet: initial } = useRoute<RouteProp<Pages, 'Personne'>>().params;
  // Sans onglet choisi : l'entrée minimale (`{ id }`), le dépôt rend le parcours.
  const [onglet, setOnglet] = useState<OngletPersonne | undefined>(initial);
  const fiche = useCommand(ConsulterPersonne(onglet ? { id, onglet } : { id }));
  const donnees = fiche.statut === 'erreur' ? undefined : fiche.donnees;
  const actif = onglet ?? 'parcours';

  return (
    <Ecran>
      <Retour libelle="PERSONNES" />
      {donnees && <Entete entete={donnees.entete} />}
      {donnees?.entete.identite !== 'fiche_rne' && (
        <OngletsFiche<OngletPersonne> label="Sections de la fiche" options={ONGLETS} valeur={actif} onChange={setOnglet} />
      )}
      {fiche.statut === 'erreur' ? (
        <Erreur message={fiche.message} onReessayer={fiche.recharger} />
      ) : fiche.statut === 'chargement' || !donnees ? (
        <Chargement />
      ) : (
        <Contenu fiche={donnees} />
      )}
      <Signaler cible={{ type: 'personne', id }} ecran={`Personne · ${actif}`} />
    </Ecran>
  );
}

function Entete({ entete }: { entete: EntetePersonne }) {
  const t = titrePersonne(entete);
  return (
    <View style={{ gap: 8 }}>
      {t.surtitre && <Label>{t.surtitre}</Label>}
      <T variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
        {t.nom}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {entete.enCours.map((f) => (
          <PuceFonction key={f.libelle} libelle={f.libelle} couleur={f.groupe?.couleur ?? null} />
        ))}
      </View>
      {t.mention && <Avertissement signe="⚠">{t.mention}</Avertissement>}
      <View style={{ gap: 2 }}>
        {entete.provenance.map((p) => (
          <Source key={`${p.systeme}-${p.idNatif}`} provenance={p} compact />
        ))}
      </View>
    </View>
  );
}

function Contenu({ fiche }: { fiche: FichePersonne }) {
  const c = fiche.contenu;
  switch (c.onglet) {
    case 'parcours':
      return (
        <Frise fonctions={c.fonctions} mandatsLocauxEnCours={c.mandatsLocauxEnCours} identite={fiche.entete.identite} aujourdhui={aujourdhui()} />
      );
    case 'choix':
      return <OngletChoix personne={fiche.entete.id} indicateurs={c.indicateurs} note={c.note} themes={c.themes} derniersEcarts={c.derniersEcarts} />;
    case 'dossiers':
      return <OngletDossiers roles={c.roles} questions={c.questions} />;
    case 'declarations':
      return <OngletDeclarations declarations={c.declarations} />;
  }
}
