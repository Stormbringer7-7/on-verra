// Géométrie de l'hémicycle de la maquette Panoptique : 11 rangs en demi-cercle,
// sièges répartis au prorata du rayon, puis numérotés de la gauche vers la droite par angle.
// Ce n'est pas le plan réel de la salle : une vue lisible, identique quelle que soit la législature.

export const RAPPORT = 184 / 358;

export interface PointSiege {
  x: number;
  y: number;
}

export function disposerSieges(nombre: number, largeur: number, rangs = 11): { sieges: PointSiege[]; rayonPoint: number } {
  const echelle = largeur / 358;
  const R = 172 * echelle;
  const cx = largeur / 2;
  const cy = 176 * echelle;
  const rayons = Array.from({ length: rangs }, (_, i) => R * (0.38 + (0.62 * i) / (rangs - 1)));
  const somme = rayons.reduce((a, b) => a + b, 0);
  const parRang = rayons.map((r) => Math.round((nombre * r) / somme));
  parRang[rangs - 1] += nombre - parRang.reduce((a, b) => a + b, 0);

  const sieges: (PointSiege & { t: number })[] = [];
  rayons.forEach((r, i) => {
    const n = parRang[i];
    for (let j = 0; j < n; j++) {
      const t = n === 1 ? Math.PI / 2 : Math.PI * (1 - j / (n - 1));
      sieges.push({ t, x: cx + r * Math.cos(t), y: cy - r * Math.sin(t) });
    }
  });
  sieges.sort((a, b) => b.t - a.t);
  return { sieges, rayonPoint: 3 * echelle };
}
