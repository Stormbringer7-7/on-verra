/** Ce qu'il faut savoir d'un siège pour l'ordonner : son groupe, son numéro (s'il est connu), un nom. */
export interface Siege {
  groupe: string | null;
  place: number | null;
  nom: string;
}

/**
 * Ordonne les sièges de la gauche vers la droite de l'hémicycle.
 *
 * Les groupes ne sont pas codés en dur (ils changent d'une législature et d'une date à l'autre) :
 * leur rang vient du siège moyen de leurs membres ce jour-là. À l'Assemblée, les numéros
 * de siège croissent de la droite vers la gauche. Un groupe sans aucun siège connu va au centre.
 * Dans un groupe, même règle siège par siège.
 */
export function ordonnerDeGaucheADroite<T extends Siege>(membres: T[]): T[] {
  const sommes = new Map<string, { total: number; connus: number }>();
  for (const m of membres) {
    const cle = m.groupe ?? '';
    const s = sommes.get(cle) ?? { total: 0, connus: 0 };
    if (m.place !== null) {
      s.total += m.place;
      s.connus++;
    }
    sommes.set(cle, s);
  }
  const places = membres.map((m) => m.place).filter((p): p is number => p !== null);
  const centre = places.length ? (Math.min(...places) + Math.max(...places)) / 2 : 0;
  const rang = (groupe: string | null) => {
    const s = sommes.get(groupe ?? '')!;
    return s.connus ? s.total / s.connus : centre;
  };
  return [...membres].sort(
    (a, b) =>
      rang(b.groupe) - rang(a.groupe) ||
      (a.groupe ?? '').localeCompare(b.groupe ?? '') ||
      (b.place ?? -1) - (a.place ?? -1) ||
      a.nom.localeCompare(b.nom),
  );
}
