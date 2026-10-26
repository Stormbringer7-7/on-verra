// Modèle de lecture de l'app (Panoptique v2) : les DTO de chaque écran, indépendants du schéma
// opendata. Le dossier législatif est l'objet central ; chaque fait porte sa source, chaque
// rapprochement son statut (cf. commun.ts). Découpé par contexte :
//
//   commun        Provenance, Rapprochement, Lien, Indicateur, Synthese, Page, références courtes
//   parcours      barre de parcours (projection lecture.parcours_dossier)
//   dossiers      Accueil, Dossiers, Dossier, Étape, Article, Amendement
//   avancement    Où en sont les textes (engorgement, attentes hors du Parlement)
//   discussions   interventions (Qui intervient, ce qui a été dit)
//   faits         faits filtrés (Explorer : filtres → compteurs, faits regroupés, suggestions)
//   scrutins      Scrutin (AN et Sénat), Pourquoi ce vote
//   personnes     Personnes (annuaire, classements), Personne
//   institutions  AN, Sénat, Gouvernement, Conseil constitutionnel
//   transparence  déclarations HATVP, représentants d'intérêts
//   territoires   Carte (scrutin, présence par département), Département
//   recherche     Recherche, signalement
//   suivis        Mes suivis (ce qui a bougé, sans état côté serveur)
//   familles      Recherche par familles (design v4 : familles, déclinaisons, numéros officiels)

export * from './avancement';
export * from './commun';
export * from './discussions';
export * from './dossiers';
export * from './faits';
export * from './familles';
export * from './institutions';
export * from './parcours';
export * from './personnes';
export * from './recherche';
export * from './scrutins';
export * from './suivis';
export * from './territoires';
export * from './transparence';
