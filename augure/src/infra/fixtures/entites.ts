// Entités fictives du canevas « Panoptique v2 » (données de maquette), partagées par les fixtures :
// groupes, personnes, dossiers, provenances. Tout est fictif : noms, groupes, numéros, URL
// (domaine réservé `.invalid`). Aucune adresse, aucune date de naissance.

import type {
  AmendementRef,
  ArticleRef,
  CaseCompacte,
  CleCase,
  DossierRef,
  EtatCase,
  GroupeRef,
  Orateur,
  PersonneRef,
  Provenance,
  Systeme,
} from '../../core/domain/model';

export const AUJOURDHUI = '2026-10-24';

export function prov(systeme: Systeme, type: string, idNatif: string, url: string | null = null): Provenance {
  return { systeme, type, idNatif, url };
}

/** Page officielle fictive (domaine réservé : ne mène nulle part). */
export const lienFictif = (chemin: string) => `https://panoptique.invalid/${chemin}`;

// ---------- Groupes ----------

const groupe = (id: string, abrege: string, libelle: string, couleur: string, chambre: 'AN' | 'SENAT'): GroupeRef => ({
  id,
  abrege,
  libelle,
  couleur,
  chambre,
});

export const G = {
  A: groupe('groupe-a', 'A', 'Groupe A', '#7aa2f7', 'AN'),
  B: groupe('groupe-b', 'B', 'Groupe B', '#e0af68', 'AN'),
  C: groupe('groupe-c', 'C', 'Groupe C', '#9ece6a', 'AN'),
  D: groupe('groupe-d', 'D', 'Groupe D', '#bb9af7', 'AN'),
  E: groupe('groupe-e', 'E', 'Groupe E', '#f7768e', 'AN'),
  F: groupe('groupe-f', 'F', 'Groupe F', '#4fd6be', 'AN'),
  NI: groupe('groupe-ni-an', 'NI', 'Non-inscrits', '#8c9a93', 'AN'),
  S1: groupe('groupe-s1', 'S1', 'Groupe S1', '#c0caf5', 'SENAT'),
  S2: groupe('groupe-s2', 'S2', 'Groupe S2', '#f6c177', 'SENAT'),
  S3: groupe('groupe-s3', 'S3', 'Groupe S3', '#9ccfd8', 'SENAT'),
  S4: groupe('groupe-s4', 'S4', 'Groupe S4', '#eb6f92', 'SENAT'),
  NIS: groupe('groupe-ni-senat', 'NI', 'Non-inscrits', '#8c9a93', 'SENAT'),
};

/** De la gauche vers la droite. */
export const GROUPES_AN = [G.A, G.B, G.C, G.D, G.E, G.F, G.NI];
export const GROUPES_SENAT = [G.S1, G.S2, G.S3, G.S4, G.NIS];

// ---------- Personnes ----------

const pers = (id: string, nom: string, fonction: string | null, g: GroupeRef | null): PersonneRef => ({
  id,
  nom,
  fonction,
  groupe: g,
});

export const P = {
  camille: pers('camille-exemple', 'Camille Exemple', 'Députée · Groupe A', G.A),
  claire: pers('claire-exemple', 'Claire Exemple', 'Ministre de la Transition énergétique', null),
  pierre: pers('pierre-modele', 'Pierre Modèle', 'Sénateur · Groupe S1', G.S1),
  ines: pers('ines-modele', 'Inès Modèle', 'Députée · Groupe C', G.C),
  paul: pers('paul-fictif', 'Paul Fictif', 'Sénateur · Groupe S2', G.S2),
  hugo: pers('hugo-fictif', 'Hugo Fictif', 'Député · Groupe B', G.B),
  nadia: pers('nadia-specimen', 'Nadia Specimen', 'Maire de [COMMUNE]', null),
  louis: pers('louis-prototype', 'Louis Prototype', 'Député · Groupe A', G.A),
  sarah: pers('sarah-brouillon', 'Sarah Brouillon', 'Ministre déléguée au Logement', null),
  lea: pers('lea-ebauche', 'Léa Ébauche', 'Députée · Groupe F', G.F),
  karim: pers('karim-gabarit', 'Karim Gabarit', 'Député · Groupe C', G.C),
  paulM: pers('paul-maquette', 'Paul Maquette', 'Député · Groupe B', G.B),
};

