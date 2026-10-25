// Recherche (canevas, « Rechercher ») : un mot, tous les types ou un seul. Sans mot ni type :
// « Par où commencer ». Une section par type (dossiers, personnes, amendements, scrutins,
// organisations) ; filtrée par type, la liste est paginée.

import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Rechercher, type Trouve, type TypeRecherche } from '@/core';
import { useAller, type Onglets } from '../../navigation';
import { BoutonSecondaire, Carre, IconeRecherche, Label, Ligne, Pastille, Puce, T, TitreSection } from '../components/base';
import { Chargement, Ecran, Erreur } from '../components/Ecran';
import { nombre } from '../format';
import { useCommand } from '../hooks/core';
import { demandeRecherche, LONGUEUR_MIN, type Filtre } from '../recherche';
import { useLarge } from '../hooks/miseEnPage';
import { usePalette } from '../theme/ThemeProvider';
import { fonts, radius, space } from '../theme/tokens';

const TYPES: { cle: Filtre; libelle: string }[] = [
  { cle: 'tout', libelle: 'Tout' },
  { cle: 'dossiers', libelle: 'Dossiers' },
  { cle: 'personnes', libelle: 'Personnes' },
  { cle: 'amendements', libelle: 'Amendements' },
  { cle: 'scrutins', libelle: 'Scrutins' },
  { cle: 'organisations', libelle: 'Organisations' },
];

const libelleType = (t: TypeRecherche) => TYPES.find((x) => x.cle === t)!.libelle;

const COMMENCER: { titre: string; aide: string; type: TypeRecherche }[] = [
  { titre: 'Suivre une loi', aide: 'Un dossier, du dépôt au Journal officiel', type: 'dossiers' },
  { titre: 'Une personne', aide: 'Ses fonctions, ses votes, ses déclarations', type: 'personnes' },
  { titre: 'Un amendement', aide: 'Qui a proposé quoi, et ce qu’il est devenu', type: 'amendements' },
  { titre: 'Un groupe d’intérêts', aide: 'Actions déclarées et dossiers rapprochés', type: 'organisations' },
];

/** Délai avant de lancer la recherche pendant la frappe. */
const ATTENTE_MS = 300;
function useDiffere<T>(valeur: T, ms: number): T {
  const [differee, setDifferee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDifferee(valeur), ms);
    return () => clearTimeout(t);
  }, [valeur, ms]);
  return differee;
}

function Resultat({ trouve }: { trouve: Trouve }) {
  const p = usePalette();
  const aller = useAller();
  const ouvrir = () => {
    switch (trouve.type) {
      case 'dossiers':
        return aller.dossier(trouve.id);
      case 'personnes':
        return aller.personne(trouve.id);
      case 'amendements':
        return aller.amendement(trouve.id);
      case 'scrutins':
        return aller.scrutin(trouve.id);
      case 'organisations':
        // Organisations trouvées : les représentants d'intérêts (seule fiche d'organisation de l'app).
        return aller.representant(trouve.id);
    }
  };
  return (
    <Ligne onPress={ouvrir} accessibilityLabel={`${trouve.titre}. ${trouve.contexte}`}>
      {trouve.type === 'personnes' ? (
        // Couleur du groupe (donnée), ou neutre sans groupe.
        <Pastille couleur={trouve.groupe?.couleur ?? p.lineStrong} />
      ) : (
        <Carre couleur={p.lineStrong} />
      )}
      <View style={styles.resultat}>
        <T variant="text" style={styles.titre}>
          {trouve.titre}
        </T>
        <Label style={styles.contexte}>{trouve.contexte}</Label>
      </View>
    </Ligne>
  );
}

