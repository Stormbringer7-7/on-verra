// Classements (canevas : artboard « Personnes », vue Classements) : par chambre, écarts au groupe,
// absences ou positions, dans un ordre ou l'autre, sur les thèmes favoris. Chaque ligne dit sa
// valeur, sur combien, et par rapport à quoi (`resumeIndicateur`) ; le détail (`IndicateurVue`)
// se déplie, avec ce que la donnée ne dit pas. Les thèmes demandés sont ignorés tant qu'aucun
// thème n'est attribué aux scrutins : la réponse le dit (`themesAppliques` vide), l'écran aussi.

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ClasserPersonnes, type Chambre, type CritereClassement, type LigneClassement } from '@/core';
import { useAller } from '@/navigation';
import { useCommand } from '../../hooks/core';
import { usePalette } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Label, Pastille, Puce, T } from '../base';
import { IndicateurVue } from '../commun/IndicateurVue';
import { Chargement, Erreur } from '../Ecran';
import { Avertissement, Colonnes } from './elements';
import { jour, partIndicateur, resumeIndicateur } from './regles';

const CRITERES: { cle: CritereClassement; libelle: string }[] = [
  { cle: 'ecarts', libelle: 'Écarts' },
  { cle: 'absences', libelle: 'Absences' },
  { cle: 'positions', libelle: 'Positions' },
];

const ORDRES: Record<CritereClassement, { desc: string; asc: string }> = {
  ecarts: { desc: 'Plus d’écarts', asc: 'Plus alignés' },
  absences: { desc: 'Plus absents', asc: 'Plus présents' },
  positions: { desc: 'Plus souvent pour', asc: 'Plus souvent contre' },
};

const PHRASES: Record<CritereClassement, { desc: string; asc: string }> = {
  ecarts: { desc: 'votent le plus souvent à l’inverse de leur groupe', asc: 'sont les plus alignés sur leur groupe' },
  absences: { desc: 'sont le plus souvent absents', asc: 'sont les plus présents' },
  positions: { desc: 'votent le plus souvent pour', asc: 'votent le plus souvent contre' },
};

/** Thèmes favoris par défaut (canevas) ; envoyés tels quels, appliqués seulement s'ils existent. */
const THEMES_FAVORIS = ['energie', 'logement'];

export function Classements() {
  const [chambre, setChambre] = useState<Chambre>('AN');
  const [critere, setCritere] = useState<CritereClassement>('ecarts');
  const [ordre, setOrdre] = useState<'asc' | 'desc'>('desc');
  const [themes, setThemes] = useState<string[]>(THEMES_FAVORIS);
  const classement = useCommand(ClasserPersonnes({ chambre, critere, ordre, themes }));
  const donnees = classement.statut === 'erreur' ? undefined : classement.donnees;

  const filtres = (
    <>
      <Groupe libelle="Chambre">
        <Puce actif={chambre === 'AN'} onPress={() => setChambre('AN')}>
          Assemblée
        </Puce>
        <Puce actif={chambre === 'SENAT'} onPress={() => setChambre('SENAT')}>
          Sénat
        </Puce>
      </Groupe>
      <Groupe libelle="Classer par">
        {CRITERES.map((c) => (
          <Puce key={c.cle} actif={critere === c.cle} onPress={() => setCritere(c.cle)}>
            {c.libelle}
          </Puce>
        ))}
      </Groupe>
      <Groupe libelle="Ordre">
        {(['desc', 'asc'] as const).map((o) => (
          <Puce key={o} actif={ordre === o} onPress={() => setOrdre(o)}>
            {ORDRES[critere][o]}
          </Puce>
        ))}
      </Groupe>
      <Groupe libelle="Sur mes thèmes ★">
        {donnees && donnees.themesDisponibles.length > 0 ? (
          donnees.themesDisponibles.map((t) => {
            const actif = themes.includes(t.id);
            return (
              <Puce key={t.id} actif={actif} onPress={() => setThemes(actif ? themes.filter((x) => x !== t.id) : [...themes, t.id])}>
                {`${actif ? '★' : '☆'} ${t.libelle}`}
              </Puce>
            );
          })
        ) : (
          <T variant="caption" ton="inkMuted">
            Aucun thème n’est encore attribué aux scrutins : le classement porte sur tous les scrutins de la période.
          </T>
        )}
      </Groupe>
    </>
  );

  const resultats =
    classement.statut === 'erreur' ? (
      <Erreur message={classement.message} onReessayer={classement.recharger} />
    ) : !donnees ? (
      <Chargement />
    ) : (
      <View style={{ gap: space[4] }}>
        <T variant="lead">
          {`Les ${chambre === 'AN' ? 'députés' : 'sénateurs'} qui ${PHRASES[critere][ordre]}${
            donnees.themesAppliques.length ? ` sur ${donnees.themesAppliques.join(', ')}` : ''
          }, du ${jour(donnees.periode.debut)} au ${donnees.periode.fin ? jour(donnees.periode.fin) : 'aujourd’hui'}.`}
        </T>
        <View accessibilityRole="list">
          {donnees.lignes.map((l) => (
            <Rang key={l.personne.id} ligne={l} />
          ))}
          {donnees.lignes.length === 0 && <T ton="inkMuted">Aucun classement calculé pour cette demande.</T>}
        </View>
        <Avertissement>{donnees.explication}</Avertissement>
      </View>
    );

  return <Colonnes coteDabord cote={filtres} principal={resultats} />;
}

