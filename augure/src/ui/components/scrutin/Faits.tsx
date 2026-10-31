// « Ce que l'on sait » d'un vote (planches « Vote à main levée », « Amendement ») : lignes
// « libellé : valeur », avis publiés et auteurs résumés en une phrase, depuis la fiche de
// l'amendement. Une donnée absente est dite telle (« non publiés »), jamais devinée.
// `consequenceSuppression` : la phrase sous le résultat d'un amendement de suppression, seulement
// quand la règle est sûre (dispositif exact « Supprimer cet article. », article et sort connus).

import { StyleSheet, View } from 'react-native';

import { estSuppressionArticle, type FicheAmendement } from '@/core';
import { space } from '../../theme/tokens';
import { T } from '../base';
import { nomAuteur } from '../dossiers/presentation';

/**
 * « L’article 1 reste dans le texte » : conséquence d'un vote sur un amendement de suppression.
 * null sans règle sûre : amendement qui n'est pas une suppression, article ou résultat inconnus.
 */
export function consequenceSuppression(suppression: boolean | undefined, article: string | null | undefined, adopte: boolean | null): string | null {
  if (!suppression || !article || adopte === null) return null;
  return adopte ? `L’article ${article} est supprimé du texte.` : `L’article ${article} reste dans le texte.`;
}

/** Même conséquence, depuis la fiche de l'amendement (sort adopté ou rejeté, dispositif publié). */
export function consequenceAmendement(f: FicheAmendement): string | null {
  const a = f.amendement;
  const adopte = a.sort === 'adopte' ? true : a.sort === 'rejete' ? false : null;
  return consequenceSuppression(estSuppressionArticle(f.dispositif.texte), a.article?.numero, adopte);
}

/** Avis publiés en une phrase (« Commission : favorable · Gouvernement : défavorable »), ou leur absence. */
export function texteAvis(f: FicheAmendement): string {
  if (!f.avis.publies || f.avis.liste.length === 0) return 'Commission et Gouvernement : non publiés';
  const qui = { rapporteur: 'Rapporteur', commission: 'Commission', gouvernement: 'Gouvernement' } as const;
  return f.avis.liste.map((a) => `${qui[a.emetteur]} : ${(a.libelle ?? a.avis).toLowerCase()}`).join(' · ');
}

/** Auteur et cosignataires en une phrase (« Nathalie Coggia et 10 cosignataires, tous EPR »). */
export function texteAuteurs(f: FicheAmendement): string {
  const c = f.cosignataires;
  const auteur = nomAuteur(f.amendement.auteur);
  if (!c.total) return auteur;
  const tous = c.groupes.length === 1 ? `, ${c.total > 1 ? 'tous ' : ''}${c.groupes[0].abrege}` : '';
  return `${auteur} et ${c.total} cosignataire${c.total > 1 ? 's' : ''}${tous}`;
}

/** Ligne « libellé : valeur » de « Ce que l'on sait » / « Avis et vote ». */
export function Fait({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.fait}>
      <T variant="heading" style={styles.faitLibelle}>
        {libelle}
      </T>
      <T ton="inkSoft" style={{ flex: 1 }}>
        {valeur}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  fait: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  faitLibelle: { minWidth: 72 },
});
