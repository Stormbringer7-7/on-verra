// Calculs du zoom (ZoomPan), sans React : une vue = échelle et décalage du contenu dans son cadre.
// Un point du cadre (px, py) montre le point du contenu ((px - x) / echelle, (py - y) / echelle).
// Testé seul (tests/zoom.test.ts).

export interface Vue {
  echelle: number;
  x: number;
  y: number;
}

export interface Bornes {
  largeur: number;
  hauteur: number;
  min: number;
  max: number;
}

export const VUE_INITIALE: Vue = { echelle: 1, x: 0, y: 0 };

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Échelle dans ses bornes, et contenu qui couvre toujours le cadre (pas de vide sur les bords). */
export function borner(v: Vue, b: Bornes): Vue {
  const echelle = borne(v.echelle, b.min, b.max);
  return {
    echelle,
    x: borne(v.x, b.largeur * (1 - echelle), 0),
    y: borne(v.y, b.hauteur * (1 - echelle), 0),
  };
}

/** Zoom d'un facteur autour d'un point du cadre : ce point reste sous le doigt (ou le curseur). */
export function zoomerEn(v: Vue, facteur: number, px: number, py: number, b: Bornes): Vue {
  const echelle = borne(v.echelle * facteur, b.min, b.max);
  const f = echelle / v.echelle;
  return borner({ echelle, x: px - (px - v.x) * f, y: py - (py - v.y) * f }, b);
}

/** Point du contenu sous un point du cadre. */
export const versContenu = (v: Vue, px: number, py: number) => ({ x: (px - v.x) / v.echelle, y: (py - v.y) / v.echelle });

/** Double tap : on zoome ×2,5 autour du point ; au maximum, on revient à la vue entière. */
export function doubleTap(v: Vue, px: number, py: number, b: Bornes): Vue {
  return v.echelle >= b.max * 0.99 ? borner(VUE_INITIALE, b) : zoomerEn(v, 2.5, px, py, b);
}

/** Facteur d'un cran de molette (deltaY en pixels) : doux et symétrique. */
export const facteurMolette = (deltaY: number) => Math.exp(-borne(deltaY, -120, 120) / 300);

/**
 * Indice du point le plus proche de (x, y) à moins de `rayon` (unités du contenu), ou -1. Sert à
 * toucher un siège sans un composant par point.
 */
export function plusProche(points: readonly { x: number; y: number }[], x: number, y: number, rayon: number): number {
  let meilleur = -1;
  let d2 = rayon * rayon;
  points.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= d2) {
      d2 = d;
      meilleur = i;
    }
  });
  return meilleur;
}