function Groupe({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{libelle}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
        {children}
      </ScrollView>
    </View>
  );
}

function Rang({ ligne }: { ligne: LigneClassement }) {
  const p = usePalette();
  const aller = useAller();
  const [ouvert, setOuvert] = useState(false);
  const r = resumeIndicateur(ligne.indicateur);
  const part = partIndicateur(ligne.indicateur);
  return (
    <View style={[styles.rang, { borderBottomColor: p.line }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${ligne.rang}. ${ligne.personne.nom} : ${r.valeur} ${r.denominateur} ; ${r.reference}`}
        onPress={() => aller.personne(ligne.personne.id, 'choix')}
        style={styles.ligne}
      >
        <T variant="data" ton={ligne.rang <= 3 ? 'signal' : 'inkMuted'} style={{ width: 28 }}>
          {String(ligne.rang).padStart(2, '0')}
        </T>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T variant="heading">{ligne.personne.nom}</T>
          {ligne.personne.groupe && (
            <View style={styles.groupe}>
              <Pastille couleur={ligne.personne.groupe.couleur ?? p.lineStrong} taille={8} />
              <T variant="caption" ton="inkMuted">
                {ligne.personne.groupe.libelle}
              </T>
            </View>
          )}
        </View>
        <View style={styles.valeur}>
          <T variant="data">{r.valeur}</T>
          <T variant="caption" ton="inkMuted">
            {r.denominateur}
          </T>
          <View style={[styles.jauge, { backgroundColor: p.surfaceSunken }]}>
            <View style={{ width: `${Math.round(part * 100)}%`, height: 4, backgroundColor: p.signal }} />
          </View>
        </View>
      </Pressable>
      <T variant="caption" ton="inkMuted">
        {`Par rapport à : ${r.reference}`}
      </T>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={() => setOuvert(!ouvert)} style={styles.deplier}>
        <Label ton="signal">{ouvert ? 'Masquer le détail' : 'Détail de la mesure'}</Label>
      </Pressable>
      {ouvert && <IndicateurVue indicateur={ligne.indicateur} />}
    </View>
  );
}

const styles = StyleSheet.create({
  puces: { gap: 6, alignItems: 'center' },
  rang: { paddingVertical: 10, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  groupe: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valeur: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: 160 },
  jauge: { width: 72, height: 4 },
  deplier: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
