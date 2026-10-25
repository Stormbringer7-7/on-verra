// Handlers transverses : recherche plein texte et signalement d'une erreur ou d'une source
// manquante (seule écriture de l'API, commande `SignalerErreur`).

import type { Signalement, TypeCible, TypeRecherche } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, RequeteInvalide, borner, parmi, parmiFacultatif, texte, texteFacultatif } from './commun';

/** Sans type, une section par type et ses premières réponses seulement. */
export const TAILLE_PAR_SECTION = 5;

const TYPES: Record<TypeRecherche, true> = { dossiers: true, personnes: true, amendements: true, scrutins: true, organisations: true };
const CIBLES: Record<TypeCible, true> = {
  dossier: true,
  etape: true,
  article: true,
  amendement: true,
  scrutin: true,
  intervention: true,
  personne: true,
  institution: true,
  representant: true,
  autre: true,
};

function signalementValide(s: Signalement): Signalement {
  const cible = (s.cible ?? {}) as Partial<Signalement['cible']>;
  const contact = texteFacultatif(s.contact, 'Contact', 320);
  const ecran = texteFacultatif(s.ecran, 'Écran', 100);
  if (cible.id !== null && cible.id !== undefined && typeof cible.id !== 'string') throw new RequeteInvalide('Identifiant de la cible attendu');
  return {
    cible: { type: parmi(cible.type, CIBLES, 'Cible'), id: cible.id ? texte(cible.id, 'Identifiant de la cible') : null },
    message: texte(s.message, 'Message', 5_000).trim(),
    ...(contact ? { contact } : {}),
    ...(ecran ? { ecran } : {}),
  };
}

export function lecturesRecherche({ depots }: LecturesDeps): Pick<Handlers, 'Rechercher' | 'SignalerErreur'> {
  return {
    Rechercher: async (demande) => {
      const type = parmiFacultatif(demande.type, TYPES, 'Type');
      if (typeof demande.q !== 'string') throw new RequeteInvalide('Recherche attendue');
      const q = demande.q.trim();
      if (q.length > 200) throw new RequeteInvalide('Recherche trop longue');
      // Une requête vide ne cherche rien.
      if (!q) return { q: demande.q, type: type ?? null, sections: [] };
      return depots.recherche.rechercher({ ...demande, q }, borner(demande, type ? undefined : TAILLE_PAR_SECTION));
    },

    SignalerErreur: async (signalement) => depots.signalements.enregistrer(signalementValide(signalement)),
  };
}