export function Recherche() {
  const p = usePalette();
  const large = useLarge();
  const route = useRoute<RouteProp<Onglets, 'Recherche'>>();
  const [q, setQ] = useState(route.params?.q ?? '');
  const [type, setType] = useState<Filtre>('tout');
  const [page, setPage] = useState(1);
  const qDiffere = useDiffere(q, ATTENTE_MS);

  // Nouveau mot reçu par la navigation (`navigate('Recherche', { q })`) : il remplace la saisie.
  const qRoute = route.params?.q;
  const [qRouteVu, setQRouteVu] = useState(qRoute);
  if (qRoute !== qRouteVu) {
    setQRouteVu(qRoute);
    if (qRoute !== undefined) setQ(qRoute);
  }

  const demande = demandeRecherche(qDiffere, type, page);
  const resultat = useCommand(demande ? Rechercher(demande) : null);
  const choisir = (t: Filtre) => {
    setType(t);
    setPage(1);
  };
  const changerMot = (texte: string) => {
    setQ(texte);
    setPage(1);
  };

  const explorer = q.trim().length < LONGUEUR_MIN && type === 'tout';
  const donnees = demande && resultat.statut !== 'erreur' ? resultat.donnees : undefined;
  const sections = donnees?.sections.filter((s) => s.resultats.elements.length > 0) ?? [];

  return (
    <Ecran>
      <View style={[styles.champBloc, large && styles.champLarge]}>
        <Label>Rechercher</Label>
        <View style={[styles.champ, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}>
          <IconeRecherche couleur={p.inkMuted} />
          <TextInput
            accessibilityLabel="Rechercher un dossier, une personne, un amendement, une organisation"
            value={q}
            onChangeText={changerMot}
            placeholder="Dossier, personne, amendement, organisation…"
            placeholderTextColor={p.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            inputMode="search"
            style={[styles.saisie, { color: p.ink }]}
          />
        </View>
      </View>

      <ScrollView
        horizontal={!large}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.types, large && styles.typesLarges]}
        accessibilityRole="tablist"
        accessibilityLabel="Type"
      >
        {TYPES.map((t) => (
          <Puce key={t.cle} actif={type === t.cle} onPress={() => choisir(t.cle)}>
            {t.libelle}
          </Puce>
        ))}
      </ScrollView>

      {explorer && (
        <View style={styles.section}>
          <TitreSection>Par où commencer</TitreSection>
          <View style={styles.grille}>
            {COMMENCER.map((c) => (
              <Pressable
                key={c.type}
                accessibilityRole="button"
                onPress={() => choisir(c.type)}
                style={[styles.depart, large && styles.departLarge, { backgroundColor: p.surfaceRaised, borderColor: p.line }]}
              >
                <T variant="heading">{c.titre}</T>
                <T variant="small" ton="inkMuted">
                  {c.aide}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!explorer && !demande && (
        <T ton="inkMuted">Tapez au moins {LONGUEUR_MIN} lettres pour chercher parmi les {libelleType(type as TypeRecherche).toLowerCase()}.</T>
      )}
      {demande && resultat.statut === 'erreur' && <Erreur message={resultat.message} onReessayer={resultat.recharger} />}
      {demande && resultat.statut === 'chargement' && !donnees && <Chargement libelle="Recherche" />}

      {sections.map((s) => {
        const r = s.resultats;
        const total = r.total ?? (r.suivante ? `${nombre(r.elements.length)}+` : r.elements.length);
        return (
          <View key={s.type}>
            <Label>
              {libelleType(s.type)} · {typeof total === 'number' ? nombre(total) : total}
            </Label>
            {r.elements.map((t) => (
              <Resultat key={`${t.type}:${t.id}`} trouve={t} />
            ))}
            {type === 'tout' && r.suivante !== null && (
              <Pressable accessibilityRole="button" onPress={() => choisir(s.type)} style={styles.plus}>
                <Label ton="signal">Tous les {libelleType(s.type).toLowerCase()} →</Label>
              </Pressable>
            )}
            {type !== 'tout' && (r.page > 1 || r.suivante !== null) && (
              <View style={styles.pages}>
                {r.page > 1 && <BoutonSecondaire onPress={() => setPage(r.page - 1)}>← Précédents</BoutonSecondaire>}
                <Label>Page {r.page}</Label>
                {r.suivante !== null && <BoutonSecondaire onPress={() => setPage(r.suivante!)}>Suivants →</BoutonSecondaire>}
              </View>
            )}
          </View>
        );
      })}

      {donnees && sections.length === 0 && <T ton="inkMuted">Aucun résultat. Essayez un autre mot ou un autre type.</T>}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  champBloc: { gap: 6 },
  champLarge: { maxWidth: 880 },
  champ: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.sm },
  saisie: { flex: 1, minWidth: 0, minHeight: 48, fontFamily: fonts.sans, fontSize: 18 },
  types: { gap: 6 },
  typesLarges: { flexDirection: 'row', flexWrap: 'wrap' },
  section: { gap: 10 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  // Deux par ligne en large (canevas : grille de cartes), une par ligne en portrait.
  departLarge: { flexBasis: '40%' },
  depart: { flexGrow: 1, flexBasis: '100%', minHeight: 76, gap: space[1], padding: 14, borderWidth: 1, borderRadius: radius.md },
  resultat: { flex: 1, minWidth: 0, gap: 2 },
  titre: { lineHeight: 20 },
  contexte: { letterSpacing: 0.44 },
  plus: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  pages: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3] },
});
