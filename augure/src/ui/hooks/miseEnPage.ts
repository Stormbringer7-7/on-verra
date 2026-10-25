import { useWindowDimensions } from 'react-native';

/** Largeur à partir de laquelle on passe en mise en page large (desktop, tablette, paysage). */
const LARGE = 900;
const PAYSAGE = 700;

/**
 * Mise en page large : fenêtre d'au moins 900 px, ou paysage d'au moins 700 px (téléphone tourné).
 * Navigation en en-tête, Assemblée sur deux colonnes, contenus centrés.
 */
export function useLarge(): boolean {
  const { width, height } = useWindowDimensions();
  return width >= LARGE || (width >= PAYSAGE && width > height);
}

/** Dimensions utiles en mise en page large : fenêtre basse (téléphone en paysage), place pour la recherche. */
export function useFenetre(): { hauteur: number; basse: boolean; recherche: boolean } {
  const { width, height } = useWindowDimensions();
  return { hauteur: height, basse: height < 600, recherche: width >= 1000 };
}