/** Même personne, avec la fonction du contexte. */
export const comme = (p: PersonneRef, fonction: string): PersonneRef => ({ ...p, fonction });

export const orateur = (p: PersonneRef, qualite: string | null = null): Orateur => ({ type: 'personne', personne: p, qualite });

// ---------- Dossiers ----------

export const D = {
  energie: { id: 'dossier-energie', titre: 'Programmation énergétique 2026-2035' } satisfies DossierRef,
  location: { id: 'dossier-location', titre: 'Régulation des meublés de tourisme' } satisfies DossierRef,
  budget: { id: 'dossier-budget', titre: 'Projet de loi de finances pour 2027' } satisfies DossierRef,
  medecins: { id: 'dossier-medecins', titre: 'Accès aux soins' } satisfies DossierRef,
  epargne: { id: 'dossier-epargne', titre: 'Compte épargne-temps universel' } satisfies DossierRef,
  video: { id: 'dossier-video', titre: 'Vidéoprotection algorithmique' } satisfies DossierRef,
  ia: { id: 'dossier-ia', titre: 'Adaptation au règlement européen sur l’IA' } satisfies DossierRef,
};

export const A = {
  ce123: { id: 'amdt-ce123', numero: 'CE123', chambre: 'AN' } satisfies AmendementRef,
  ce88: { id: 'amdt-ce88', numero: 'CE88', chambre: 'AN' } satisfies AmendementRef,
  n655: { id: 'amdt-655', numero: '655', chambre: 'AN' } satisfies AmendementRef,
  n1876: { id: 'amdt-1876', numero: '1876', chambre: 'AN' } satisfies AmendementRef,
  n1902: { id: 'amdt-1902', numero: '1902', chambre: 'AN' } satisfies AmendementRef,
  n2051: { id: 'amdt-2051', numero: '2051', chambre: 'AN' } satisfies AmendementRef,
  com56: { id: 'amdt-com56', numero: 'COM-56', chambre: 'SENAT' } satisfies AmendementRef,
  s412: { id: 'amdt-s412', numero: '412', chambre: 'SENAT' } satisfies AmendementRef,
  s87: { id: 'amdt-s87', numero: '87', chambre: 'SENAT' } satisfies AmendementRef,
  ce40: { id: 'amdt-ce40', numero: 'CE40', chambre: 'AN' } satisfies AmendementRef,
  com12: { id: 'amdt-com12', numero: 'COM-12', chambre: 'SENAT' } satisfies AmendementRef,
  n33: { id: 'amdt-33', numero: '33', chambre: 'AN' } satisfies AmendementRef,
  s9: { id: 'amdt-s9', numero: '9', chambre: 'SENAT' } satisfies AmendementRef,
  s4: { id: 'amdt-s4', numero: '4', chambre: 'SENAT' } satisfies AmendementRef,
  n51: { id: 'amdt-51', numero: '51', chambre: 'AN' } satisfies AmendementRef,
};

export const ART = {
  e1: { id: 'art-energie-1', numero: '1er' } satisfies ArticleRef,
  e3: { id: 'art-energie-3', numero: '3' } satisfies ArticleRef,
  e5: { id: 'art-energie-5', numero: '5' } satisfies ArticleRef,
  e8: { id: 'art-energie-8', numero: '8' } satisfies ArticleRef,
  e11: { id: 'art-energie-11', numero: '11' } satisfies ArticleRef,
  e14bis: { id: 'art-energie-14bis', numero: '14 bis' } satisfies ArticleRef,
  l2: { id: 'art-location-2', numero: '2' } satisfies ArticleRef,
  l4: { id: 'art-location-4', numero: '4' } satisfies ArticleRef,
  l6: { id: 'art-location-6', numero: '6' } satisfies ArticleRef,
  l7: { id: 'art-location-7', numero: '7' } satisfies ArticleRef,
};

