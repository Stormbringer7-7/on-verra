// Handlers transverses : recherche plein texte et signalement d'une erreur ou d'une source
// manquante (seule écriture de l'API, commande `SignalerErreur`).

import { DISPONIBLES, FAMILLES_RECHERCHE, PLAFOND_COMPTE, assemblerRecherche, famillesDe, planRecherche } from '@contrat/domain/familles';
import type { DeclinaisonRecherche, FamilleRecherche, Signalement, TypeCible, TypeRecherche } from '@contrat/domain/model';

import { type Handlers, type LecturesDeps, RequeteInvalide, borner, parmi, parmiFacultatif, texte, texteFacultatif } from './commun';

/** Sans type, une section par type et ses premières réponses seulement. */
export const TAILLE_PAR_SECTION = 5;
/** Candidats d'un numéro officiel ambigu, montrés au plus. */
export const LIMITE_CANDIDATS = 20;

const FAMILLES = Object.fromEntries(FAMILLES_RECHERCHE.map((f) => [f.famille, true])) as Record<FamilleRecherche, true>;
const DECLINAISONS = Object.fromEntries([...famillesDe.keys()].map((d) => [d, true])) as Record<DeclinaisonRecherche, true>;

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

export function lecturesRecherche({ depots }: LecturesDeps): Pick<Handlers, 'Rechercher' | 'ChercherParFamilles' | 'SignalerErreur'> {
  return {
    ChercherParFamilles: async (demande) => {
      if (demande.q !== undefined && typeof demande.q !== 'string') throw new RequeteInvalide('Recherche attendue');
      if ((demande.q ?? '').length > 200) throw new RequeteInvalide('Recherche trop longue');
      const famille = parmiFacultatif(demande.famille, FAMILLES, 'Famille');
      if (demande.declinaisons !== undefined && !Array.isArray(demande.declinaisons)) throw new RequeteInvalide('Déclinaisons attendues');
      for (const d of demande.declinaisons ?? []) {
        parmi(d, DECLINAISONS, 'Déclinaison');
        if (famille && famillesDe.get(d) !== famille) throw new RequeteInvalide(`Déclinaison hors de la famille : ${d}`);
      }
      const plan = planRecherche(demande, borner(demande));
      const { recherche } = depots;
      // Un numéro officiel trouvé remplace la recherche : ni comptes ni sections.
      const candidats = plan.numero ? await recherche.candidatsNumero(plan.numero, LIMITE_CANDIDATS) : null;
      if (candidats?.length) return assemblerRecherche(demande, plan, { comptes: {}, sections: {}, candidats });
      // Les pages et, à part, les comptes des déclinaisons non montrées ; une page sans total
      // (parcourir) est comptée ensuite. Le total d'une page est le compte de sa déclinaison.
      const autres = DISPONIBLES.filter((d) => !plan.declinaisons.includes(d));
      const [pages, comptesAutres] = await Promise.all([
        Promise.all(plan.declinaisons.map(async (d) => [d, await recherche.chercherDeclinaison(plan.q, d, plan)] as const)),
        recherche.compterFamilles(plan.q, autres),
      ]);
      const sansTotal = pages.filter(([, p]) => p.total === null).map(([d]) => d);
      const comptes = {
        ...comptesAutres,
        ...Object.fromEntries(
          pages.flatMap(([d, p]) => (p.total === null ? [] : [[d, { nombre: Math.min(p.total, PLAFOND_COMPTE), plafonne: p.total > PLAFOND_COMPTE }] as const])),
        ),
        ...(sansTotal.length ? await recherche.compterFamilles(plan.q, sansTotal) : {}),
      };
      const avecTotal = pages.map(([d, p]) => {
        const c = comptes[d];
        return [d, { ...p, total: c && !c.plafonne ? c.nombre : null }] as const;
      });
      return assemblerRecherche(demande, plan, { comptes, sections: Object.fromEntries(avecTotal), candidats });
    },

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
