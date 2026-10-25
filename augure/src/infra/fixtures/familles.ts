// Fixtures de la recherche par familles : un catalogue fictif (repris du canevas, écran Recherche,
// rattaché aux entités des autres fixtures) et la façon d'y chercher. Les exemples sont calculés par
// les règles du contrat (`planRecherche`, `assemblerRecherche`) sur ce catalogue ; l'adaptateur
// mémoire de l'API y cherche de la même façon, si bien que ses réponses redonnent les exemples.
// Recherche sans casse ni accents : chaque mot de la requête doit apparaître dans le titre, le
// contexte ou les mots-clés.

import type {
  CompteRecherche,
  DeclinaisonRecherche,
  DemandeFamilles,
  NumeroOfficiel,
  Page,
  ResultatFamille,
  ResultatFamilles,
} from '../../core/domain/model';
import { PLAFOND_COMPTE, assemblerRecherche, famillesDe, numeroComparable, planRecherche } from '../../core/domain/familles';
import { normaliser } from '../../core/domain/texte';
import { A, ART, D, G, P } from './entites';
import { R } from './interets';
import { S } from './scrutins';

interface Entree {
  r: ResultatFamille;
  motsCles: string;
  /** Numéros officiels (forme comparable) et ce qu'ils désignent. */
  numero?: { valeur: string; cible: 'amendements' | 'votes' | 'questions' };
}

const e = (
  declinaison: DeclinaisonRecherche,
  id: string,
  titre: string,
  contexte: string,
  motsCles: string,
  ouvre: Pick<ResultatFamille, 'fiche' | 'filtres'>,
  groupe: ResultatFamille['groupe'] = null,
  numero?: Entree['numero'],
): Entree => ({ r: { famille: famillesDe.get(declinaison)!, declinaison, id, titre, contexte, groupe, ...ouvre }, motsCles, ...(numero ? { numero } : {}) });

const dossier = (id: string) => ({ fiche: { type: 'dossier' as const, id }, filtres: { dossier: id } });
const personne = (id: string) => ({ fiche: { type: 'personne' as const, id }, filtres: { personne: id } });

