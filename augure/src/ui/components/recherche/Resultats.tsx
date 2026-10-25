// Recherche par familles : une ligne de résultat (ouvre sa fiche), les puces des familles avec
// leur nombre, une section (déclinaison, nombre, aperçu ou liste paginée). Sans navigation directe
// (useAller seulement), pour être rendus dans les tests.

import { Pressable, StyleSheet, View } from 'react-native';

import { FAMILLES_RECHERCHE, type FamilleComptee, type FamilleRecherche, type ResultatFamille, type SectionRecherche } from '@/core';
import { useAller } from '../../../navigation';
import { nombre } from '../../format';
import { ficheDe, libelleCompte, ouverture, type Ouverture } from '../../recherche';
import { usePalette } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { BoutonSecondaire, Label, Ligne, Pastille, Puce, T } from '../base';
import { Puces } from '../fondations';

/** Repères typographiques des familles (canevas), décoratifs. */
export const GLYPHES: Record<FamilleRecherche, string> = { lois: '§', personnes: '◐', institutions: '▥', territoires: '⌖', action: '✎', transparence: '◇' };

const libelleDeclinaison = new Map(FAMILLES_RECHERCHE.flatMap((f) => f.declinaisons.map((d) => [d.declinaison, d.libelle] as const)));

function useOuvrir() {
  const aller = useAller();
  return (o: Ouverture) => {
    switch (o.ecran) {
      case 'dossier':
        return aller.dossier(o.id);
      case 'etape':
        return aller.etape(o.dossier, o.cle);
      case 'article':
        return aller.article(o.id);
      case 'personne':
        return aller.personne(o.id);
      case 'scrutin':
        return aller.scrutin(o.id);
      case 'amendement':
        return aller.amendement(o.id);
      case 'institution':
        return aller.institution(o.institution);
      case 'representant':
        return aller.representant(o.id);
      case 'explorer':
        return aller.explorer({ filtres: o.filtres });
    }
  };
}

export function Resultat({ r }: { r: ResultatFamille }) {
  const ouvrir = useOuvrir();
  const o = ouverture(r);
  const contenu = (
    <>
      {r.groupe && <Pastille couleur={r.groupe.couleur} />}
      <View style={styles.resultat}>
        <T variant="text" style={styles.titre}>
          {r.titre}
        </T>
        <T variant="small" ton="inkMuted">
          {r.contexte}
        </T>
      </View>
    </>
  );
  if (!o) {
    // Pas encore de fiche (commission, département) : affiché, pas touchable.
    return (
      <View accessible accessibilityLabel={`${r.titre}. ${r.contexte}. Pas encore de fiche.`} style={styles.ligneFixe}>
        {contenu}
      </View>
    );
  }
  // Toucher filtre (Explorer) ; « Fiche » montre l'objet seul, à côté (jamais imbriqué dans le lien).
  const fiche = o.ecran === 'explorer' ? ficheDe(r) : null;
  const ligne = (
    <Ligne onPress={() => ouvrir(o)} accessibilityLabel={`${r.titre}. ${r.contexte}${o.ecran === 'explorer' ? '. Voir ses faits' : ''}`}>
      {contenu}
    </Ligne>
  );
  if (!fiche) return ligne;
  return (
    <View style={styles.avecFiche}>
      <View style={styles.ligneSouple}>{ligne}</View>
      <BoutonSecondaire onPress={() => ouvrir(fiche)}>Fiche</BoutonSecondaire>
    </View>
  );
}

export function PucesFamilles({
  familles,
  famille,
  choisir,
}: {
  familles: FamilleComptee[];
  famille: FamilleRecherche | null;
  choisir(f: FamilleRecherche): void;
}) {
  return (
    <Puces label="Familles">
      {familles.map((f) => (
        <Puce
          key={f.famille}
          actif={famille === f.famille}
          onPress={() => choisir(f.famille)}
          accessibilityLabel={`${f.libelle}, ${libelleCompte(f.compte, nombre)} résultats`}
        >
          {`${GLYPHES[f.famille]} ${f.libelle} ${libelleCompte(f.compte, nombre)}`}
        </Puce>
      ))}
    </Puces>
  );
}

export function Section({ s, detail, voirTout, page }: { s: SectionRecherche; detail: boolean; voirTout(): void; page(n: number): void }) {
  const p = usePalette();
  const r = s.resultats;
  const total = r.total ?? null;
  return (
    <View style={styles.section}>
      <View style={[styles.enteteSection, { borderBottomColor: p.line }]}>
        <T variant="heading">
          <T variant="heading" ton="inkMuted" aria-hidden>
            {`${GLYPHES[s.famille]} `}
          </T>
          {libelleDeclinaison.get(s.declinaison)}
        </T>
        <T variant="small" ton="inkMuted">
          {total === null ? 'plus de 1 000' : `${nombre(total)} résultat${total > 1 ? 's' : ''}`}
        </T>
      </View>
      {r.elements.map((x) => (
        <Resultat key={`${x.declinaison}:${x.id}`} r={x} />
      ))}
      {!detail && (r.suivante !== null || (total !== null && total > r.elements.length)) && (
        <Pressable accessibilityRole="button" onPress={voirTout} style={styles.plus}>
          <Label ton="ink">{total === null ? 'Voir la liste →' : `Voir les ${nombre(total)} →`}</Label>
        </Pressable>
      )}
      {detail && (r.page > 1 || r.suivante !== null) && (
        <View style={styles.pages}>
          {r.page > 1 && <BoutonSecondaire onPress={() => page(r.page - 1)}>← Précédents</BoutonSecondaire>}
          <Label>Page {r.page}</Label>
          {r.suivante !== null && <BoutonSecondaire onPress={() => page(r.suivante!)}>Suivants →</BoutonSecondaire>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avecFiche: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  ligneSouple: { flex: 1, minWidth: 0 },
  section: { gap: space[1] },
  enteteSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3], paddingBottom: 6, borderBottomWidth: 1 },
  resultat: { flex: 1, minWidth: 0, gap: 2 },
  titre: { lineHeight: 22 },
  ligneFixe: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  plus: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  pages: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3] },
});
