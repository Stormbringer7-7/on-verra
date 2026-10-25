// Annuaire des personnes (canevas : artboard « Personnes », vue Annuaire) : recherche par nom,
// filtre par fonction actuelle (député, sénateur, Gouvernement, élu local), une ligne par personne
// avec la pastille de son groupe et le badge de sa source. Une fiche RNE seule s'affiche « selon le
// RNE », sans pastille : ce n'est pas une personne établie.

import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ListerPersonnes, type ElementAnnuaire, type RolePersonne } from '@/core';
import { useAller } from '@/navigation';
import { useCommand } from '../../hooks/core';
import { usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space } from '../../theme/tokens';
import { BoutonSecondaire, IconeRecherche, Label, Pastille, Puce, T } from '../base';
import { Chargement, Erreur } from '../Ecran';
import { Badge, Colonnes, Ligne } from './elements';
import { filtreAnnuaire, libelleEffectifs, nombre, presentationAnnuaire, ROLES } from './regles';

/** `role` : filtre initial (lien « Les 577 députés → » des Institutions). */
export function Annuaire({ role: initial }: { role?: RolePersonne } = {}) {
  const p = usePalette();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RolePersonne | 'tous'>(initial ?? 'tous');
  const [page, setPage] = useState(1);
  const filtre = filtreAnnuaire(role, q);
  const liste = useCommand(ListerPersonnes(page > 1 ? { ...filtre, page } : filtre));
  const donnees = liste.statut === 'erreur' ? undefined : liste.donnees;

  const filtres = (
    <>
      <View style={{ gap: 6 }}>
        <Label nativeID="annuaire-nom">Nom</Label>
        <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
          <IconeRecherche couleur={p.inkMuted} taille={16} />
          <TextInput
            accessibilityLabelledBy="annuaire-nom"
            value={q}
            onChangeText={(t) => {
              setQ(t);
              setPage(1);
            }}
            placeholder="Rechercher une personne"
            placeholderTextColor={p.inkMuted}
            style={[styles.saisie, { color: p.ink }]}
          />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Fonction actuelle</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
          {ROLES.map((r) => (
            <Puce
              key={r.cle}
              actif={role === r.cle}
              onPress={() => {
                setRole(r.cle);
                setPage(1);
              }}
            >
              {r.libelle}
            </Puce>
          ))}
        </ScrollView>
      </View>
    </>
  );

  const resultats =
      liste.statut === 'erreur' ? (
        <Erreur message={liste.message} onReessayer={liste.recharger} />
      ) : !donnees ? (
        <Chargement />
      ) : (
        <View style={{ gap: space[2] }}>
          <Label>
            {`${donnees.personnes.total === null ? donnees.personnes.elements.length : nombre(donnees.personnes.total)} résultats · ${libelleEffectifs(donnees.effectifs)} en fonction`}
          </Label>
          <View>
            {donnees.personnes.elements.map((e) => (
              <LigneAnnuaire key={e.id} element={e} />
            ))}
            {donnees.personnes.elements.length === 0 && <T ton="inkMuted">Aucune personne ne correspond.</T>}
          </View>
          {donnees.personnes.suivante !== null && (
            <BoutonSecondaire onPress={() => setPage(donnees.personnes.suivante ?? page)}>Page suivante</BoutonSecondaire>
          )}
        </View>
      );

  return <Colonnes coteDabord cote={filtres} principal={resultats} />;
}

function LigneAnnuaire({ element }: { element: ElementAnnuaire }) {
  const p = usePalette();
  const aller = useAller();
  const v = presentationAnnuaire(element);
  const rne = element.identite === 'fiche_rne';
  return (
    <Ligne onPress={() => aller.personne(element.id)} accessibilityLabel={`${v.titre}${v.sousTitre ? `, ${v.sousTitre}` : ''}`}>
      {rne ? (
        // Pas de pastille pleine : une fiche RNE n'appartient à aucun groupe établi.
        <Pastille couleur={p.lineStrong} creuse />
      ) : (
        <Pastille couleur={element.groupe?.couleur ?? p.lineStrong} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T variant="heading" ton={rne ? 'inkMuted' : 'ink'}>
          {v.titre}
        </T>
        {v.sousTitre && (
          <T variant="caption" ton="inkMuted">
            {v.sousTitre}
          </T>
        )}
        {v.mention && (
          <T variant="caption" ton="inkMuted" style={{ fontStyle: 'italic' }}>
            {v.mention}
          </T>
        )}
      </View>
      <Badge>{v.badge}</Badge>
    </Ligne>
  );
}

const styles = StyleSheet.create({
  champ: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.sm },
  saisie: { flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 16, paddingVertical: space[2] },
  puces: { gap: 6 },
});