export const CATALOGUE: Entree[] = [
  e('dossiers', D.energie.id, 'Planifier l’énergie de la France jusqu’en 2035', 'Projet de loi · au Conseil constitutionnel', 'programmation énergétique nucléaire renouvelables électricité', dossier(D.energie.id)),
  e('dossiers', D.location.id, 'Régulation des meublés de tourisme', 'Proposition de loi · dernier mot à l’Assemblée', 'location saisonnière logement', dossier(D.location.id)),
  e('dossiers', D.budget.id, 'Projet de loi de finances pour 2027', 'Projet de loi · 1re lecture AN', 'budget finances', dossier(D.budget.id)),
  e('articles', ART.e3.id, 'Art. 3 · Part des renouvelables en 2035', 'Programmation énergétique 2026-2035 · modifié 4 fois', 'énergie renouvelables article',
    { fiche: { type: 'article', id: ART.e3.id }, filtres: { dossier: D.energie.id, article: ART.e3.id } }),
  e('articles', ART.e5.id, 'Art. 5 · Nouveaux réacteurs nucléaires', 'Programmation énergétique 2026-2035 · modifié 1 fois', 'énergie nucléaire réacteurs article',
    { fiche: { type: 'article', id: ART.e5.id }, filtres: { dossier: D.energie.id, article: ART.e5.id } }),
  e('groupes', G.A.id, G.A.libelle, 'Groupe politique · Assemblée nationale', 'groupe énergie', { fiche: { type: 'institution', institution: 'an' }, filtres: { groupe: G.A.id } }, G.A),
  e('groupes', G.S1.id, G.S1.libelle, 'Groupe politique · Sénat', 'groupe', { fiche: { type: 'institution', institution: 'senat' }, filtres: { groupe: G.S1.id } }, G.S1),
  e('deputes', P.camille.id, P.camille.nom, 'Députée de l’Essonne · rapporteure de la loi énergie', 'énergie rapporteure essonne', personne(P.camille.id), G.A),
  e('deputes', P.ines.id, P.ines.nom, 'Députée du Nord · auteure de CE123', 'énergie nord', personne(P.ines.id), G.C),
  e('deputes', P.hugo.id, P.hugo.nom, 'Député de la Gironde · membre de la commission d’enquête', 'énergie électricité gironde', personne(P.hugo.id), G.B),
  e('senateurs', P.pierre.id, P.pierre.nom, 'Sénateur · rapporteur de la loi énergie', 'énergie', personne(P.pierre.id), G.S1),
  e('senateurs', P.paul.id, P.paul.nom, 'Sénateur de la Gironde · auteur de COM-56', 'énergie gironde', personne(P.paul.id), G.S2),
  e('ministres', P.claire.id, P.claire.nom, 'Ministre de la Transition énergétique', 'énergie ministre', personne(P.claire.id)),
  e('chambres', 'assemblee-nationale', 'Assemblée nationale', '577 députés', 'assemblée', { fiche: { type: 'institution', institution: 'an' }, filtres: { chambre: 'AN' } }),
  e('chambres', 'senat', 'Sénat', '348 sénateurs', 'sénat', { fiche: { type: 'institution', institution: 'senat' }, filtres: { chambre: 'SENAT' } }),
  e('commissions', 'commission-affeco-an', 'Commission des affaires économiques', 'Assemblée nationale · a examiné la loi énergie', 'énergie commission', { fiche: null, filtres: { chambre: 'AN', organe: 'commission-affeco-an' } }),
  e('enquetes', 'commission-enquete-electricite', 'Commission d’enquête sur le prix de l’électricité', 'Assemblée nationale · rapport n° 1234 publié le 15 octobre', 'commission d’enquête énergie électricité prix rapport',
    { fiche: null, filtres: { chambre: 'AN', organe: 'commission-enquete-electricite' } }),
  e('departements', 'departement-33', 'Gironde', 'Département · 33', 'gironde 33 bordeaux', { fiche: null, filtres: { departement: '33' } }),
  e('departements', 'departement-91', 'Essonne', 'Département · 91', 'essonne 91', { fiche: null, filtres: { departement: '91' } }),
  e('votes', S.an1874.id, 'Scrutin n° 1874', 'AN · 12/03/2026 · Rejeté 247 – 268 · Lancer six réacteurs supplémentaires d’ici 2040', 'énergie nucléaire',
    { fiche: { type: 'scrutin', id: S.an1874.id }, filtres: { scrutin: S.an1874.id } }, null, { valeur: '1874', cible: 'votes' }),
  e('votes', S.an1880.id, 'Scrutin n° 1880', 'AN · 18/03/2026 · Adopté 312 – 220 · Adopter le projet de loi en 1re lecture', 'énergie',
    { fiche: { type: 'scrutin', id: S.an1880.id }, filtres: { scrutin: S.an1880.id } }, null, { valeur: '1880', cible: 'votes' }),
  e('amendements', A.ce123.id, 'Amendement CE123', 'Programmation énergétique · art. 3 · Commission AN · Adopté', 'énergie renouvelables 45 %',
    { fiche: { type: 'amendement', id: A.ce123.id }, filtres: { amendement: A.ce123.id } }, null, { valeur: 'CE123', cible: 'amendements' }),
  e('amendements', A.n655.id, 'Amendement n° 655', 'Programmation énergétique · art. 3 · Séance AN · Adopté', 'énergie chaleur 33 %',
    { fiche: { type: 'amendement', id: A.n655.id }, filtres: { amendement: A.n655.id } }, null, { valeur: '655', cible: 'amendements' }),
  e('amendements', 'amdt-location-s655', 'Amendement n° 655', 'Meublés de tourisme · art. 4 · Séance Sénat · Rejeté', 'location quotas communaux',
    { fiche: { type: 'amendement', id: 'amdt-location-s655' }, filtres: { amendement: 'amdt-location-s655' } }, null, { valeur: '655', cible: 'amendements' }),
  e('amendements', A.com56.id, 'Amendement COM-56', 'Programmation énergétique · art. 3 · Commission Sénat · Adopté', 'énergie renouvelables 42 %',
    { fiche: { type: 'amendement', id: A.com56.id }, filtres: { amendement: A.com56.id } }, null, { valeur: 'COM-56', cible: 'amendements' }),
  e('interventions', 'intervention-camille-art5', '« Avancer ce calendrier sans plan de financement… »', 'Camille Exemple · Séance AN · 12/03/2026', 'énergie nucléaire',
    { fiche: null, filtres: { personne: P.camille.id, dossier: D.energie.id } }, G.A),
  e('questions', 'question-qe-4521', 'Question n° 4521 : marges des fournisseurs d’électricité', 'Hugo Fictif · question écrite · sans réponse', 'électricité énergie',
    { fiche: null, filtres: { personne: P.hugo.id } }, G.B, { valeur: '4521', cible: 'questions' }),
  e('lobbying', R.enr.id, R.enr.denomination, 'Représentant d’intérêts · 12 actions déclarées en 2026', 'énergie renouvelables lobbying', { fiche: { type: 'representant', id: R.enr.id }, filtres: null }),
  e('lobbying', R.nucleaire.id, R.nucleaire.denomination, 'Représentant d’intérêts · 9 actions déclarées en 2026', 'énergie nucléaire lobbying', { fiche: { type: 'representant', id: R.nucleaire.id }, filtres: null }),
  e('interets', 'declaration-camille-2022', 'Déclaration d’intérêts de Camille Exemple', 'HATVP · août 2022', 'énergie déclaration', personne(P.camille.id), G.A),
];

