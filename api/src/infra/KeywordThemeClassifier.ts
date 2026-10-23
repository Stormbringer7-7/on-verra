// Thème d'un texte d'après les mots de son titre. Heuristique assumée et remplaçable
// (classement manuel, modèle de langue…) : c'est un adapter du port ThemeClassifier.

import type { ThemeClassifier } from '../ports';
import { normaliser } from '@contrat/domain/texte';

// Ordre significatif : la première règle qui correspond l'emporte
// (« sécurité sociale » doit passer avant « sécurité »).
const REGLES: [theme: string, motifs: RegExp][] = [
  ['International', /\b(traite|convention|accord|ratification|approbation|protocole|adhesion)\b/],
  ['Budget', /\b(finances?|budget\w*|fiscal\w*|impots?|taxe|comptes|dette|programmation des finances)\b/],
  ['Santé, social', /(securite sociale|sante|medic|hopit|soins|fin de vie|retraite|handicap|famil|autonomie|aidant|solidarit|pauvrete)/],
  ['Travail, économie', /(travail|emploi|chomage|entreprise|econom|commerce|agricult|agricol|industri|pouvoir d'achat|consommat|banque|assurance)/],
  ['Énergie, climat', /(energ|electricit|nucleaire|climat|environnement|\beau\b|biodiversit|renouvelable|transport|mobilit|pollution)/],
  ['Sécurité, justice', /(justice|penal|police|securite|terroris|narcotrafic|prison|penitentiaire|defense|militaire|armee|immigration|asile|etrangers)/],
  ['Institutions', /(constitution|organique|election|electoral|collectivit|caledonie|outre-mer|corse|parlement|referendum|mandat)/],
  ['Société', /(education|ecole|enseign|logement|culture|sport|numerique|jeune|enfant|egalite|femmes|violences|laicite|audiovisuel|olympi)/],
];

const AUTRES = 'Autres';

export class KeywordThemeClassifier implements ThemeClassifier {
  readonly themes = [...REGLES.map(([t]) => t), AUTRES] as const;

  classer(titre: string): string {
    const t = normaliser(titre);
    return REGLES.find(([, motif]) => motif.test(t))?.[0] ?? AUTRES;
  }
}