// ---------- Barres de parcours ----------

type Ligne = [CleCase, string, EtatCase, boolean?];
const barre = (lignes: Ligne[]): CaseCompacte[] =>
  lignes.map(([cle, libelle, etat, courante]) => ({ cle, libelle, etat, courante: courante ?? false }));

/** Procédure accélérée, CMP conclusive, Conseil constitutionnel saisi (en cours). */
export const BARRE_ENERGIE = barre([
  ['depot', 'Dépôt', 'faite'],
  ['commission_1_o', 'Commission AN', 'faite'],
  ['seance_1_o', 'Séance AN', 'faite'],
  ['commission_1_s', 'Commission Sénat', 'faite'],
  ['seance_1_s', 'Séance Sénat', 'faite'],
  ['lecture_2_o', '2e lecture AN', 'sans_objet'],
  ['lecture_2_s', '2e lecture Sénat', 'sans_objet'],
  ['cmp', 'CMP', 'faite'],
  ['conclusions_cmp', 'Vote du texte de la CMP', 'faite'],
  ['nouvelle_lecture', 'Nouvelle lecture', 'sans_objet'],
  ['lecture_definitive', 'Lecture définitive AN', 'sans_objet'],
  ['cc', 'Conseil constit.', 'en_cours', true],
  ['promulgation', 'Promulgation', 'a_venir'],
  ['jo', 'Journal officiel', 'a_venir'],
]);

/** Navette normale, deux lectures, CMP en échec, dernier mot à l'AN (programmé). */
export const BARRE_LOCATION = barre([
  ['depot', 'Dépôt', 'faite'],
  ['lecture_1_o', '1re lecture AN', 'faite'],
  ['lecture_1_s', '1re lecture Sénat', 'faite'],
  ['lecture_2_o', '2e lecture AN', 'faite'],
  ['lecture_2_s', '2e lecture Sénat', 'faite'],
  ['cmp', 'CMP', 'faite'],
  ['conclusions_cmp', 'Vote du texte de la CMP', 'sans_objet'],
  ['nouvelle_lecture', 'Nouvelle lecture', 'faite'],
  ['lecture_definitive', 'Lecture définitive AN', 'a_venir', true],
  ['cc', 'Conseil constit.', 'a_venir'],
  ['promulgation_jo', 'Promulgation et JO', 'a_venir'],
]);

export const BARRE_BUDGET = barre([
  ['depot', 'Dépôt', 'faite'],
  ['lecture_1_o', '1re lecture AN', 'en_cours', true],
  ['lecture_1_s', '1re lecture Sénat', 'a_venir'],
  ['lecture_2_o', '2e lecture AN', 'a_venir'],
  ['lecture_2_s', '2e lecture Sénat', 'a_venir'],
  ['cmp', 'CMP', 'a_venir'],
  ['conclusions_cmp', 'Vote du texte de la CMP', 'a_venir'],
  ['nouvelle_lecture', 'Nouvelle lecture', 'a_venir'],
  ['lecture_definitive', 'Lecture définitive AN', 'a_venir'],
  ['cc', 'Conseil constit.', 'a_venir'],
  ['promulgation_jo', 'Promulgation et JO', 'a_venir'],
]);

export const BARRE_MEDECINS = barre([
  ['depot', 'Dépôt', 'faite'],
  ['lecture_1_o', '1re lecture Sénat', 'faite'],
  ['lecture_1_s', '1re lecture AN', 'faite'],
  ['lecture_2_o', '2e lecture Sénat', 'faite'],
  ['lecture_2_s', '2e lecture AN', 'faite'],
  ['cmp', 'CMP', 'sans_objet'],
  ['conclusions_cmp', 'Vote du texte de la CMP', 'sans_objet'],
  ['nouvelle_lecture', 'Nouvelle lecture', 'sans_objet'],
  ['lecture_definitive', 'Lecture définitive AN', 'sans_objet'],
  ['cc', 'Conseil constit.', 'faite'],
  ['promulgation_jo', 'Promulgation et JO', 'faite'],
]);