const mots = (q: string) => normaliser(q).match(/[\p{L}\p{N}]+/gu) ?? [];

const correspond = (x: Entree, q: string | null) => {
  if (!q) return true;
  const texte = normaliser(`${x.r.titre} ${x.r.contexte} ${x.motsCles}`);
  return mots(q).every((m) => texte.includes(m));
};

/** Entrées visibles : `exclus`, des identifiants retirés de la source (adaptateur mémoire, G2). */
const visibles = (exclus: ReadonlySet<string>) =>
  exclus.size ? CATALOGUE.filter((x) => ![...exclus].some((id) => JSON.stringify(x.r).includes(`"${id}"`))) : CATALOGUE;

export function comptesCatalogue(
  q: string | null,
  declinaisons: DeclinaisonRecherche[],
  exclus: ReadonlySet<string> = new Set(),
): Partial<Record<DeclinaisonRecherche, CompteRecherche>> {
  return Object.fromEntries(
    declinaisons.map((d) => {
      const n = visibles(exclus).filter((x) => x.r.declinaison === d && correspond(x, q)).length;
      return [d, { nombre: Math.min(n, PLAFOND_COMPTE), plafonne: n > PLAFOND_COMPTE }];
    }),
  );
}

export function sectionCatalogue(
  q: string | null,
  d: DeclinaisonRecherche,
  { page, taille }: { page: number; taille: number },
  exclus: ReadonlySet<string> = new Set(),
): Page<ResultatFamille> {
  const tous = visibles(exclus).filter((x) => x.r.declinaison === d && correspond(x, q)).map((x) => x.r);
  return { elements: tous.slice((page - 1) * taille, page * taille), page, taille, total: tous.length, suivante: page * taille < tous.length ? page + 1 : null };
}

export function candidatsCatalogue(numero: NumeroOfficiel, exclus: ReadonlySet<string> = new Set()): ResultatFamille[] {
  return visibles(exclus).filter((x) => x.numero && numeroComparable(x.numero.valeur) === numero.numero && (numero.cibles as string[]).includes(x.numero.cible)).map((x) => x.r);
}

const DECLINAISONS = [...famillesDe.keys()];

/** Ce que l'API rend pour cette demande (page 1, taille 20 par défaut, comme `borner`). */
export function rechercheFixture(demande: DemandeFamilles, page = 1, taille = 20): ResultatFamilles {
  const plan = planRecherche(demande, { page, taille });
  return assemblerRecherche(demande, plan, {
    comptes: comptesCatalogue(plan.q, DECLINAISONS),
    sections: Object.fromEntries(plan.declinaisons.map((d) => [d, sectionCatalogue(plan.q, d, plan)])),
    candidats: plan.numero ? candidatsCatalogue(plan.numero) : null,
  });
}

export const EXEMPLES_FAMILLES: { titre: string; input: DemandeFamilles }[] = [
  { titre: 'Parcourir : toutes les familles', input: {} },
  { titre: '« énergie », toutes les familles', input: { q: 'énergie' } },
  { titre: '« énergie » · Personnes › Députés', input: { q: 'énergie', famille: 'personnes', declinaisons: ['deputes'] } },
  { titre: 'Un numéro : résultat exact (CE123)', input: { q: 'CE123' } },
  { titre: 'Un numéro ambigu : deux amendements n° 655', input: { q: '655' } },
  { titre: 'Une commission d’enquête', input: { q: 'commission d’enquête' } },
  { titre: 'Aucun résultat', input: { q: 'zzzz' } },
];
