// Icônes de la maquette v3 (planche « Icônes », https://claude.ai/artifact/2zeVRjfihwHAcztEWmhEnL) :
// linéaires 1,5 px, grille 16, un seul tracé par icône ; couleur du texte qu'elles accompagnent.
// Jamais un caractère emoji à la place.

import Svg, { Path } from 'react-native-svg';

export const ICONES = {
  // Lieux et étapes
  depot: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M8 7v5M5.5 9.5h5',
  commission: 'M2 11.5h12M4 11.5V14M12 11.5V14M3 6.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M6.5 6.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M10 6.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  an: 'M1.5 12.5h13M2.5 12.5a5.5 5.5 0 0 1 11 0M5.5 12.5a2.5 2.5 0 0 1 5 0',
  senat: 'M2 14h12M3.5 14V9.5h9V14M5 9.5a3 3 0 0 1 6 0M8 6.5V4.5M6.5 14v-2.5M9.5 14v-2.5',
  cmp: 'M1.5 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M6.5 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  navette: 'M2.5 5.5h9M9 3l2.5 2.5L9 8M13.5 10.5h-9M7 8l-2.5 2.5L7 13',
  transmission: 'M2 8h10M9 5l3 3-3 3M14 3v10',
  cc: 'M8 2.5v11M5 13.5h6M3 5h10M3 5 1.5 9h3zM13 5l-1.5 4h3z',
  congres: 'M1.5 13.5h13M2 13.5a6 6 0 0 1 12 0M4.5 13.5a3.5 3.5 0 0 1 7 0M8 7.5V4M6.5 4h3',
  jo: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6.5 10.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M6 7h4',
  urne: 'M2.5 7.5h11v6.5h-11zM5.5 7.5V2.5h5v5M7 4.5h2',
  hautecour: 'M2 14h12M3.5 14V7.5M6.5 14V7.5M9.5 14V7.5M12.5 14V7.5M1.5 7.5 8 2.5l6.5 5z',
  soutiens: 'M4 6a2 2 0 1 0 0-.01M12 6a2 2 0 1 0 0-.01M8 5a2 2 0 1 0 0-.01M1.5 13.5c0-2 1.2-3.5 2.5-3.5s2.5 1.5 2.5 3.5M9.5 13.5c0-2 1.2-3.5 2.5-3.5s2.5 1.5 2.5 3.5M5.5 12.5c0-2.2 1.1-4 2.5-4s2.5 1.8 2.5 4',
  // Événements du parcours
  e493: 'M1.5 12h3M11.5 12h3M3 12c0-6 10-6 10 0M10.8 10.4 13 12l1.4-2.2',
  censure: 'M8 2v7.5M5 6.5l3 3 3-3M3 13.5h10',
  mref: 'M2.5 7.5h11v6.5h-11zM5.5 7.5V2.5h5v5M7 4.5h2',
  accel: 'M3 4l4 4-4 4M8.5 4l4 4-4 4',
  proc: 'M8 1.5v4M8 10.5v4M3 8h10M3 6v4M13 6v4',
  irrec: 'M2 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0M3.8 12.2l8.4-8.4',
  retrait: 'M9 2.5H3.5v11H9M6.5 8H14M11.5 5.5 14 8l-2.5 2.5',
  odj: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5 2v3M11 2v3M6 10h4',
  caduc: 'M4.5 1.5h7M4.5 14.5h7M5.5 1.5V3c0 2.2 5 3 5 5s-5 2.8-5 5v1.5M10.5 1.5V3c0 2.2-5 3-5 5s5 2.8 5 5v1.5',
  fusion: 'M3.5 1.5V5c0 3 4.5 3.5 4.5 6.5v3M12.5 1.5V5c0 3-4.5 3.5-4.5 6.5',
  // Effets d’un événement
  rejoint: 'M4 1.5v13M4 4c5 0 8 1.5 8 4s-3 4-8 4',
  termine: 'M8 1.5v8M4.5 9.5h7',
  remplace: 'M8 1.5v3M8 11.5v3M8 4.5c4.5 1 4.5 6 0 7M6 6.5l4 3M10 6.5l-4 3',
  suspend: 'M8 1.5v4.5M8 10v4.5M6 6.5h4M6 9.5h4',
  // Types de dossiers et contrôle
  budget: 'M2.5 4.5h11v8h-11zM2.5 7h11M5 10h2',
  sante: 'M6 2.5h4V6h3.5v4H10v3.5H6V10H2.5V6H6z',
  organique: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6.5 9.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  traite: 'M2 3.5h7v10H2zM7 2h7v10h-5M4 6.5h3M4 9h3',
  europe: 'M8 2.5v.01M11.9 4.1v.01M13.5 8v.01M11.9 11.9v.01M8 13.5v.01M4.1 11.9v.01M2.5 8v.01M4.1 4.1v.01',
  resolution: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6 8.5l1.5 1.5L10.5 7',
  reglement: 'M3 2h9a1 1 0 0 1 1 1v11H4a1 1 0 0 1-1-1zM3 12a1 1 0 0 1 1-1h9M6 5h4',
  enquete: 'M2.5 7a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M10.5 10.5 14 14M5 7h4',
  mission: 'M3.5 14.5V2M3.5 2.5h8.5l-2 2.5 2 2.5H3.5',
  membres: 'M5.5 6a2 2 0 1 0 0-.01M10.5 6a2 2 0 1 0 0-.01M2 13.5c0-2.2 1.5-4 3.5-4s3.5 1.8 3.5 4M7 13.5c0-2.2 1.5-4 3.5-4s3.5 1.8 3.5 4',
  rapport: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6 8h4M6 10.5h4',
  petition: 'M2.5 13.5h11M3 10.5c1.5-3 2.5-3 3 0s1.5 3 3 0 2-2 3.5-1',
  declaration: 'M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z',
  micro: 'M6 2.5a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0zM3.5 7a4.5 4.5 0 0 0 9 0M8 11.5v2.5M5.5 14h5',
  // Navigation
  actu: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5 2v3M11 2v3M5 9h2M9 9h2M5 11.5h2',
  chiffres: 'M2 14h12M3.5 14V8.5M6.5 14V3.5M9.5 14V10M12.5 14V6.5',
  carte: 'M1.5 4 5.5 2.5l5 1.5 4-1.5V12l-4 1.5-5-1.5-4 1.5zM5.5 2.5V12M10.5 4v9.5',
  recherche: 'M2.5 7a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M10.5 10.5 14 14',
  guide: 'M2 3c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5v10c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5zM8 3.5v10',
} as const;

export type NomIcone = keyof typeof ICONES;

export function Icone({ nom, couleur, taille = 16, epaisseur = 1.5 }: { nom: NomIcone; couleur: string; taille?: number; epaisseur?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <Path d={ICONES[nom]} />
    </Svg>
  );
}
