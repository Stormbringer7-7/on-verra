// « Signaler une erreur ou une source manquante » : lien du canevas, qui ouvre un court formulaire
// et envoie la commande `SignalerErreur` (file de corrections, relue à la main).

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SignalerErreur, type AccuseSignalement, type Signalement } from '@/core';
import { dateLongue } from '../../format';
import { useEnvoi } from '../../hooks/core';
import { usePalette } from '../../theme/ThemeProvider';
import { fonts, radius, space } from '../../theme/tokens';
import { Action, BoutonSecondaire, Label, T } from '../base';

export const LIBELLE_SIGNALER = 'Signaler une erreur ou une source manquante';

/** Le signalement envoyé, depuis le formulaire (message et contact nettoyés, contact facultatif). */
export function signalement(cible: Signalement['cible'], ecran: string, message: string, contact: string): Signalement {
  const c = contact.trim();
  return { cible, message: message.trim(), ecran, ...(c ? { contact: c } : {}) };
}

export function Signaler(props: { cible: Signalement['cible']; ecran: string }) {
  const { cible, ecran } = props;
  const p = usePalette();
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const { etat, envoyer, reinitialiser } = useEnvoi<AccuseSignalement>();

  const fermer = () => {
    setOuvert(false);
    setMessage('');
    setContact('');
    reinitialiser();
  };

  if (!ouvert) return <Action onPress={() => setOuvert(true)}>{LIBELLE_SIGNALER} →</Action>;

  if (etat.statut === 'envoye') {
    return (
      <View style={[styles.cadre, { borderColor: p.line }]} accessibilityLiveRegion="polite">
        <T variant="body">
          Merci : signalement reçu le {dateLongue(etat.reponse.recuLe)} (n° {etat.reponse.id}). Il sera relu avant toute correction.
        </T>
        <BoutonSecondaire onPress={fermer}>Fermer</BoutonSecondaire>
      </View>
    );
  }

  const champ = [styles.champ, { borderColor: p.lineStrong, backgroundColor: p.surfaceSunken, color: p.ink }];
  const valide = message.trim().length > 0;
  return (
    <View style={[styles.cadre, { borderColor: p.line }]}>
      <Label ton="ink">{LIBELLE_SIGNALER}</Label>
      <Label>Ce qui est faux ou manque</Label>
      <TextInput
        accessibilityLabel="Ce qui est faux ou manque"
        value={message}
        onChangeText={setMessage}
        multiline
        placeholder="Ex. : la source du vote est absente, le groupe est erroné…"
        placeholderTextColor={p.inkMuted}
        style={[champ, styles.message]}
      />
      <Label>Adresse pour une réponse (facultatif)</Label>
      <TextInput
        accessibilityLabel="Adresse pour une réponse, facultatif"
        value={contact}
        onChangeText={setContact}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={p.inkMuted}
        style={champ}
      />
      {etat.statut === 'erreur' && <T ton="signal">{etat.message}</T>}
      <View style={styles.boutons}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !valide || etat.statut === 'envoi' }}
          disabled={!valide || etat.statut === 'envoi'}
          onPress={() => envoyer(SignalerErreur(signalement(cible, ecran, message, contact)))}
          style={[styles.envoyer, { backgroundColor: valide ? p.signal : p.line }]}
        >
          <Label couleur={valide ? p.signalInk : p.inkMuted}>{etat.statut === 'envoi' ? 'Envoi…' : 'Envoyer'}</Label>
        </Pressable>
        <BoutonSecondaire onPress={fermer}>Annuler</BoutonSecondaire>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { gap: space[2], borderWidth: 1, borderRadius: radius.md, padding: space[4] },
  champ: { minHeight: 44, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space[3], fontFamily: fonts.sans, fontSize: 15 },
  message: { minHeight: 96, paddingVertical: space[2], textAlignVertical: 'top' },
  boutons: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  envoyer: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space[3] },
});
